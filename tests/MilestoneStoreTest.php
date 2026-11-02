<?php

use App\Models\Project;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Milestone store binds the work plan and its add-ons
|--------------------------------------------------------------------------
|
| Regression suite for the S2 milestone write: validation rejects bad
| dates, non-integer sort orders, unknown targets, negative costs and
| non-integer time impacts; a plain store answers the row in create
| order; gallery uploads persist hash-named vault files resolved into
| content; and a positive cost_impact auto-creates the change order,
| mirrors approved files into project_documents, and logs the activity.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function milestoneOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "msown_$tag" . uniqid(),
        'email' => "msown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function milestoneProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "MS Job $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open',
        'target_role' => 'both',
    ]);
}

it('rejects a milestone without a title', function () {
    $owner = milestoneOwner('val');
    $project = milestoneProject($owner, 'val');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/milestones", [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['title']);
});

it('rejects bad dates, float sorts, unknown targets and negative costs', function () {
    $owner = milestoneOwner('val2');
    $project = milestoneProject($owner, 'val2');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/milestones", ['title' => 'T', 'start_date' => 'xx'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['start_date']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/milestones", ['title' => 'T', 'sort_order' => 1.5])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['sort_order']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/milestones", ['title' => 'T', 'target_notaris_id' => 999999])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['target_notaris_id']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/milestones", ['title' => 'T', 'cost_impact' => -5])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['cost_impact']);
});

it('stores a plain milestone in create order with empty relations', function () {
    $owner = milestoneOwner('plain');
    $project = milestoneProject($owner, 'plain');

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/milestones", [
            'title' => 'Probe MS',
            'description' => 'Probe desc',
            'phase_context' => 'design',
            'sort_order' => 3,
            'content' => json_encode(['services' => ['pondasi']]),
        ])
        ->assertStatus(200);

    $data = $response->json('data');
    expect(array_keys($data))->toBe([
        'title', 'description', 'start_date', 'due_date', 'type', 'sort_order',
        'phase_context', 'content', 'is_completed', 'approval_status',
        'project_id', 'updated_at', 'created_at', 'id',
        'arsitek', 'kontraktor', 'notaris', 'interior', 'structural', 'mep',
        'change_orders',
    ]);
    expect($data['content'])->toBe(['services' => ['pondasi']]);
    expect($data['change_orders'])->toBe([]);
    expect($data['arsitek'])->toBeNull();
});

it('stores gallery uploads, resolves urls, and auto-creates the add-on change order', function () {
    Storage::fake('public');

    $owner = milestoneOwner('gal');
    $project = milestoneProject($owner, 'gal');

    $file = UploadedFile::fake()->image('dot.png', 100, 100);

    $response = $this->actingAs($owner)
        ->post("/api/projects/{$project->id}/milestones", [
            'title' => 'Full MS',
            'description' => 'Full desc',
            'phase_context' => 'design',
            'content' => json_encode(['services' => ['pondasi']]),
            'cost_impact' => 500000,
            'time_impact_days' => 3,
            'gallery' => [$file],
        ])
        ->assertStatus(200);

    $data = $response->json('data');
    $gallery = $data['content']['gallery'];
    expect($gallery)->toHaveCount(1);
    expect($gallery[0])->toContain('/storage/milestone_files/');
    expect($gallery[0])->toEndWith('.png');
    Storage::disk('public')->assertExists(
        substr($gallery[0], strpos($gallery[0], '/storage/') + strlen('/storage/'))
    );

    $changeOrders = $data['change_orders'];
    expect($changeOrders)->toHaveCount(1);
    expect($changeOrders[0]['title'])->toBe('Additional Fee: Full MS');
    expect((float) $changeOrders[0]['cost_impact'])->toBe(500000.0);

    // The approved gallery file is mirrored into the vault documents.
    expect(
        \App\Models\ProjectDocument::where('project_id', $project->id)
            ->where('category', 'blueprint')
            ->count()
    )->toBe(1);

    expect(
        \App\Models\ProjectActivityLog::where('project_id', $project->id)
            ->where('action', 'milestone_added')
            ->count()
    )->toBe(1);
});
