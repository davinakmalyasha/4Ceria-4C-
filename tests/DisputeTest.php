<?php

use App\Exceptions\DisputeException;
use App\Models\DisputeMessage;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectDispute;
use App\Models\ProjectManager;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Project disputes: open, thread, reply and withdraw
|--------------------------------------------------------------------------
|
| - participants open ONE dispute per project (409 on the second) and the
|   opener, the PM's USER (projects.pm_id is a profile id — the fan-out used
|   to target the profile id) and the admins are told;
| - the thread renders opener {id,name,pic}, resolver {id,name} and each
|   message with its author;
| - replies require an OPEN dispute; evidence is stored on the vault disk
|   and the answer is the CREATED message with its user;
| - only the opener (or an admin) withdraws, which closes the thread.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function dpOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "dpown_$tag" . uniqid(),
        'email' => "dpown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function dpContractor(string $tag): User
{
    $user = User::create([
        'name' => "Kon $tag", 'username' => "dpk_$tag" . uniqid(),
        'email' => "dpk_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    Kontraktor::create(['user_id' => $user->id, 'nama' => "Build $tag"]);

    return $user;
}

function dpPM(string $tag): User
{
    $user = User::create([
        'name' => "PM $tag", 'username' => "dppm_$tag" . uniqid(),
        'email' => "dppm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);
    ProjectManager::create(['user_id' => $user->id, 'nama' => "PM $tag", 'no_telp' => '081200000002']);

    return $user;
}

function dpProject(User $owner, User $kon, User $pm, string $tag): Project
{
    return Project::create([
        'title' => "Disputes $tag", 'user_id' => $owner->id,
        'budget' => 120_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'selected_kontraktor_id' => $kon->kontraktor->id,
        'pm_id' => $pm->project_manager->id,
    ]);
}

it('opens one dispute, notifies the PM user and refuses a second', function () {
    $owner = dpOwner('open');
    $kon = dpContractor('open');
    $pm = dpPM('open');
    $project = dpProject($owner, $kon, $pm, 'open');

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/disputes", [
            'category' => 'payment', 'title' => 'Unpaid DP',
            'description' => 'termin not released', 'disputed_amount' => 2_500_000,
            'payment_type' => 'termin', 'payment_id' => 900021255,
        ])
        ->assertStatus(201)
        ->assertJsonPath('message', 'Dispute opened. All project payments are frozen until an admin resolves it.');

    expect(array_keys($response->json('data')))->toBe([
        'project_id', 'opened_by', 'termination_id', 'category', 'title', 'description',
        'disputed_amount', 'payment_type', 'payment_id', 'status', 'updated_at', 'created_at', 'id',
    ]);
    expect($response->json('data.disputed_amount'))->toBe(2500000);
    expect($response->json('data.payment_type'))->toBe('termin');

    $dispute = ProjectDispute::where('project_id', $project->id)->sole();
    expect($dispute->status)->toBe('open');

    // The PM's USER id, not the profile id.
    expect(\App\Models\Notification::where('user_id', $pm->id)->where('type', 'dispute_opened')->count())->toBe(1);
    expect(\App\Models\Notification::where('user_id', $pm->project_manager->id)->count())->toBe(0);

    $log = \App\Models\ProjectActivityLog::where('project_id', $project->id)->latest('id')->first();
    expect($log->action)->toBe('dispute_opened');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/disputes", ['category' => 'other', 'title' => 'Again', 'description' => 'x'])
        ->assertStatus(409);

    // The freeze gate now refuses payment paths.
    expect(fn () => app(\App\Services\DisputeService::class)->assertNoOpenDispute($project->fresh()))
        ->toThrow(Exception::class);
});

it('lists and shows the dispute with its thread', function () {
    $owner = dpOwner('list');
    $kon = dpContractor('list');
    $pm = dpPM('list');
    $project = dpProject($owner, $kon, $pm, 'list');

    $dispute = ProjectDispute::create([
        'project_id' => $project->id, 'opened_by' => $owner->id,
        'category' => 'quality', 'title' => 'Cracked wall', 'description' => 'x', 'status' => 'open',
    ]);
    DisputeMessage::create([
        'dispute_id' => $dispute->id, 'user_id' => $kon->id, 'body' => 'looking into it',
    ]);

    $list = $this->actingAs($kon)
        ->getJson("/api/projects/{$project->id}/disputes")
        ->assertStatus(200);

    expect($list->json('data.0.opener'))->toBe(['id' => $owner->id, 'name' => $owner->name, 'pic' => null]);
    expect($list->json('data.0.resolver'))->toBeNull();
    expect($list->json('data.0.messages.0.body'))->toBe('looking into it');
    expect($list->json('data.0.messages.0.user.id'))->toBe($kon->id);

    $show = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/disputes/{$dispute->id}")
        ->assertStatus(200);

    expect($show->json('data.title'))->toBe('Cracked wall');
    expect($show->json('data.messages.0.user.name'))->toBe($kon->name);

    $stranger = dpOwner('out');
    $this->actingAs($stranger)
        ->getJson("/api/projects/{$project->id}/disputes")
        ->assertStatus(403);
});

it('replies with evidence while open and refuses after closure', function () {
    Storage::fake('public');
    $owner = dpOwner('reply');
    $kon = dpContractor('reply');
    $pm = dpPM('reply');
    $project = dpProject($owner, $kon, $pm, 'reply');
    $dispute = ProjectDispute::create([
        'project_id' => $project->id, 'opened_by' => $owner->id,
        'category' => 'payment', 'title' => 'Unpaid', 'description' => 'x', 'status' => 'open',
    ]);

    $response = $this->actingAs($kon)
        ->post("/api/projects/{$project->id}/disputes/{$dispute->id}/reply", [
            'body' => 'proof attached',
            'evidence' => UploadedFile::fake()->image('proof.png'),
        ])
        ->assertStatus(201)
        ->assertJsonPath('message', 'Message posted.');

    expect(array_keys($response->json('data')))->toBe([
        'dispute_id', 'user_id', 'body', 'evidence_path', 'evidence_original_name',
        'updated_at', 'created_at', 'id', 'user',
    ]);
    expect($response->json('data.evidence_path'))->toStartWith("disputes/{$dispute->id}/");
    expect($response->json('data.evidence_original_name'))->toBe('proof.png');
    expect($response->json('data.user.name'))->toBe($kon->name);

    $message = DisputeMessage::where('dispute_id', $dispute->id)->sole();
    expect($message->evidence_path)->not->toBeNull();
    expect($message->body)->toBe('proof attached');

    // Close it, then the thread refuses.
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/disputes/{$dispute->id}/withdraw")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Dispute withdrawn. Payments are unfrozen.');

    expect($dispute->fresh()->status)->toBe('withdrawn');
    expect($dispute->fresh()->resolution)->toBe('withdrawn');
    expect($dispute->fresh()->resolved_by)->toBe($owner->id);

    $this->actingAs($kon)
        ->postJson("/api/projects/{$project->id}/disputes/{$dispute->id}/reply", ['body' => 'late'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'This dispute is closed; the thread no longer accepts messages.');

    // Only the opener withdraws.
    $this->actingAs($kon)
        ->postJson("/api/projects/{$project->id}/disputes/{$dispute->id}/withdraw")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the dispute opener can withdraw it.');
});

it('validates the opener payload and the payment pairing', function () {
    $owner = dpOwner('val');
    $kon = dpContractor('val');
    $pm = dpPM('val');
    $project = dpProject($owner, $kon, $pm, 'val');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/disputes", [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['category', 'title', 'description']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/disputes", ['category' => 'nope', 'title' => 'x', 'description' => 'y'])
        ->assertStatus(422)
        ->assertJsonPath('errors.category', ['The selected category is invalid.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/disputes", [
            'category' => 'payment', 'title' => 'x', 'description' => 'y', 'payment_type' => 'termin',
        ])
        ->assertStatus(422)
        ->assertJsonPath('message', 'payment_type and payment_id must be provided together.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/disputes", [
            'category' => 'payment', 'title' => 'x', 'description' => 'y',
            'payment_type' => 'bogus', 'payment_id' => 1,
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.payment_type', ['The selected payment type is invalid.']);
});
