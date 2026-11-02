<?php

use App\Models\Arsitek;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Project documents: the list route and its access gate
|--------------------------------------------------------------------------
|
| `GET /projects/{project}/documents` admits the owner, the assigned PM,
| any hired professional and any ACTIVE sub-professional, with the
| controller's own 403 sentence. The optional `target_role` filter is
| applied in SQL. Rows carry the `file_url` append (environment
| dependent), which is why documents with rows stay out of the byte gate.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function docOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "dcown_$tag" . uniqid(),
        'email' => "dcown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function docArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "dca_$tag" . uniqid(),
        'email' => "dca_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);

    return $user;
}

function docProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "Docs $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open', 'target_role' => 'both',
    ]);
}

it('gates the document list and filters by target role', function () {
    $owner = docOwner('list');
    $stranger = docOwner('out');
    $pro = docArchitect('list');
    $project = docProject($owner, 'list');
    $project->update(['selected_arsitek_id' => $pro->arsitek->id]);

    $this->actingAs($stranger)
        ->getJson("/api/projects/{$project->id}/documents")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. You must be assigned to this project to view documents.');

    // The hired architect passes.
    $this->actingAs($pro)
        ->getJson("/api/projects/{$project->id}/documents")
        ->assertStatus(200)
        ->assertJsonPath('data', []);

    \App\Models\ProjectDocument::create([
        'project_id' => $project->id, 'uploader_id' => $pro->id,
        'file_name' => 'plan.pdf', 'file_path' => 'project_documents/plan.pdf',
        'category' => 'design', 'target_role' => 'structural', 'status' => 'uploaded',
        'version' => 1, 'file_type' => 'pdf',
    ]);
    \App\Models\ProjectDocument::create([
        'project_id' => $project->id, 'uploader_id' => $pro->id,
        'file_name' => 'notes.pdf', 'file_path' => 'project_documents/notes.pdf',
        'category' => 'design', 'target_role' => 'mep', 'status' => 'uploaded',
        'version' => 1, 'file_type' => 'pdf',
    ]);

    $all = $this->actingAs($owner)->getJson("/api/projects/{$project->id}/documents")->assertStatus(200);
    expect($all->json('data'))->toHaveCount(2);
    expect($all->json('data.0.file_name'))->toBe('plan.pdf');
    expect($all->json('data.0.uploader.name'))->toBe($pro->name);

    $filtered = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/documents?target_role=mep")
        ->assertStatus(200);
    expect($filtered->json('data'))->toHaveCount(1);
    expect($filtered->json('data.0.file_name'))->toBe('notes.pdf');
});
