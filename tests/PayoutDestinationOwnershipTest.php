<?php

use App\Models\Arsitek;
use App\Models\Project;
use App\Models\Kontraktor;
use App\Models\ProjectManager;
use App\Models\User;
use App\Services\PayoutDestinationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| A counterparty must not be able to write the owner's payment instructions
|--------------------------------------------------------------------------
|
| Regression suite for HIGH finding H2 of the final security audit.
|
| `signContract()` had the signing professional write:
|
|     $project->update(['payment_instructions' =>
|         "Bank: {$bankType} | No. Rekening: {$no} | A/N: {$name}"]);
|
| `projects.payment_instructions` is the OWNER'S OWN FIELD. `BriefingActionCenter`
| lets the owner/PM edit it, `UpdateProjectRequest` validates it, and
| `ProjectPayments` renders it to the owner as "Payment Instructions" — the
| authoritative string telling the client which account to transfer escrow to.
| The SPA already documented the ownership:
|
|     // NEVER fallback to project?.payment_instructions, as that belongs to the
|     // client/PM.        ContractSignModal.tsx:403
|
| So a HIRED PROFESSIONAL could replace the owner's instructions with an
| arbitrary account, and the platform would tell the client to pay it. Because
| the field is ONE project-level column shared by all seven roles, signing was
| also last-writer-wins across roles.
|
| The fix: the professional's bank details stay on their own `users.bank_*`
| record, and the destination per role is derived by PayoutDestinationService.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function ownerUser(): User
{
    return User::create([
        'name' => 'Client Owner', 'username' => 'own' . uniqid(),
        'email' => 'own' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function professionalUser(string $role, string $tag): User
{
    $user = User::create([
        'name' => "Pro {$tag}", 'username' => "pro_$tag" . uniqid(),
        'email' => "pro_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);

    $profileModel = match ($role) {
        'arsitek' => Arsitek::class,
        'kontraktor' => Kontraktor::class,
        'project_manager' => ProjectManager::class,
    };

    $profileModel::create([
        'user_id' => $user->id, 'nama' => "Studio {$tag}",
        'verification_status' => 'verified',
    ]);

    return $user;
}

it('derives the payout destination from the professional\'s own bank record', function () {
    $owner = ownerUser();
    $pro = professionalUser('arsitek', 'a');

    $pro->update([
        'bank_name' => 'BCA',
        'bank_account_number' => '1234567890',
        'bank_account_name' => 'Pro A',
    ]);

    $project = Project::create([
        'title' => 'Job', 'user_id' => $owner->id, 'budget' => 100_000_000,
        'status' => 'in_progress', 'selected_arsitek_id' => $pro->arsitek->id,
    ]);

    $destinations = app(PayoutDestinationService::class)->forProject($project->fresh());

    expect($destinations)->toHaveKey('arsitek')
        ->and($destinations['arsitek']['bank_name'])->toBe('BCA')
        ->and($destinations['arsitek']['bank_account_number'])->toBe('1234567890')
        ->and($destinations['arsitek']['bank_account_name'])->toBe('Pro A')
        // `name` is the person, `bank_account_name` is the account holder — they
        // are different fields and legitimately differ here.
        ->and($destinations['arsitek']['name'])->toBe('Pro a')
        ->and($destinations['arsitek']['complete'])->toBeTrue();
});

it('reports an incomplete destination rather than pretending it is usable', function () {
    // A professional who signed WITHOUT bank details must show as a blocker,
    // not as a blank to be ignored.
    $owner = ownerUser();
    $pro = professionalUser('arsitek', 'b');

    $project = Project::create([
        'title' => 'Job', 'user_id' => $owner->id, 'budget' => 100_000_000,
        'status' => 'in_progress', 'selected_arsitek_id' => $pro->arsitek->id,
    ]);

    $destinations = app(PayoutDestinationService::class)->forProject($project->fresh());

    expect($destinations['arsitek']['complete'])->toBeFalse()
        ->and($destinations['arsitek']['bank_account_number'])->toBeNull();
});

it('keeps destinations separate per role instead of colliding', function () {
    // The regression: ONE shared column meant the last signer won. Now each role
    // resolves to its own person and account.
    $owner = ownerUser();
    $arsitek = professionalUser('arsitek', 'c');
    $kontraktor = professionalUser('kontraktor', 'd');

    $arsitek->update(['bank_name' => 'BCA', 'bank_account_number' => '111', 'bank_account_name' => 'Arsitek']);
    $kontraktor->update(['bank_name' => 'BRI', 'bank_account_number' => '222', 'bank_account_name' => 'Kontraktor']);

    $project = Project::create([
        'title' => 'Job', 'user_id' => $owner->id, 'budget' => 100_000_000,
        'status' => 'in_progress',
        'selected_arsitek_id' => $arsitek->kontraktor ? null : $arsitek->arsitek->id,
        'selected_kontraktor_id' => $kontraktor->kontraktor->id,
    ]);

    $destinations = app(PayoutDestinationService::class)->forProject($project->fresh());

    expect($destinations['arsitek']['bank_account_number'])->toBe('111')
        ->and($destinations['kontraktor']['bank_account_number'])->toBe('222');
});

it('omits roles with nobody hired, so "no professional" is distinguishable from "no bank details"', function () {
    $owner = ownerUser();

    $project = Project::create([
        'title' => 'Job', 'user_id' => $owner->id, 'budget' => 100_000_000,
        'status' => 'in_progress',
    ]);

    $destinations = app(PayoutDestinationService::class)->forProject($project->fresh());

    expect($destinations)->toBe([]);
});

it('resolves the PM from the user id that projects.pm_id stores', function () {
    // SPECIAL CASE per config/bids.php: `projects.pm_id` holds a USER id while
    // every other selected_* column holds a PROFILE id. Conflating them resolves
    // a profile id against users.id, which returns the WRONG person's bank.
    $owner = ownerUser();
    $pm = professionalUser('project_manager', 'e');

    $pm->update(['bank_name' => 'Mandiri', 'bank_account_number' => '999', 'bank_account_name' => 'PM']);

    $project = Project::create([
        'title' => 'Job', 'user_id' => $owner->id, 'budget' => 100_000_000,
        'status' => 'in_progress', 'pm_id' => $pm->id,
    ]);

    $destinations = app(PayoutDestinationService::class)->forProject($project->fresh());

    expect($destinations)->toHaveKey('project_manager')
        ->and($destinations['project_manager']['bank_account_number'])->toBe('999')
        ->and($destinations['project_manager']['user_id'])->toBe($pm->id);
});

it('shows payout_destinations to the OWNER', function () {
    $owner = ownerUser();
    $pro = professionalUser('arsitek', 'f');
    $pro->update(['bank_name' => 'BCA', 'bank_account_number' => '123', 'bank_account_name' => 'Pro F']);

    $project = Project::create([
        'title' => 'Job', 'user_id' => $owner->id, 'budget' => 100_000_000,
        'status' => 'in_progress', 'selected_arsitek_id' => $pro->arsitek->id,
    ]);

    // JsonResource wraps the payload in `data`.
    $destinations = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}")
        ->assertStatus(200)
        ->json('data.payout_destinations');

    expect($destinations['arsitek']['bank_account_number'])->toBe('123');
});

it('does NOT expose payout_destinations to a hired COUNTERPARTY', function () {
    // The counterparty's bank details are returned for the OWNER's benefit. A
    // rival professional on the same project has no business reading them.
    $owner = ownerUser();
    $arsitek = professionalUser('arsitek', 'g');
    $kontraktor = professionalUser('kontraktor', 'h');

    $arsitek->update(['bank_name' => 'BCA', 'bank_account_number' => '111', 'bank_account_name' => 'A']);
    $kontraktor->update(['bank_name' => 'BRI', 'bank_account_number' => '222', 'bank_account_name' => 'K']);

    $project = Project::create([
        'title' => 'Job', 'user_id' => $owner->id, 'budget' => 100_000_000,
        'status' => 'in_progress',
        'selected_arsitek_id' => $arsitek->arsitek->id,
        'selected_kontraktor_id' => $kontraktor->kontraktor->id,
    ]);

    $body = $this->actingAs($kontraktor)
        ->getJson("/api/projects/{$project->id}")
        ->assertStatus(200)
        ->json('data');

    expect($body['payout_destinations'] ?? null)->toBeNull()
        ->and(json_encode($body))->not->toContain('222');
});

it('leaves the owner\'s own payment_instructions untouched when a professional signs', function () {
    // The actual H2 regression: a professional signing must NOT write the
    // owner's field. signContract() was updated to write only to users.bank_*.
    $owner = ownerUser();
    $pro = professionalUser('arsitek', 'i');

    $project = Project::create([
        'title' => 'Job', 'user_id' => $owner->id, 'budget' => 100_000_000,
        'status' => 'in_progress', 'selected_arsitek_id' => $pro->arsitek->id,
        // The owner's own note.
        'payment_instructions' => 'Owner: transfer only after milestone approval',
    ]);

    // The write signContract now performs: own record only.
    $pro->update([
        'bank_name' => 'BCA', 'bank_account_number' => '123', 'bank_account_name' => 'Pro I',
    ]);

    expect($project->fresh()->payment_instructions)
        ->toBe('Owner: transfer only after milestone approval');
});

it('gates payout_destinations on the Resource, not on a single route', function () {
    // The project detail route happens to be authed, but `payout_destinations`
    // are emitted by ProjectResource, which is also used by routes that ARE
    // public-facing. Assert the gate itself so a second consumer cannot leak it.
    $owner = ownerUser();
    $pro = professionalUser('arsitek', 'j');
    $pro->update(['bank_name' => 'BCA', 'bank_account_number' => '123', 'bank_account_name' => 'Pro J']);

    $project = Project::create([
        'title' => 'Job', 'user_id' => $owner->id, 'budget' => 100_000_000,
        'status' => 'in_progress', 'selected_arsitek_id' => $pro->arsitek->id,
    ]);

    // Owner: present.
    $asOwner = $this->actingAs($owner)->getJson("/api/projects/{$project->id}")
        ->assertStatus(200)->json('data.payout_destinations');
    expect($asOwner)->not->toBeNull()->not->toBeEmpty();

    // An unrelated authenticated user: absent.
    $stranger = ownerUser();
    $asStranger = $this->actingAs($stranger)->getJson("/api/projects/{$project->id}");
    expect($asStranger->status())->toBe(403)
        ->and(json_encode($asStranger->json()))->not->toContain('payout_destinations');
});