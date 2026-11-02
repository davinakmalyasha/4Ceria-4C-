<?php

use App\Models\Arsitek;
use App\Models\Project;
use App\Models\ProjectMaterialFolder;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Material folders: the BOM grouping behind the participant gate
|--------------------------------------------------------------------------
|
| index/store/update/destroy admit the owner, the assigned PM or a HIRED
| professional (interior is role AND hire — the unscoped check used to
| let any interior user edit folders). Create answers 201 with the
| CREATED model in create order; update answers the table-order row;
| destroy detaches its requirements before deleting.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function mfOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "mfown_$tag" . uniqid(),
        'email' => "mfown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function mfArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "mfa_$tag" . uniqid(),
        'email' => "mfa_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);
    return $user;
}

it('creates, lists, renames and deletes a folder', function () {
    $owner = mfOwner('ok');
    $pro = mfArchitect('ok');
    $project = Project::create([
        'title' => 'Folders', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open', 'target_role' => 'both',
        'selected_arsitek_id' => $pro->arsitek->id,
    ]);

    $created = $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/material-folders", ['name' => 'Structure', 'bom_type' => 'raw'])
        ->assertStatus(201);

    // Create order, not table order.
    expect(array_keys($created->json('data')))->toBe([
        'name', 'created_by', 'bom_type', 'project_id', 'updated_at', 'created_at', 'id', 'creator',
    ]);
    expect($created->json('data.created_by'))->toBe($pro->id);
    expect($created->json('data.creator.name'))->toBe($pro->name);

    $folder = ProjectMaterialFolder::where('project_id', $project->id)->sole();

    $list = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/material-folders")
        ->assertStatus(200);
    expect($list->json('data'))->toHaveCount(1);

    $renamed = $this->actingAs($pro)
        ->putJson("/api/projects/{$project->id}/material-folders/{$folder->id}", ['name' => 'Structure v2'])
        ->assertStatus(200)
        ->assertJsonPath('data.name', 'Structure v2');
    // Table order on update.
    expect(array_keys($renamed->json('data')))->toBe([
        'id', 'project_id', 'name', 'bom_type', 'created_by', 'created_at', 'updated_at', 'creator',
    ]);

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/material-folders/{$folder->id}")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Folder deleted successfully.');

    expect(ProjectMaterialFolder::find($folder->id))->toBeNull();
});

it('gates the folder routes and validates the create', function () {
    $owner = mfOwner('gate');
    $stranger = mfOwner('out');
    $project = Project::create([
        'title' => 'Folders gate', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open', 'target_role' => 'both',
    ]);

    $this->actingAs($stranger)
        ->getJson("/api/projects/{$project->id}/material-folders")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/material-folders", [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['name']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/material-folders", ['name' => 'x', 'bom_type' => 'wood'])
        ->assertStatus(422)
        ->assertJsonPath('errors.bom_type', ['The selected bom type is invalid.']);

    // A folder from another project answers the plain 404.
    $other = Project::create([
        'title' => 'Other', 'user_id' => $owner->id,
        'budget' => 1_000_000, 'status' => 'open', 'target_role' => 'both',
    ]);
    $foreign = ProjectMaterialFolder::create([
        'project_id' => $other->id, 'name' => 'Foreign', 'created_by' => $owner->id, 'bom_type' => 'raw',
    ]);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/material-folders/{$foreign->id}", ['name' => 'x'])
        ->assertStatus(404)
        ->assertJsonPath('message', 'Not found.');
});
