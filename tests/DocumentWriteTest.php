<?php

use App\Models\Arsitek;
use App\Models\Project;
use App\Models\ProjectDocument;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Document writes: upload, rename, delete and verify
|--------------------------------------------------------------------------
|
| - store is participant-gated AFTER validation (the FormRequest runs
|   first, exactly like the oracle), mints the next version for a parent,
|   and answers the CREATED model with file_url + uploader;
| - update/destroy are uploader-or-owner and refuse a verified/approved
|   document;
| - verify is owner-or-assigned-PM only.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function dwOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "dwown_$tag" . uniqid(),
        'email' => "dwown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function dwArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "dwa_$tag" . uniqid(),
        'email' => "dwa_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);
    return $user;
}

function dwProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "Docs $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open', 'target_role' => 'both',
    ]);
}

it('uploads a document with create-order keys and versions a parent', function () {
    Storage::fake('public');
    $owner = dwOwner('up');
    $project = dwProject($owner, 'up');

    $response = $this->actingAs($owner)
        ->post("/api/projects/{$project->id}/documents", [
            'file' => UploadedFile::fake()->create('plan.pdf', 100, 'application/pdf'),
            'title' => 'Parity Plan', 'category' => 'design', 'version_label' => 'v1',
        ])
        ->assertStatus(200);

    expect(array_keys($response->json('data')))->toBe([
        'uploader_id', 'parent_id', 'version', 'file_name', 'description', 'file_path',
        'file_type', 'category', 'status', 'target_role', 'version_label', 'project_id',
        'updated_at', 'created_at', 'id', 'file_url', 'uploader',
    ]);
    expect($response->json('data.version'))->toBe(1);
    expect($response->json('data.file_type'))->toBe('pdf');
    expect($response->json('data.uploader.id'))->toBe($owner->id);

    $first = ProjectDocument::where('project_id', $project->id)->sole();

    $second = $this->actingAs($owner)
        ->post("/api/projects/{$project->id}/documents", [
            'file' => UploadedFile::fake()->create('plan-v2.pdf', 100, 'application/pdf'),
            'parent_id' => $first->id,
        ])
        ->assertStatus(200);

    expect($second->json('data.version'))->toBe(2);
    expect($second->json('data.category'))->toBe('design');
});

it('validates the upload before gating the participant', function () {
    $stranger = dwOwner('out');
    $owner = dwOwner('own');
    $project = dwProject($owner, 'gate');

    // No file: the FormRequest fails first, exactly like the oracle.
    $this->actingAs($stranger)
        ->postJson("/api/projects/{$project->id}/documents", [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['file']);
});

it('renames, locks and deletes', function () {
    Storage::fake('public');
    $owner = dwOwner('ren');
    $pro = dwArchitect('ren');
    $project = dwProject($owner, 'ren');
    $project->update(['selected_arsitek_id' => $pro->arsitek->id]);

    $doc = ProjectDocument::create([
        'project_id' => $project->id, 'uploader_id' => $pro->id,
        'file_name' => 'old.pdf', 'file_path' => 'project_documents/old.pdf',
        'category' => 'design', 'status' => 'uploaded', 'version' => 1, 'file_type' => 'pdf',
    ]);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/documents/{$doc->id}", ['file_name' => 'new.pdf'])
        ->assertStatus(200)
        ->assertJsonPath('data.file_name', 'new.pdf');

    \App\Models\ProjectDocument::where('id', $doc->id)->update(['status' => 'verified']);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/documents/{$doc->id}", ['file_name' => 'x.pdf'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Cannot modify a verified or approved document.');

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/documents/{$doc->id}")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Cannot delete a verified or approved document.');

    \App\Models\ProjectDocument::where('id', $doc->id)->update(['status' => 'uploaded']);
    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/documents/{$doc->id}")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Deleted');

    expect(ProjectDocument::find($doc->id))->toBeNull();
});

it('verifies for the owner or PM only', function () {
    $owner = dwOwner('ver');
    $pro = dwArchitect('ver');
    $project = dwProject($owner, 'ver');
    $project->update(['selected_arsitek_id' => $pro->arsitek->id]);

    $doc = ProjectDocument::create([
        'project_id' => $project->id, 'uploader_id' => $owner->id,
        'file_name' => 'x.pdf', 'file_path' => 'project_documents/x.pdf',
        'category' => 'design', 'status' => 'uploaded', 'version' => 1, 'file_type' => 'pdf',
    ]);

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/documents/{$doc->id}/verify")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only owner or PM can verify documents.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/documents/{$doc->id}/verify")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Document verified')
        ->assertJsonPath('data.status', 'verified');
});
