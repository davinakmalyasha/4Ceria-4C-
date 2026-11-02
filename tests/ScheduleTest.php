<?php

use App\Models\Project;
use App\Models\ProjectManager;
use App\Models\ProjectReport;
use App\Models\ProjectSchedule;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Project schedules: the six-phase timeline, phase edits and delays
|--------------------------------------------------------------------------
|
| - the timeline INITIALIZES missing phases (pending/0) and serializes the
|   newly created rows in create order, existing ones in table order, each
|   with a dynamic `report_count`;
| - update is owner/PM, project-bound, and its validation answers a BARE
|   {"errors": …} body (no `message`);
| - delays are PM-only, shift the phase and every later phase (preserving
|   the baseline once) and notify the owner plus the PM's USER — the old
|   code sent to projects.pm_id, which is a PROFILE id (and broke the FK on
|   PostgreSQL).
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function schOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "schown_$tag" . uniqid(),
        'email' => "schown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function schPM(string $tag): User
{
    $user = User::create([
        'name' => "PM $tag", 'username' => "schpm_$tag" . uniqid(),
        'email' => "schpm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);
    ProjectManager::create(['user_id' => $user->id, 'nama' => "PM $tag"]);

    return $user;
}

it('initializes the six phases and reports the summary', function () {
    $owner = schOwner('init');
    $pm = schPM('init');
    $project = Project::create([
        'title' => 'Schedule init', 'user_id' => $owner->id,
        'budget' => 180_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'pm_id' => $pm->project_manager->id,
    ]);

    $first = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/schedules")
        ->assertStatus(200);

    expect($first->json('schedules'))->toHaveCount(6);
    // Newly created rows serialize in create order.
    expect(array_keys($first->json('schedules.0')))->toBe([
        'project_id', 'phase_slug', 'status', 'progress_percentage',
        'updated_at', 'created_at', 'id', 'report_count',
    ]);
    expect(array_column($first->json('schedules'), 'phase_slug'))->toBe([
        'management', 'legal', 'design', 'build', 'materials', 'handover',
    ]);
    expect($first->json('summary'))->toBe([
        'completion_percentage' => 0,
        'phases_done' => 0,
        'total_phases' => 6,
        'current_phase' => 'management',
        'total_delay_days' => 0,
    ]);

    // Second call: rows loaded from the database, table order.
    $second = $this->actingAs($pm)
        ->getJson("/api/projects/{$project->id}/schedules")
        ->assertStatus(200);

    expect(array_keys($second->json('schedules.0')))->toBe([
        'id', 'project_id', 'phase_slug', 'target_start_date', 'target_end_date',
        'original_target_end_date', 'shifted_days', 'actual_start_date', 'actual_end_date',
        'progress_percentage', 'status', 'notes', 'created_at', 'updated_at', 'report_count',
    ]);
    // Existing rows come back in phase_slug order.
    expect(array_column($second->json('schedules'), 'phase_slug'))->toBe([
        'build', 'design', 'handover', 'legal', 'management', 'materials',
    ]);
});

it('gates the timeline and the phase edit', function () {
    $owner = schOwner('gate');
    $pm = schPM('gate');
    $stranger = schOwner('out');
    $project = Project::create([
        'title' => 'Schedule gate', 'user_id' => $owner->id,
        'budget' => 180_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'pm_id' => $pm->project_manager->id,
    ]);
    $schedule = ProjectSchedule::create([
        'project_id' => $project->id, 'phase_slug' => 'build',
        'status' => 'pending', 'progress_percentage' => 0,
    ]);

    $this->actingAs($stranger)
        ->getJson("/api/projects/{$project->id}/schedules")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    // Validation uses the bare envelope.
    $response = $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/schedules/{$schedule->id}", [
            'status' => 'nope', 'progress_percentage' => 150,
        ])
        ->assertStatus(422);

    expect(array_keys($response->json()))->toBe(['errors']);
    expect($response->json('errors.status'))->toBe(['The selected status is invalid.']);
    expect($response->json('errors.progress_percentage'))->toBe(['The progress percentage field must not be greater than 100.']);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/schedules/{$schedule->id}", [
            'target_start_date' => '2026-11-01', 'target_end_date' => '2026-11-20',
            'status' => 'active', 'progress_percentage' => 40, 'notes' => 'on track',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Phase updated successfully.')
        ->assertJsonPath('phase.status', 'active')
        ->assertJsonPath('phase.progress_percentage', 40);

    // A schedule from another project answers the phase 404.
    $other = Project::create([
        'title' => 'Other', 'user_id' => $owner->id,
        'budget' => 1_000_000, 'status' => 'open', 'target_role' => 'both',
    ]);
    $foreign = ProjectSchedule::create([
        'project_id' => $other->id, 'phase_slug' => 'build',
        'status' => 'pending', 'progress_percentage' => 0,
    ]);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/schedules/{$foreign->id}", ['status' => 'active'])
        ->assertStatus(404)
        ->assertJsonPath('message', 'Phase not found in this project.');
});

it('logs a delay, shifts later phases and notifies the PM user', function () {
    $owner = schOwner('dly');
    $pm = schPM('dly');
    $project = Project::create([
        'title' => 'Delays', 'user_id' => $owner->id,
        'budget' => 180_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'pm_id' => $pm->project_manager->id,
    ]);

    $build = ProjectSchedule::create([
        'project_id' => $project->id, 'phase_slug' => 'build', 'status' => 'active',
        'target_start_date' => '2026-11-01', 'target_end_date' => '2026-11-20',
    ]);
    $handover = ProjectSchedule::create([
        'project_id' => $project->id, 'phase_slug' => 'handover', 'status' => 'pending',
        'target_start_date' => '2026-12-01', 'target_end_date' => '2026-12-10',
    ]);
    $legal = ProjectSchedule::create([
        'project_id' => $project->id, 'phase_slug' => 'legal', 'status' => 'pending',
        'target_start_date' => '2026-10-01', 'target_end_date' => '2026-10-10',
    ]);

    // Only the PM may log a delay.
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/delays", [
            'phase_slug' => 'build', 'days' => 3, 'reason' => 'rain', 'category' => 'weather',
        ])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the PM can log delays.');

    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/delays", [])
        ->assertStatus(422)
        ->assertJsonPath('errors.days', ['The days field is required.']);

    $response = $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/delays", [
            'phase_slug' => 'build', 'days' => 3, 'reason' => 'rain', 'category' => 'weather',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Delay logged and stakeholders notified.');

    // Created-model order for the delay.
    expect(array_keys($response->json('delay')))->toBe([
        'project_id', 'phase_slug', 'days', 'reason', 'category',
        'logged_at', 'updated_at', 'created_at', 'id',
    ]);

    $fresh = $build->fresh();
    expect($fresh->target_start_date)->toBe('2026-11-04');
    expect($fresh->target_end_date)->toBe('2026-11-23');
    expect($fresh->original_target_end_date)->toBe('2026-11-20');
    expect($fresh->shifted_days)->toBe(3);

    // handover is after build, so it shifts too; legal is before and does not.
    expect($handover->fresh()->target_end_date)->toBe('2026-12-13');
    expect($legal->fresh()->shifted_days)->toBe(0);

    // Owner + the PM's USER id; projects.pm_id is a PROFILE id.
    $recipients = \App\Models\Notification::where('type', 'schedule_delayed')
        ->orderBy('id')->pluck('user_id')->all();
    expect($recipients)->toBe([$owner->id, $pm->id]);
});

it('counts reports and lists unlinked ones with their creator', function () {
    $owner = schOwner('rep');
    $project = Project::create([
        'title' => 'Reports', 'user_id' => $owner->id,
        'budget' => 180_000_000, 'status' => 'in_progress', 'target_role' => 'both',
    ]);

    ProjectSchedule::create([
        'project_id' => $project->id, 'phase_slug' => 'build',
        'status' => 'pending', 'progress_percentage' => 0,
    ]);
    ProjectReport::create([
        'project_id' => $project->id, 'phase_slug' => 'build', 'created_by' => $owner->id,
        'summary' => 'phased', 'progress_percentage' => 10, 'budget_health' => 'on_track',
    ]);
    ProjectReport::create([
        'project_id' => $project->id, 'phase_slug' => null, 'created_by' => $owner->id,
        'summary' => 'unlinked', 'progress_percentage' => 25, 'budget_health' => 'on_track',
        'site_photos' => [], 'attachments' => [],
    ]);

    $response = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/schedules")
        ->assertStatus(200);

    $build = collect($response->json('schedules'))->firstWhere('phase_slug', 'build');
    expect($build['report_count'])->toBe(1);

    expect($response->json('unlinked_reports'))->toHaveCount(1);
    expect($response->json('unlinked_reports.0.summary'))->toBe('unlinked');
    expect($response->json('unlinked_reports.0.creator.id'))->toBe($owner->id);
    expect($response->json('unlinked_reports.0.progress_percentage'))->toBe(25);
});
