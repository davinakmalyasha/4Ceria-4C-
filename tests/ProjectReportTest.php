<?php

use App\Models\Project;
use App\Models\ProjectManager;
use App\Models\ProjectReport;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Project reports: publish, list, update and delete
|--------------------------------------------------------------------------
|
| - the owner AND the assigned PM may list and create — the policy used to
|   compare `projects.pm_id` (a PROFILE id) with the user id and locked the
|   PM out;
| - the list is a BARE ARRAY, newest published_at first, each row with its
|   full creator;
| - create answers the CREATED model in assignment order; uploads store
|   photos under projects/{id}/reports/photos and attachments as
|   {name,path,size} under .../reports/docs;
| - update is creator-or-owner and answers table order PLUS `project` (the
|   policy's loadMissing leaves the relation loaded); uploads append;
| - delete removes the stored files and the row.
|
| Validation uses the custom `{"message":"The given data was invalid."}`
| envelope.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function rpOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "rpown_$tag" . uniqid(),
        'email' => "rpown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function rpPM(string $tag): User
{
    $user = User::create([
        'name' => "PM $tag", 'username' => "rppm_$tag" . uniqid(),
        'email' => "rppm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);
    ProjectManager::create(['user_id' => $user->id, 'nama' => "PM $tag", 'no_telp' => '081200000003']);

    return $user;
}

function rpProject(User $owner, User $pm, string $tag): Project
{
    return Project::create([
        'title' => "Reports $tag", 'user_id' => $owner->id,
        'budget' => 140_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'pm_id' => $pm->project_manager->id,
    ]);
}

it('lets the assigned PM list and publish, and hides the list from others', function () {
    Storage::fake('public');
    $owner = rpOwner('ok');
    $pm = rpPM('ok');
    $project = rpProject($owner, $pm, 'ok');

    $this->actingAs($pm)
        ->getJson("/api/projects/{$project->id}/reports")
        ->assertStatus(200)
        ->assertExactJson([]);

    $response = $this->actingAs($pm)
        ->post("/api/projects/{$project->id}/reports", [
            'summary' => 'Week 3 progress', 'progress_percentage' => 35,
            'budget_health' => 'on_track',
            'photos' => [UploadedFile::fake()->image('site.png', 20, 20)],
            'attachments' => [UploadedFile::fake()->create('report.pdf', 20, 'application/pdf')],
        ])
        ->assertStatus(201)
        ->assertJsonPath('message', 'Report published successfully!');

    expect(array_keys($response->json('report')))->toBe([
        'project_id', 'created_by', 'summary', 'progress_percentage', 'budget_health',
        'phase_slug', 'site_photos', 'attachments', 'published_at',
        'updated_at', 'created_at', 'id',
    ]);
    expect($response->json('report.site_photos.0'))->toStartWith("projects/{$project->id}/reports/photos/");
    expect($response->json('report.attachments.0.name'))->toBe('report.pdf');
    expect($response->json('report.attachments.0.size'))->toBeGreaterThan(0);

    $list = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/reports")
        ->assertStatus(200);

    expect($list->json())->toHaveCount(1);
    expect($list->json('0.creator.id'))->toBe($pm->id);
    expect($list->json('0.creator'))->toHaveKey('email');

    $stranger = rpOwner('out');
    $this->actingAs($stranger)
        ->getJson("/api/projects/{$project->id}/reports")
        ->assertStatus(403)
        ->assertJsonPath('message', 'This action is unauthorized.');
});

it('uses the custom validation envelope', function () {
    $owner = rpOwner('val');
    $pm = rpPM('val');
    $project = rpProject($owner, $pm, 'val');

    $response = $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/reports", [])
        ->assertStatus(422);

    expect(array_keys($response->json()))->toBe(['message', 'errors']);
    expect($response->json('message'))->toBe('The given data was invalid.');
    expect($response->json('errors'))->toHaveKeys(['summary', 'progress_percentage', 'budget_health']);
});

it('updates with the project block and appends uploads', function () {
    Storage::fake('public');
    $owner = rpOwner('upd');
    $pm = rpPM('upd');
    $project = rpProject($owner, $pm, 'upd');
    $report = ProjectReport::create([
        'project_id' => $project->id, 'created_by' => $pm->id,
        'summary' => 'first', 'progress_percentage' => 10, 'budget_health' => 'warning',
        'site_photos' => [], 'attachments' => [], 'published_at' => now(),
    ]);

    $response = $this->actingAs($pm)
        ->post("/api/projects/{$project->id}/reports/{$report->id}", [
            '_method' => 'PUT',
            'summary' => 'second', 'progress_percentage' => 45,
            'photos' => [UploadedFile::fake()->image('extra.png', 20, 20)],
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Report updated successfully!');

    expect($response->json('report.summary'))->toBe('second');
    expect($response->json('report.progress_percentage'))->toBe(45);
    expect($response->json('report.site_photos'))->toHaveCount(1);
    expect($response->json('report'))->toHaveKey('project');
    expect($response->json('report.project.id'))->toBe($project->id);

    // The owner may edit someone else's report; the contractor may not.
    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/reports/{$report->id}", ['summary' => 'owner edit'])
        ->assertStatus(200);

    $kontraktor = User::create([
        'name' => 'Kon', 'username' => 'rpk' . uniqid(),
        'email' => 'rpk' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    $this->actingAs($kontraktor)
        ->putJson("/api/projects/{$project->id}/reports/{$report->id}", ['summary' => 'nope'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'This action is unauthorized.');
});

it('deletes the report and its files', function () {
    Storage::fake('public');
    $owner = rpOwner('del');
    $pm = rpPM('del');
    $project = rpProject($owner, $pm, 'del');

    $photo = UploadedFile::fake()->image('gone.png', 20, 20);
    $photoPath = $photo->store("projects/{$project->id}/reports/photos", 'public');

    $report = ProjectReport::create([
        'project_id' => $project->id, 'created_by' => $pm->id,
        'summary' => 'byebye', 'progress_percentage' => 100, 'budget_health' => 'on_track',
        'site_photos' => [$photoPath], 'attachments' => [], 'published_at' => now(),
    ]);

    $this->actingAs($pm)
        ->deleteJson("/api/projects/{$project->id}/reports/{$report->id}")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Report deleted successfully.');

    expect(ProjectReport::find($report->id))->toBeNull();
    Storage::disk('public')->assertMissing($photoPath);
});
