<?php

use App\Models\Arsitek;
use App\Models\Project;
use App\Models\ProjectManager;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Planning machine: propose, PM-verify, approve, reject, audit
|--------------------------------------------------------------------------
|
| Regression suite for the five planning verbs:
| - only the hired architect proposes (bumping the iteration), only the
|   assigned PM verifies, only the owner approves;
| - with a PM assigned the owner cannot approve before pm_verified;
| - reject routes by role (PM from proposed, owner from pm_verified) and
|   logs the reason, clearing the PM verification stamp;
| - `planning_pm_verified_at` is a real column now — it was written by
|   two endpoints but never existed, so PM verification 500'd.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function plOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "pdown_$tag" . uniqid(),
        'email' => "pdown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function plArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "pda_$tag" . uniqid(),
        'email' => "pda_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);
    return $user;
}

function plPM(string $tag): User
{
    $user = User::create([
        'name' => "PM $tag", 'username' => "pdpm_$tag" . uniqid(),
        'email' => "pdpm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);
    ProjectManager::create(['user_id' => $user->id, 'nama' => "PM $tag"]);
    return $user;
}

function plProject(User $owner, User $architect, string $tag, ?User $pm = null): Project
{
    return Project::create([
        'title' => "Planning $tag", 'user_id' => $owner->id,
        'budget' => 150_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'selected_arsitek_id' => $architect->arsitek->id,
        'pm_id' => $pm?->project_manager?->id,
        'planning_status' => 'draft',
        'planning_iteration' => 0,
    ]);
}

it('walks propose, PM-verify and owner-approve', function () {
    $owner = plOwner('ok');
    $pro = plArchitect('ok');
    $pm = plPM('ok');
    $project = plProject($owner, $pro, 'ok', $pm);

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/submit-planning", ['architect_notes' => 'first pass'])
        ->assertStatus(200);

    expect($project->fresh()->planning_status)->toBe('proposed');
    expect($project->fresh()->planning_iteration)->toBe(1);

    // The owner cannot approve a PM-managed plan before PM verification.
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/approve-planning")
        ->assertStatus(422)
        ->assertJsonPath('message', 'The project manager must verify the technical plan before you can approve.');

    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/verify-planning-pm", ['pm_audit_notes' => 'looks fine'])
        ->assertStatus(200);

    expect($project->fresh()->planning_status)->toBe('pm_verified');
    expect($project->fresh()->planning_pm_verified_at)->not->toBeNull();

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/approve-planning")
        ->assertStatus(200);

    expect($project->fresh()->planning_status)->toBe('approved');
    expect($project->fresh()->planning_approved_at)->not->toBeNull();
});

it('rejects the proposal by role and logs the reason', function () {
    $owner = plOwner('rej');
    $pro = plArchitect('rej');
    $pm = plPM('rej');
    $project = plProject($owner, $pro, 'rej', $pm);
    $project->update(['planning_status' => 'proposed']);

    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/reject-planning", ['pm_audit_notes' => 'needs work'])
        ->assertStatus(200);

    $fresh = $project->fresh();
    expect($fresh->planning_status)->toBe('draft');
    expect($fresh->planning_pm_verified_at)->toBeNull();

    $log = \App\Models\ProjectActivityLog::where('project_id', $project->id)->latest('id')->first();
    expect($log->action)->toBe('planning_rejected');
    expect($log->details)->toContain('needs work');
});

it('saves PM audit notes and gates the verbs', function () {
    $owner = plOwner('gate');
    $pro = plArchitect('gate');
    $pm = plPM('gate');
    $project = plProject($owner, $pro, 'gate', $pm);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/submit-planning")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the assigned architect can propose a design brief.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/update-planning-audit", ['pm_audit_notes' => 'x'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/update-planning-audit", ['pm_audit_notes' => 'draft note'])
        ->assertStatus(200);

    expect($project->fresh()->pm_audit_notes)->toBe('draft note');
});
