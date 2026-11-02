<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\BidProjectManager;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectManager;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Phase brief lifecycle, kickoff and reviews
|--------------------------------------------------------------------------
|
| - approve/revise construction brief: owner or assigned PM, status gates,
|   one activity row each;
| - lock-brief: the assigned architect locks design, the assigned contractor
|   SUBMITS the construction brief for review (status pending_review);
| - kickoff: owner/PM issues the Notice to Proceed once, logs and notifies;
| - review: owner-only, requires a completed project or a pro who left;
|   `updateOrCreate` key order on create vs update.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function briefUser(string $tag, string $role = 'user'): User
{
    return User::create([
        'name' => "PB $tag", 'username' => "pb_$tag" . uniqid(),
        'email' => "pb_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

function briefProject(User $owner, string $tag, array $extra = []): Project
{
    return Project::create(array_merge([
        'title' => "PB Project $tag", 'user_id' => $owner->id,
        'budget' => 1000000, 'status' => 'open', 'target_role' => 'both',
    ], $extra));
}

it('approves a pending construction brief', function () {
    $owner = briefUser('appr');
    $project = briefProject($owner, 'appr', [
        'construction_brief_status' => 'draft',
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/approve-construction-brief")
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Brief is not pending review.']);

    $this->actingAs(briefUser('apprs'))
        ->postJson("/api/projects/{$project->id}/approve-construction-brief")
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Only the Project Owner or PM can approve the construction brief.']);

    $project->update([
        'construction_brief_status' => 'pending_review',
        'construction_brief_revision_notes' => 'old',
    ]);

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/approve-construction-brief")
        ->assertStatus(200)
        ->assertJsonPath('data.construction_brief_status', 'approved')
        ->assertJsonPath('data.construction_brief_revision_notes', null);

    expect($response->json('data.construction_locked_at'))->not->toBeNull();
    expect(ProjectActivityLog::where('project_id', $project->id)
        ->where('action', 'construction_brief_approved')->count())->toBe(1);
});

it('requests a construction brief revision', function () {
    $owner = briefUser('rev');
    $project = briefProject($owner, 'rev');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/revise-construction-brief", [])
        ->assertStatus(422)
        ->assertJsonPath('errors.notes', ['The notes field is required.']);

    $this->actingAs(briefUser('revs'))
        ->postJson("/api/projects/{$project->id}/revise-construction-brief", ['notes' => 'x'])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Only the Project Owner or PM can request revision.']);

    $project->update(['construction_locked_at' => now()]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/revise-construction-brief", [
            'notes' => 'Please add the RAB detail.',
        ])
        ->assertStatus(200)
        ->assertJsonPath('data.construction_brief_status', 'revision_requested')
        ->assertJsonPath('data.construction_brief_revision_notes', 'Please add the RAB detail.')
        ->assertJsonPath('data.construction_locked_at', null);

    expect(ProjectActivityLog::where('project_id', $project->id)
        ->where('action', 'construction_brief_revision')->count())->toBe(1);
});

it('locks design and submits the construction brief for review', function () {
    $owner = briefUser('lock');
    $architect = briefUser('locka', 'arsitek');
    $arsitek = Arsitek::create(['user_id' => $architect->id, 'nama' => 'Lock Architect']);
    $contractor = briefUser('lockc', 'kontraktor');
    $kontraktor = \App\Models\Kontraktor::create([
        'user_id' => $contractor->id, 'nama' => 'Lock Contractor',
    ]);
    $project = briefProject($owner, 'lock', [
        'selected_arsitek_id' => $arsitek->id,
        'selected_kontraktor_id' => $kontraktor->id,
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/lock-brief", ['phase' => 'design'])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Only the assigned architect can lock the design brief.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/lock-brief", ['phase' => 'bogus'])
        ->assertStatus(422)
        ->assertJsonPath('errors.phase', ['The selected phase is invalid.']);

    $this->actingAs($architect)
        ->postJson("/api/projects/{$project->id}/lock-brief", ['phase' => 'design'])
        ->assertStatus(200);
    expect($project->fresh()->design_locked_at)->not->toBeNull();

    $this->actingAs($contractor)
        ->postJson("/api/projects/{$project->id}/lock-brief", ['phase' => 'build'])
        ->assertStatus(200)
        ->assertJsonPath('data.construction_brief_status', 'pending_review');
    expect($project->fresh()->construction_locked_at)->toBeNull();
});

it('issues a Notice to Proceed once', function () {
    $owner = briefUser('kick');
    $architect = briefUser('kicka', 'arsitek');
    $arsitek = Arsitek::create(['user_id' => $architect->id, 'nama' => 'Kick Architect']);
    $project = briefProject($owner, 'kick', ['selected_arsitek_id' => $arsitek->id]);

    $this->actingAs(briefUser('kicks'))
        ->postJson("/api/projects/{$project->id}/kickoff", ['role' => 'arsitek'])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized. Only Owner or PM can issue Notice to Proceed.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/kickoff", [])
        ->assertStatus(422)
        ->assertJsonPath('errors.role', ['The role field is required.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/kickoff", ['role' => 'arsitek'])
        ->assertStatus(200);

    expect($project->fresh()->arsitek_kickoff_at)->not->toBeNull();
    expect(ProjectActivityLog::where('project_id', $project->id)
        ->where('action', 'arsitek_kickoff')->count())->toBe(1);
    expect(\App\Models\Notification::where('user_id', $architect->id)
        ->where('type', 'kickoff_issued')->count())->toBe(1);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/kickoff", ['role' => 'arsitek'])
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Notice to Proceed has already been issued for this role.']);
});

it('reviews a professional with the created and updated key orders', function () {
    $owner = briefUser('revw');
    $architect = briefUser('revwp', 'arsitek');
    $arsitek = Arsitek::create(['user_id' => $architect->id, 'nama' => 'Reviewed Architect']);
    $project = briefProject($owner, 'revw', ['status' => 'completed']);
    BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $arsitek->id,
        'price' => 100, 'proposal' => 'x', 'status' => 'accepted',
        'offered_by_id' => $architect->id,
    ]);

    $this->actingAs(briefUser('revws'))
        ->postJson("/api/projects/{$project->id}/review", ['rating' => 5, 'target_role' => 'arsitek'])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Only the project owner can leave a review.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/review", [])
        ->assertStatus(422)
        ->assertJsonPath('errors.rating', ['The rating field is required.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/review", ['rating' => 9, 'target_role' => 'arsitek'])
        ->assertStatus(422)
        ->assertJsonPath('errors.rating', ['The rating field must not be greater than 5.']);

    $created = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/review", [
            'rating' => 5, 'comment' => 'Great work!', 'target_role' => 'arsitek',
        ])
        ->assertStatus(201)
        ->assertJsonPath('message', 'Thank you for your feedback!');

    expect(array_keys($created->json('data')))->toBe([
        'project_id', 'reviewer_id', 'arsitek_id', 'rating', 'komentar',
        'updated_at', 'created_at', 'id',
    ]);
    expect(\App\Models\Notification::where('user_id', $architect->id)
        ->where('type', 'new_review')->count())->toBe(1);

    $updated = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/review", [
            'rating' => 3, 'comment' => 'Revised view', 'target_role' => 'arsitek',
        ])
        ->assertStatus(201);

    expect(array_keys($updated->json('data')))->toBe([
        'id', 'project_id', 'reviewer_id', 'arsitek_id', 'rating',
        'komentar', 'created_at', 'updated_at',
    ]);
    expect($updated->json('data.rating'))->toBe(3);

    // A role with no hired bid is a business 422, not a validation error.
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/review", ['rating' => 5, 'target_role' => 'pm'])
        ->assertStatus(422)
        ->assertExactJson(['message' => 'No professional assignment found for role: pm']);
});
