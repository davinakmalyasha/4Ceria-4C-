<?php

use App\Models\NotarisProfile;
use App\Models\Project;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| verify-legal locks the legal phase
|--------------------------------------------------------------------------
|
| `POST /projects/{project}/verify-legal` is verifyPhase('legal'): the
| owner or PM confirms a submitted legal handover, which stamps the
| legal columns, clears the handover, appends `legal` to
| completed_phases, unblocks the FIRST locked notaris payment stage and
| tells the hired notary. The gate refuses a missing handover with 422.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function vlOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "vlown_$tag" . uniqid(),
        'email' => "vlown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function vlNotary(string $tag): User
{
    $user = User::create([
        'name' => "Not $tag", 'username' => "vln_$tag" . uniqid(),
        'email' => "vln_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'notaris',
    ]);
    NotarisProfile::create(['user_id' => $user->id, 'nama' => "Not $tag"]);
    return $user;
}

it('gates the verification and the handover prerequisite', function () {
    $owner = vlOwner('gate');
    $notary = vlNotary('gate');
    $project = Project::create([
        'title' => 'Legal Gate', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'legal', 'target_role' => 'both',
        'selected_notaris_id' => $notary->notaris_profile->id,
    ]);

    $this->actingAs($notary)
        ->postJson("/api/projects/{$project->id}/verify-legal")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the Project Owner or PM can verify the legal phase.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/verify-legal")
        ->assertStatus(422)
        ->assertJsonPath('message', 'Legal handover has not been submitted for verification yet.');
});

it('locks the phase, unblocks the first stage and notifies the notary', function () {
    $owner = vlOwner('ok');
    $notary = vlNotary('ok');
    $project = Project::create([
        'title' => 'Legal Ok', 'user_id' => $owner->id,
        'budget' => 400_000_000, 'status' => 'legal', 'target_role' => 'both',
        'selected_notaris_id' => $notary->notaris_profile->id,
        'legal_handover_submitted_at' => now(),
        'completed_phases' => [],
    ]);

    $first = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris', 'recipient_id' => $notary->id,
        'label' => 'Legal DP', 'percentage' => 40, 'amount' => 20_000_000, 'status' => 'locked',
    ]);
    $second = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris', 'recipient_id' => $notary->id,
        'label' => 'Legal Final', 'percentage' => 60, 'amount' => 30_000_000, 'status' => 'locked',
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/verify-legal")
        ->assertStatus(200);

    $fresh = $project->fresh();
    expect($fresh->legal_locked_at)->not->toBeNull();
    expect($fresh->legal_handover_submitted_at)->toBeNull();
    expect($fresh->completed_phases)->toContain('legal');

    // Only the FIRST locked stage unblocks.
    expect($first->fresh()->status)->toBe('pending');
    expect($second->fresh()->status)->toBe('locked');

    $actions = \App\Models\ProjectActivityLog::where('project_id', $project->id)->pluck('action')->all();
    expect($actions)->toContain('legal_verified');
    expect($actions)->toContain('payment_unblocked');

    expect(\App\Models\Notification::where('user_id', $notary->id)->where('type', 'phase_verified')->count())->toBe(1);
});
