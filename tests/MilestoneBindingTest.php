<?php

use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectMilestone;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use App\Rules\MilestoneBelongsToProject;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| A payment stage may only be linked to a milestone on its OWN project
|--------------------------------------------------------------------------
|
| Regression suite for a MEDIUM audit finding.
|
| Every site that accepted a `milestone_id` validated it as
|
|     'exists:project_milestones,id'
|
| which only proves the row exists SOMEWHERE. So a payment stage -- the thing
| that gates real money -- could be linked to a milestone belonging to a
| DIFFERENT project.
|
| The link then works in the attacker's favour.
| `ProjectMilestoneController::unlockLinkedTermin()` flips every termin whose
| `milestone_id` points at an approved milestone from `locked` to `pending`. So
| when the VICTIM project's owner or PM approved their own milestone, the
| ATTACKER's payment stage was unlocked -- with none of the attacker's own work
| done, and without the attacker ever asking the victim's PM for anything. The
| attacker had effectively self-authorised the release of their own fee.
|
| `UpdateProjectRequest` was worse: it had NO `payment_termins.*.milestone_id`
| rule at all, while `ProjectController::update()` writes
| `$termin['milestone_id']` straight from the payload.
|
| Replaced with `App\Rules\MilestoneBelongsToProject`, which resolves the project
| from the constructor when a controller has it and from the route when a
| FormRequest does not -- so one rule covers both.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function msUser(string $roleType, string $tag): User
{
    $user = User::create([
        'name' => "User $tag", 'username' => "u_$tag" . uniqid(),
        'email' => "e_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $roleType,
    ]);

    if ($roleType === 'kontraktor') {
        Kontraktor::create([
            'user_id' => $user->id, 'nama' => "Kontraktor $tag",
            'verification_status' => 'verified',
        ]);
    }

    return $user;
}

function msProject(string $tag, User $owner, array $columns = []): Project
{
    return Project::create(array_merge([
        'title' => "Project $tag", 'user_id' => $owner->id,
        'budget' => 300_000_000, 'status' => 'in_progress',
    ], $columns));
}

function msMilestone(Project $project, string $title): ProjectMilestone
{
    return ProjectMilestone::create([
        'project_id' => $project->id,
        'title' => $title,
        'is_completed' => false,
        'approval_status' => 'pending',
    ]);
}

function msTermin(Project $project, User $recipient, array $columns = []): ProjectPaymentTermin
{
    return ProjectPaymentTermin::create(array_merge([
        'project_id' => $project->id,
        'label' => 'Stage',
        'percentage' => 50,
        'amount' => 10_000_000,
        'role_type' => 'kontraktor',
        'recipient_id' => $recipient->id,
        'status' => 'locked',
    ], $columns));
}

// ---------------------------------------------------------------------------
// The rule itself
// ---------------------------------------------------------------------------

it('accepts a milestone from the same project', function () {
    $owner = msUser('user', 'r1');
    $project = msProject('r1', $owner);
    $milestone = msMilestone($project, 'Own phase');

    $rule = new MilestoneBelongsToProject((int) $project->id);

    $failed = false;
    $rule->validate('milestone_id', $milestone->id, function () use (&$failed) {
        $failed = true;
    });

    expect($failed)->toBeFalse();
});

it('rejects a milestone from a DIFFERENT project', function () {
    $owner = msUser('user', 'r2');
    $mine = msProject('r2', $owner);
    $theirs = msProject('r2b', $owner);

    $foreign = msMilestone($theirs, 'Foreign phase');

    $rule = new MilestoneBelongsToProject((int) $mine->id);

    $failed = false;
    $rule->validate('milestone_id', $foreign->id, function () use (&$failed) {
        $failed = true;
    });

    expect($failed)->toBeTrue();
});

it('allows null so the field stays optional', function () {
    $owner = msUser('user', 'r3');
    $project = msProject('r3', $owner);

    $rule = new MilestoneBelongsToProject((int) $project->id);

    $failed = false;
    $rule->validate('milestone_id', null, function () use (&$failed) {
        $failed = true;
    });

    expect($failed)->toBeFalse();
});

it('fails closed when no project can be determined', function () {
    // Silently passing would reintroduce the bug it exists to prevent.
    $failed = false;

    (new MilestoneBelongsToProject(null))->validate('milestone_id', 12345, function () use (&$failed) {
        $failed = true;
    });

    expect($failed)->toBeTrue();
});

// ---------------------------------------------------------------------------
// End to end
// ---------------------------------------------------------------------------

it('refuses to link a stage to a milestone on another project', function () {
    $owner = msUser('user', 'e1');
    $pro = msUser('kontraktor', 'e1p');

    $mine = msProject('e1', $owner);
    $theirs = msProject('e1b', $owner);

    $termin = msTermin($mine, $pro);
    $foreign = msMilestone($theirs, 'Victim phase');

    $this->actingAs($pro)
        ->postJson("/api/projects/{$mine->id}/payment-termins/{$termin->id}/link-milestone", [
            'milestone_id' => $foreign->id,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('milestone_id');

    expect($termin->fresh()->milestone_id)->toBeNull();
});

it('still links a stage to a milestone on its OWN project', function () {
    $owner = msUser('user', 'e2');
    $pro = msUser('kontraktor', 'e2p');

    $project = msProject('e2', $owner);
    $termin = msTermin($project, $pro);
    $own = msMilestone($project, 'Our phase');

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/payment-termins/{$termin->id}/link-milestone", [
            'milestone_id' => $own->id,
        ])
        ->assertStatus(200);

    expect((int) $termin->fresh()->milestone_id)->toBe((int) $own->id);
});

it('refuses a project update that links a stage to a foreign milestone', function () {
    // `UpdateProjectRequest` had no rule for this field at all.
    $owner = msUser('user', 'e3');
    $pro = msUser('kontraktor', 'e3p');

    $mine = msProject('e3', $owner, ['selected_kontraktor_id' => $pro->kontraktor->id]);
    $theirs = msProject('e3b', $owner);

    $termin = msTermin($mine, $pro);
    $foreign = msMilestone($theirs, 'Victim phase');

    $this->actingAs($owner)
        ->putJson("/api/projects/{$mine->id}", [
            'title' => $mine->title,
            'payment_termins' => [
                [
                    'label' => 'Stage',
                    'percentage' => 50,
                    'amount' => 10_000_000,
                    'milestone_id' => $foreign->id,
                ],
            ],
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('payment_termins.0.milestone_id');

    expect($termin->fresh()->milestone_id)->toBeNull();
});

it('does not let approving a FOREIGN milestone unlock this project\'s stage', function () {
    // The payoff the whole thing enables. With the binding enforced, linking is
    // impossible, so no approval elsewhere can release this money.
    $owner = msUser('user', 'e4');
    $pro = msUser('kontraktor', 'e4p');

    $mine = msProject('e4', $owner);
    $theirs = msProject('e4b', $owner);

    $termin = msTermin($mine, $pro, ['status' => 'locked']);
    $foreign = msMilestone($theirs, 'Victim phase');

    $this->actingAs($pro)
        ->postJson("/api/projects/{$mine->id}/payment-termins/{$termin->id}/link-milestone", [
            'milestone_id' => $foreign->id,
        ])
        ->assertStatus(422);

    // Now approve the foreign milestone and confirm nothing moved.
    $foreign->update(['approval_status' => 'approved', 'is_completed' => true]);

    \App\Models\ProjectPaymentTermin::where('milestone_id', $foreign->id)
        ->update(['status' => 'pending']);

    expect($termin->fresh()->status)->toBe('locked');
});