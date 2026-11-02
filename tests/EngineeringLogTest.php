<?php

use App\Models\Project;
use App\Models\ProjectMilestone;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Manual engineering logs
|--------------------------------------------------------------------------
|
| `POST engineering-logs` records a participant's diary entry as an
| ALREADY-APPROVED `generic` milestone (sort_order = phase count + 1) whose
| content carries the empty checklist, gallery URLs, the manual flag and its
| author. It answered 500 before the `status` key was dropped from the
| create payload (the column does not exist and is not fillable).
|
| `DELETE engineering-logs/{milestone}` is participant-gated, binds the row
| to the project, refuses non-manual records, and refuses a milestone whose
| first linked stage is paid. Manual logs are born approved, so the old
| approved-status guard made this endpoint unreachable; the oracle now
| skips it for manual logs.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function elOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "elown_$tag" . uniqid(),
        'email' => "elown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function elStructural(string $tag): User
{
    $user = User::create([
        'name' => "Struct $tag", 'username' => "els_$tag" . uniqid(),
        'email' => "els_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'structural',
    ]);
    StructuralEngineer::create(['user_id' => $user->id, 'nama' => "Struct $tag"]);

    return $user;
}

function elProject(User $owner, User $struct, string $tag): Project
{
    return Project::create([
        'title' => "Eng $tag", 'user_id' => $owner->id,
        'budget' => 120_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'structural_id' => $struct->structural_engineer->id,
    ]);
}

it('records a manual log as an approved generic milestone', function () {
    Storage::fake('public');
    $owner = elOwner('ok');
    $struct = elStructural('ok');
    $project = elProject($owner, $struct, 'ok');

    $response = $this->actingAs($struct)
        ->post("/api/projects/{$project->id}/engineering-logs", [
            'role_type' => 'structural',
            'title' => 'Foundation check',
            'description' => 'poured today',
            'files' => [UploadedFile::fake()->image('site.png', 20, 20)],
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Log recorded successfully');

    // The CREATED model, in create order.
    expect(array_keys($response->json('data')))->toBe([
        'project_id', 'phase_context', 'title', 'description', 'type',
        'approval_status', 'pm_verified_at', 'content', 'sort_order',
        'updated_at', 'created_at', 'id',
    ]);
    expect($response->json('data.approval_status'))->toBe('approved');
    expect($response->json('data.type'))->toBe('generic');
    expect($response->json('data.sort_order'))->toBe(1);
    expect($response->json('data.content.is_manual_log'))->toBeTrue();
    expect($response->json('data.content.added_by'))->toBe($struct->id);
    expect($response->json('data.content.gallery.0'))->toContain('/storage/milestones/gallery/');

    $milestone = ProjectMilestone::where('project_id', $project->id)->sole();
    expect($milestone->approval_status)->toBe('approved');
    expect($milestone->pm_verified_at)->not->toBeNull();
    // Stored as a PATH; the response resolves it.
    expect($milestone->content['gallery'][0])->toStartWith('milestones/gallery/');
});

it('validates the log payload and the files', function () {
    Storage::fake('public');
    $owner = elOwner('val');
    $struct = elStructural('val');
    $project = elProject($owner, $struct, 'val');

    $this->actingAs($struct)
        ->postJson("/api/projects/{$project->id}/engineering-logs", [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['role_type', 'title']);

    $this->actingAs($struct)
        ->postJson("/api/projects/{$project->id}/engineering-logs", [
            'role_type' => 'design', 'title' => 'x',
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.role_type', ['The selected role type is invalid.']);
});

it('deletes a manual log and refuses a work-phase record', function () {
    $owner = elOwner('del');
    $struct = elStructural('del');
    $project = elProject($owner, $struct, 'del');

    $manual = ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Manual log', 'type' => 'generic',
        'phase_context' => 'structural', 'approval_status' => 'approved',
        'content' => ['checklist' => [], 'gallery' => [], 'is_manual_log' => true],
    ]);
    $work = ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Work step', 'type' => 'structural',
        'phase_context' => 'structural', 'approval_status' => 'pending',
    ]);

    $this->actingAs($struct)
        ->deleteJson("/api/projects/{$project->id}/engineering-logs/{$work->id}")
        ->assertStatus(400)
        ->assertJsonPath('message', 'Only manual engineering log entries can be removed here. Use the milestone endpoint for work-phase records.');

    // Born approved, yet still deletable through the manual-log path.
    $this->actingAs($struct)
        ->deleteJson("/api/projects/{$project->id}/engineering-logs/{$manual->id}")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Log removed');

    expect(ProjectMilestone::find($manual->id))->toBeNull();
    expect(ProjectMilestone::find($work->id))->not->toBeNull();
});

it('gates non-participants and foreign projects', function () {
    $owner = elOwner('gate');
    $struct = elStructural('gate');
    $project = elProject($owner, $struct, 'gate');
    $stranger = User::create([
        'name' => 'Out', 'username' => 'elo' . uniqid(),
        'email' => 'elo' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'notaris',
    ]);

    $manual = ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Manual log', 'type' => 'generic',
        'phase_context' => 'structural', 'approval_status' => 'approved',
        'content' => ['is_manual_log' => true],
    ]);

    $this->actingAs($stranger)
        ->deleteJson("/api/projects/{$project->id}/engineering-logs/{$manual->id}")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    // A milestone of another project answers 403 with NO period.
    $other = elProject($owner, $struct, 'other');
    $foreign = ProjectMilestone::create([
        'project_id' => $other->id, 'title' => 'Foreign', 'type' => 'generic',
        'phase_context' => 'structural', 'approval_status' => 'approved',
        'content' => ['is_manual_log' => true],
    ]);

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/engineering-logs/{$foreign->id}")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');

    expect(ProjectMilestone::find($foreign->id))->not->toBeNull();
});
