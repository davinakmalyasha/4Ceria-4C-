<?php

use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectDailyLog;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Daily site logs: participant read, contractor/PM write, author delete
|--------------------------------------------------------------------------
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function dlOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "dlown_$tag" . uniqid(),
        'email' => "dlown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function dlContractor(string $tag): User
{
    $user = User::create([
        'name' => "Kon $tag", 'username' => "dlk_$tag" . uniqid(),
        'email' => "dlk_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    Kontraktor::create(['user_id' => $user->id, 'nama' => "Build $tag"]);
    return $user;
}

it('logs site activity and answers the created model', function () {
    $owner = dlOwner('ok');
    $kon = dlContractor('ok');
    $project = Project::create([
        'title' => 'Logs', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'selected_kontraktor_id' => $kon->kontraktor->id,
    ]);

    $response = $this->actingAs($kon)
        ->postJson("/api/projects/{$project->id}/daily-logs", [
            'log_date' => '2026-10-30', 'weather' => 'sunny',
            'worker_count' => 12, 'activities' => 'pour concrete',
        ])
        ->assertStatus(200);

    expect(array_keys($response->json('data')))->toBe([
        'user_id', 'log_date', 'weather', 'worker_count', 'activities', 'issues',
        'photos', 'project_id', 'updated_at', 'created_at', 'id', 'user',
    ]);
    expect($response->json('data.user.id'))->toBe($kon->id);

    $list = $this->actingAs($owner)->getJson("/api/projects/{$project->id}/daily-logs")->assertStatus(200);
    expect($list->json('data'))->toHaveCount(1);

    $log = ProjectDailyLog::where('project_id', $project->id)->sole();
    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/daily-logs/{$log->id}")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    $this->actingAs($kon)
        ->deleteJson("/api/projects/{$project->id}/daily-logs/{$log->id}")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Log entry deleted.');
});

it('gates the log and the PBG lock', function () {
    $owner = dlOwner('gate');
    $stranger = dlOwner('out');
    $project = Project::create([
        'title' => 'Logs gate', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'project_category' => 'new_build',
    ]);

    $this->actingAs($stranger)
        ->getJson("/api/projects/{$project->id}/daily-logs")
        ->assertStatus(403);

    // The owner is not a site logger.
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/daily-logs", [
            'log_date' => '2026-10-30', 'weather' => 'sun', 'worker_count' => 1, 'activities' => 'x',
        ])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only the hired contractor, PM, or active sub-professionals can log site activity.');
});
