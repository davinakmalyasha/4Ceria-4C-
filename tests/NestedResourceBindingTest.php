<?php

use App\Models\Project;
use App\Models\ProjectDailyLog;
use App\Models\StickyNote;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| A nested route param must belong to the project in the URL
|--------------------------------------------------------------------------
|
| Regression suite for MEDIUM audit findings.
|
| `ProjectDailyLogController::destroy`, `StickyNoteController::update` and
| `StickyNoteController::destroy` each authorized on AUTHORSHIP alone:
|
|     if ($dailyLog->user_id !== Auth::id()) { return 403; }
|
| Route model binding resolves `{dailyLog}` / `{stickyNote}` by PRIMARY KEY
| alone, so the `{project}` segment in the URL was never checked. A caller who
| had authored a log or note on project A could therefore write it through the
| URL of project B:
|
|     DELETE /api/projects/B/daily-logs/{id-of-A}
|
| The record was really deleted. Worse, `logActivity()` then wrote the deletion
| entry against project B, so the audit trail for an unrelated project recorded a
| site-log deletion that never happened there.
|
| The project binding check is the pattern used across this codebase for nested
| resources, and it is added BEFORE the authorship check so that a mismatch reads
| as "not found" rather than confirming the record exists.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function idorUser(string $tag): User
{
    return User::create([
        'name' => "User $tag", 'username' => "u_$tag" . uniqid(),
        'email' => "e_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function idorProject(string $tag, User $owner): Project
{
    return Project::create([
        'title' => "Project $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
    ]);
}

// ---------------------------------------------------------------------------
// Daily logs
// ---------------------------------------------------------------------------

it('refuses to delete a daily log through a DIFFERENT project URL', function () {
    $user = idorUser('dl');
    $owner = idorUser('dlo');

    $realProject = idorProject('dlA', $owner);
    $decoyProject = idorProject('dlB', $owner);

    $log = ProjectDailyLog::create([
        'project_id' => $realProject->id,
        'user_id' => $user->id,
        'log_date' => now()->toDateString(),
        'activities' => 'Foundation poured',
    ]);

    $this->actingAs($user)
        ->deleteJson("/api/projects/{$decoyProject->id}/daily-logs/{$log->id}")
        ->assertStatus(404);

    // The record must survive.
    expect(ProjectDailyLog::find($log->id))->not->toBeNull();
});

it('does not write an audit entry against the wrong project', function () {
    $user = idorUser('audit');
    $owner = idorUser('audito');

    $realProject = idorProject('auA', $owner);
    $decoyProject = idorProject('auB', $owner);

    $log = ProjectDailyLog::create([
        'project_id' => $realProject->id,
        'user_id' => $user->id,
        'log_date' => now()->toDateString(),
        'activities' => 'Walls up',
    ]);

    $this->actingAs($user)
        ->deleteJson("/api/projects/{$decoyProject->id}/daily-logs/{$log->id}")
        ->assertStatus(404);

    expect(\App\Models\ProjectActivityLog::where('project_id', $decoyProject->id)->count())->toBe(0)
        ->and(\App\Models\ProjectActivityLog::where('project_id', $realProject->id)->count())->toBe(0);
});

it('still deletes a daily log through its OWN project URL', function () {
    $user = idorUser('dlok');
    $owner = idorUser('dloko');

    $project = idorProject('dlok', $owner);

    $log = ProjectDailyLog::create([
        'project_id' => $project->id,
        'user_id' => $user->id,
        'log_date' => now()->toDateString(),
        'activities' => 'Roof framed',
    ]);

    $this->actingAs($user)
        ->deleteJson("/api/projects/{$project->id}/daily-logs/{$log->id}")
        ->assertStatus(200);

    expect(ProjectDailyLog::find($log->id))->toBeNull();

    // And the audit entry lands on the right project this time.
    expect(\App\Models\ProjectActivityLog::where('project_id', $project->id)->count())->toBe(1);
});

it('still refuses another user\'s daily log on the correct project', function () {
    $author = idorUser('other');
    $intruder = idorUser('intruder');
    $owner = idorUser('own2');

    $project = idorProject('auth', $owner);

    $log = ProjectDailyLog::create([
        'project_id' => $project->id,
        'user_id' => $author->id,
        'log_date' => now()->toDateString(),
        'activities' => 'Not yours',
    ]);

    $this->actingAs($intruder)
        ->deleteJson("/api/projects/{$project->id}/daily-logs/{$log->id}")
        ->assertStatus(403);

    expect(ProjectDailyLog::find($log->id))->not->toBeNull();
});

// ---------------------------------------------------------------------------
// Sticky notes
// ---------------------------------------------------------------------------

it('refuses to update a sticky note through a DIFFERENT project URL', function () {
    $user = idorUser('sn');
    $owner = idorUser('sno');

    $realProject = idorProject('snA', $owner);
    $decoyProject = idorProject('snB', $owner);

    $note = StickyNote::create([
        'project_id' => $realProject->id,
        'user_id' => $user->id,
        'title' => 'Original',
        'content' => 'Original body',
    ]);

    $this->actingAs($user)
        ->putJson("/api/projects/{$decoyProject->id}/sticky-notes/{$note->id}", [
            'title' => 'Overwritten',
        ])
        ->assertStatus(404);

    expect($note->fresh()->title)->toBe('Original');
});

it('refuses to delete a sticky note through a DIFFERENT project URL', function () {
    $user = idorUser('snd');
    $owner = idorUser('sndo');

    $realProject = idorProject('snC', $owner);
    $decoyProject = idorProject('snD', $owner);

    $note = StickyNote::create([
        'project_id' => $realProject->id,
        'user_id' => $user->id,
        'title' => 'Keep me',
        'content' => 'Still here',
    ]);

    $this->actingAs($user)
        ->deleteJson("/api/projects/{$decoyProject->id}/sticky-notes/{$note->id}")
        ->assertStatus(404);

    expect(StickyNote::find($note->id))->not->toBeNull();
});

it('still updates and deletes a sticky note through its OWN project URL', function () {
    $user = idorUser('snok');
    $owner = idorUser('snoko');

    $project = idorProject('snok', $owner);

    $note = StickyNote::create([
        'project_id' => $project->id,
        'user_id' => $user->id,
        'title' => 'Original',
        'content' => 'Body',
    ]);

    $this->actingAs($user)
        ->putJson("/api/projects/{$project->id}/sticky-notes/{$note->id}", [
            'title' => 'Updated',
        ])
        ->assertStatus(200);

    expect($note->fresh()->title)->toBe('Updated');

    $this->actingAs($user)
        ->deleteJson("/api/projects/{$project->id}/sticky-notes/{$note->id}")
        ->assertStatus(200);

    expect(StickyNote::find($note->id))->toBeNull();
});

it('reports a cross-project attempt as NOT FOUND, not as a 403', function () {
    // A 403 would confirm the record exists, which is itself a small leak for
    // enumerable ids.
    $user = idorUser('sn404');
    $owner = idorUser('sn404o');

    $realProject = idorProject('snE', $owner);
    $decoyProject = idorProject('snF', $owner);

    $note = StickyNote::create([
        'project_id' => $realProject->id,
        'user_id' => $user->id,
        'title' => 'x', 'content' => 'y',
    ]);

    $this->actingAs($user)
        ->deleteJson("/api/projects/{$decoyProject->id}/sticky-notes/{$note->id}")
        ->assertStatus(404)
        ->assertJsonPath('message', 'Not found');
});