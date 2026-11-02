<?php

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectDocument;
use App\Models\ProjectMilestone;
use App\Models\ProjectPaymentTermin;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Milestone update: the professional's progress editor
|--------------------------------------------------------------------------
|
| - participants edit title/description and move the row between
|   in_progress / pending / revision;
| - `is_completed` and an `approved` status are STRIPPED for non-owner/PM
|   callers — approval unlocks payment, so a specialist can never
|   self-approve;
| - owner/PM approval runs the full finalization (pm_verified_at,
|   completion, stage unlock, vault resync, `Approved:` line);
| - `retained_gallery` keeps only the stored paths whose URL suffix or
|   basename matches; uploads append under `milestone_files/` and record
|   the original filename;
| - the answer is the same model + six profile trees as approve, with
|   `project` only when a stage was unlocked.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function muOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "muown_$tag" . uniqid(),
        'email' => "muown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function muStructural(string $tag): User
{
    $user = User::create([
        'name' => "Struct $tag", 'username' => "mus_$tag" . uniqid(),
        'email' => "mus_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'structural',
    ]);
    StructuralEngineer::create(['user_id' => $user->id, 'nama' => "Struct $tag"]);

    return $user;
}

function muPlan(User $owner, User $struct, string $tag, array $overrides = []): array
{
    $project = Project::create(array_merge([
        'title' => "Update $tag", 'user_id' => $owner->id,
        'budget' => 150_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'structural_id' => $struct->structural_engineer->id,
    ], $overrides));

    $milestone = ProjectMilestone::create([
        'project_id' => $project->id,
        'structural_id' => $struct->structural_engineer->id,
        'title' => 'Update Me', 'type' => 'structural',
        'phase_context' => 'design', 'approval_status' => 'in_progress',
        'content' => [
            'gallery' => ['milestone_files/old1.png', 'milestone_files/old2.png'],
            'file_names' => [
                'milestone_files/old1.png' => 'Old One',
                'milestone_files/old2.png' => 'Old Two',
            ],
        ],
    ]);

    return [$project, $milestone];
}

it('lets the specialist edit and blocks self-approval', function () {
    $owner = muOwner('edit');
    $struct = muStructural('edit');
    [$project, $milestone] = muPlan($owner, $struct, 'edit');

    $response = $this->actingAs($struct)
        ->putJson("/api/projects/{$project->id}/milestones/{$milestone->id}", [
            'title' => 'Renamed by pro', 'description' => 'updated', 'approval_status' => 'pending',
        ])
        ->assertStatus(200);

    expect($response->json('data.title'))->toBe('Renamed by pro');
    expect($response->json('data.approval_status'))->toBe('pending');
    expect($response->json('data'))->not->toHaveKey('project');
    expect($response->json('data.structural.id'))->toBe($struct->structural_engineer->id);

    // Self-approval is stripped: the status stays, completion is ignored.
    $this->actingAs($struct)
        ->putJson("/api/projects/{$project->id}/milestones/{$milestone->id}", [
            'approval_status' => 'approved', 'is_completed' => true, 'title' => 'Sneaky',
        ])
        ->assertStatus(200)
        ->assertJsonPath('data.approval_status', 'pending')
        ->assertJsonPath('data.is_completed', false);

    expect($milestone->fresh()->approval_status)->toBe('pending');
    expect($milestone->fresh()->is_completed)->toBeFalse();
});

it('finalizes when the owner approves', function () {
    $owner = muOwner('fin');
    $struct = muStructural('fin');
    [$project, $milestone] = muPlan($owner, $struct, 'fin');
    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'structural', 'recipient_id' => $struct->id,
        'label' => 'Update DP', 'percentage' => 50, 'amount' => 10_000_000,
        'status' => 'locked', 'milestone_id' => $milestone->id,
    ]);

    $response = $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/milestones/{$milestone->id}", [
            'approval_status' => 'approved',
        ])
        ->assertStatus(200);

    $fresh = $milestone->fresh();
    expect($fresh->approval_status)->toBe('approved');
    expect($fresh->is_completed)->toBeTrue();
    expect($fresh->pm_verified_at)->not->toBeNull();

    expect($termin->fresh()->status)->toBe('pending');
    expect($response->json('data'))->toHaveKey('project');

    $document = ProjectDocument::where('project_id', $project->id)->first();
    expect($document)->not->toBeNull();
    expect($document->status)->toBe('verified');

    $log = ProjectActivityLog::where('project_id', $project->id)->latest('id')->first();
    expect($log->action)->toBe('milestone_approved');
    expect($log->details)->toBe('Approved: Update Me');
});

it('keeps only the retained gallery files', function () {
    $owner = muOwner('ret');
    $struct = muStructural('ret');
    [$project, $milestone] = muPlan($owner, $struct, 'ret');

    $this->actingAs($struct)
        ->putJson("/api/projects/{$project->id}/milestones/{$milestone->id}", [
            'retained_gallery' => json_encode(['http://localhost/storage/milestone_files/old2.png']),
            'title' => 'Retained One',
        ])
        ->assertStatus(200)
        ->assertJsonPath('data.title', 'Retained One');

    expect($milestone->fresh()->content['gallery'])->toBe(['milestone_files/old2.png']);
    expect($milestone->fresh()->content['file_names'])->toBe(['milestone_files/old2.png' => 'Old Two']);
});

it('appends uploaded images with their original names', function () {
    Storage::fake('public');
    $owner = muOwner('up');
    $struct = muStructural('up');
    [$project, $milestone] = muPlan($owner, $struct, 'up');

    $file = UploadedFile::fake()->image('site-photo.png', 20, 20);

    // PHP only parses multipart on POST, so the test spoofs PUT — exactly
    // how the SPA sends an update that carries files.
    $response = $this->actingAs($struct)
        ->post("/api/projects/{$project->id}/milestones/{$milestone->id}", [
            '_method' => 'PUT',
            'title' => 'With Gallery',
            'gallery' => [$file],
        ]);

    $response->assertStatus(200);

    $content = $milestone->fresh()->content;
    expect($content['gallery'])->toHaveCount(3);
    $stored = $content['gallery'][2];
    expect($stored)->toStartWith('milestone_files/');
    expect($content['file_names'][$stored])->toBe('site-photo.png');

    // The first vault sync created under_review rows for every gallery path.
    expect(ProjectDocument::where('project_id', $project->id)->count())->toBe(3);
    expect(ProjectDocument::where('project_id', $project->id)->first()->status)->toBe('under_review');
});

it('gates non-modifiers and binds the row to its project', function () {
    $owner = muOwner('gate');
    $struct = muStructural('gate');
    [$project, $milestone] = muPlan($owner, $struct, 'gate');

    $stranger = User::create([
        'name' => 'Out', 'username' => 'muo' . uniqid(),
        'email' => 'muo' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    Kontraktor::create(['user_id' => $stranger->id, 'nama' => 'Build']);

    $this->actingAs($stranger)
        ->putJson("/api/projects/{$project->id}/milestones/{$milestone->id}", ['title' => 'x'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    $other = Project::create([
        'title' => 'Other', 'user_id' => $owner->id,
        'budget' => 1_000_000, 'status' => 'open', 'target_role' => 'both',
    ]);
    $foreign = ProjectMilestone::create([
        'project_id' => $other->id, 'title' => 'Foreign', 'type' => 'structural',
        'phase_context' => 'design', 'approval_status' => 'in_progress',
    ]);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/milestones/{$foreign->id}", ['title' => 'x'])
        ->assertStatus(404)
        ->assertJsonPath('message', 'Not found.');
});
