<?php

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectManager;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| An UNVERIFIED professional may not bid
|--------------------------------------------------------------------------
|
| Regression suite for a MEDIUM audit finding, and the direct counterpart to the
| CRITICAL registration fix.
|
| `register()` was fixed so new profiles are created `pending` rather than
| `verified`. That stops them appearing in the public directories -- but
| `submitBid()` only ever tested the ROLE:
|
|     if (!in_array($user->role_type, [
|         'arsitek', 'kontraktor', 'notaris', 'interior',
|         'structural', 'mep', 'project_manager',
|     ])) {
|         return ...'Only verified professionals can submit bids.', 403;
|     }
#
| The message says "verified". The condition never checked verification. So an
| unverified account could bid, appear in the owner's shortlist, and be chosen --
# leaving the product's central promise resting on a server-side gate that was
# not there.
|
| The gate uses `Hire::profileIdFor()`, which already encodes the PM special case
| (`projects.pm_id` stores a USER id, every other role a PROFILE id), so no second
| role map is introduced.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function bidUser(string $roleType, string $tag, string $verification = 'verified'): User
{
    $user = User::create([
        'name' => "$roleType $tag", 'username' => "u_$tag" . uniqid(),
        'email' => "e_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $roleType,
    ]);

    $model = match ($roleType) {
        'arsitek' => Arsitek::class,
        'kontraktor' => Kontraktor::class,
        'structural' => StructuralEngineer::class,
        'project_manager' => ProjectManager::class,
    };

    $model::create([
        'user_id' => $user->id, 'nama' => "Firm $tag",
        'verification_status' => $verification,
    ]);

    return $user;
}

function bidProject(string $tag): Project
{
    $owner = User::create([
        'name' => "Owner $tag", 'username' => "own_$tag" . uniqid(),
        'email' => "own_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    return Project::create([
        'title' => "Job $tag", 'user_id' => $owner->id,
        'budget' => 400_000_000, 'status' => 'open',
        'target_role' => 'both',
        'published_bidding_roles' => ['arsitek', 'kontraktor'],
    ]);
}

function bidPayload(Project $project): array
{
    return [
        'price' => 25_000_000,
        'proposal' => 'We have completed twelve projects of this scale.',
        'fee_type' => 'fixed',
        'estimated_duration' => 8,
        'duration_unit' => 'weeks',
    ];
}

it('refuses a bid from a PENDING architect', function () {
    $pro = bidUser('arsitek', 'pend', 'pending');
    $project = bidProject('pend1');

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/bids", bidPayload($project))
        ->assertStatus(403);

    expect(\App\Models\BidArsitek::where('project_id', $project->id)->count())->toBe(0);
});

it('refuses a bid from a REJECTED professional', function () {
    // A rejected professional must not be able to re-enter by simply bidding.
    $pro = bidUser('kontraktor', 'rej', 'rejected');
    $project = bidProject('rej1');

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/bids", bidPayload($project))
        ->assertStatus(403);

    expect(\App\Models\BidKontraktor::where('project_id', $project->id)->count())->toBe(0);
});

it('refuses a bid from a role-holder with NO profile row at all', function () {
    // `role_type` is settable without a profile (AdminUserController::updateRole),
    // so the role check alone is not sufficient evidence of anything.
    $pro = User::create([
        'name' => 'Ghost', 'username' => 'ghost' . uniqid(),
        'email' => 'ghost' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    $project = bidProject('ghost1');

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/bids", bidPayload($project))
        ->assertStatus(403);

    expect(\App\Models\BidArsitek::where('project_id', $project->id)->count())->toBe(0);
});

it('still accepts a bid from a VERIFIED professional', function () {
    // The gate must not become a blanket denial.
    $pro = bidUser('arsitek', 'ok');
    $project = bidProject('ok1');

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/bids", bidPayload($project))
        ->assertStatus(200);

    expect(\App\Models\BidArsitek::where('project_id', $project->id)->count())->toBe(1);
});

it('tells an unverified professional why, rather than returning a bare 403', function () {
    $pro = bidUser('arsitek', 'msg', 'pending');
    $project = bidProject('msg1');

    $response = $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/bids", bidPayload($project))
        ->assertStatus(403);

    expect($response->json('message'))->toContain('verification');
});

it('applies the same gate to every licensed role', function (string $roleType) {
    $pro = bidUser($roleType, "all_$roleType", 'pending');
    $project = bidProject("all_$roleType");

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/bids", bidPayload($project))
        ->assertStatus(403);
})->with(['arsitek', 'kontraktor', 'structural', 'project_manager']);

it('persists the architect\'s chosen design STYLE', function () {
    // Found while writing this suite, and worth its own assertion.
    //
    // `submitBid()` writes `'style' => $request->style`, and both `bids_arsitek`
    // and `bids_interior` have a `style` column -- but neither model's `$fillable`
    // listed it. Under `Model::shouldBeStrict(!isProduction())` that is a 500 in
    // development and a SILENTLY DISCARDED VALUE in production, so the architect's
    // chosen style was never stored for any real user.
    $pro = bidUser('arsitek', 'style');
    $project = bidProject('style1');

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/bids", bidPayload($project) + [
            'style' => 'Modern Minimalis',
        ])
        ->assertStatus(200);

    expect(\App\Models\BidArsitek::where('project_id', $project->id)->first()->style)
        ->toBe('Modern Minimalis');
});

it('resolves the PM by USER id, the way projects.pm_id stores it', function () {
    // SPECIAL CASE: `projects.pm_id` holds a USER id while every other
    // `selected_*` column holds a PROFILE id. Conflating them would read the
    // wrong row's verification status.
    $pm = bidUser('project_manager', 'pmcase', 'pending');
    $project = bidProject('pmcase1');

    // Pending: refused, and for the RIGHT REASON -- the verification gate.
    $refused = $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/bids", bidPayload($project))
        ->assertStatus(403);

    expect($refused->json('message'))->toContain('verification');

    // Verified: the gate must be passed. Whether this particular project then
    // accepts a PM bid is a separate eligibility rule, so the assertion is that
    // the refusal is no longer about verification -- which is what proves the
    // lookup found the PM's real profile row.
    $pm->project_manager->update(['verification_status' => 'verified']);
    $pm->unsetRelation('project_manager'); // cached across requests in one test
    $pm->load('project_manager');

    $after = $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/bids", bidPayload($project));

    expect($after->json('message') ?? '')->not->toContain('verification');
});