<?php

use App\Models\Project;
use App\Models\ProjectMilestone;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Payment termin writes
|--------------------------------------------------------------------------
|
| - PUT: binding, recipient/owner/PM gate, dispute freeze, per-field rules,
|   the in-flight drift guard and the contract-value bound;
| - DELETE: owner/PM or the hired contractor for its own role, never a stage
|   with money in flight;
| - link/unlink: recipient or assigned PM, milestone must belong to THIS
|   project, one milestone per role, and the link answer carries the model
|   WITHOUT the milestone relation.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function terminUser(string $tag, string $role = 'user'): User
{
    return User::create([
        'name' => "TW $tag", 'username' => "tw_$tag" . uniqid(),
        'email' => "tw_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

function terminProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "TW Project $tag", 'user_id' => $owner->id,
        'budget' => 10000000, 'status' => 'open', 'target_role' => 'both',
    ]);
}

function terminRow(Project $project, array $extra = []): ProjectPaymentTermin
{
    return ProjectPaymentTermin::create(array_merge([
        'project_id' => $project->id, 'role_type' => 'arsitek',
        'label' => 'DP', 'percentage' => 50, 'amount' => 1000000,
        'status' => 'locked',
    ], $extra));
}

it('updates a payment termin for its owner', function () {
    $owner = terminUser('upd');
    $project = terminProject($owner, 'upd');
    $termin = terminRow($project);

    $this->actingAs(terminUser('upds'))
        ->putJson("/api/projects/{$project->id}/payment-termins/{$termin->id}", ['label' => 'X'])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized.']);

    $response = $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/payment-termins/{$termin->id}", [
            'label' => 'DP Revised', 'notes' => 'Second revision',
            'trigger_description' => 'On signing',
        ])
        ->assertStatus(200);

    expect($response->json('data.label'))->toBe('DP Revised');
    expect($response->json('data.notes'))->toBe('Second revision');
    expect(array_keys($response->json('data')))->toBe([
        'id', 'project_id', 'role_type', 'recipient_id', 'label', 'percentage',
        'amount', 'retention_amount', 'retention_released_at',
        'retention_released_amount', 'net_amount', 'trigger_description',
        'status', 'payment_proof_path', 'verification_notes', 'milestone_id',
        'change_order_id', 'paid_at', 'notes', 'retention_notes',
        'created_at', 'updated_at', 'refunded_amount', 'milestone',
    ]);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/payment-termins/{$termin->id}", ['status' => 'bogus'])
        ->assertStatus(422)
        ->assertJsonPath('errors.status', ['The selected status is invalid.']);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/payment-termins/{$termin->id}", ['amount' => 'abc'])
        ->assertStatus(422)
        ->assertJsonPath('errors.amount', ['The amount field must be an integer.']);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/payment-termins/{$termin->id}", ['percentage' => 150])
        ->assertStatus(422)
        ->assertJsonPath('errors.percentage', ['The percentage field must not be greater than 100.']);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/payment-termins/{$termin->id}", ['milestone_id' => 999999999])
        ->assertStatus(422)
        ->assertJsonPath('errors.milestone_id', ['The selected work phase does not belong to this project.']);
});

it('refuses to re-plan a stage already in flight', function () {
    $owner = terminUser('drift');
    $project = terminProject($owner, 'drift');
    $termin = terminRow($project, ['status' => 'verifying']);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/payment-termins/{$termin->id}", ['amount' => 2000000])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Payment stage "DP" is already verifying and its amount can no longer be changed.');

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/payment-termins/{$termin->id}", ['percentage' => 60])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Payment stage "DP" is already verifying and its percentage can no longer be changed.');

    // A label-only edit is still allowed.
    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/payment-termins/{$termin->id}", ['label' => 'Renamed'])
        ->assertStatus(200);
});

it('deletes only unlocked stages and only for the right caller', function () {
    $owner = terminUser('del');
    $project = terminProject($owner, 'del');
    $termin = terminRow($project);

    $this->actingAs(terminUser('dels'))
        ->deleteJson("/api/projects/{$project->id}/payment-termins/{$termin->id}")
        ->assertStatus(403)
        ->assertExactJson([
            'message' => 'Unauthorized. You can only delete your own role payment terms.',
        ]);

    $termin->update(['status' => 'paid']);
    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/payment-termins/{$termin->id}")
        ->assertStatus(422)
        ->assertExactJson([
            'message' => 'Cannot delete a payment term with an ongoing or completed payment.',
        ]);

    $termin->update(['status' => 'locked']);
    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/payment-termins/{$termin->id}")
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Deleted']);
    expect(ProjectPaymentTermin::find($termin->id))->toBeNull();
});

it('links and unlinks a milestone for the recipient', function () {
    $owner = terminUser('link');
    $recipient = terminUser('linkr');
    $project = terminProject($owner, 'link');
    $milestone = ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Kickoff',
        'type' => 'tech_drawing', 'content' => [], 'sort_order' => 1,
        'is_completed' => false, 'approval_status' => 'approved',
    ]);
    $foreign = terminProject($owner, 'linkf');
    $foreignMilestone = ProjectMilestone::create([
        'project_id' => $foreign->id, 'title' => 'Other',
        'type' => 'tech_drawing', 'content' => [], 'sort_order' => 1,
        'is_completed' => false, 'approval_status' => 'approved',
    ]);
    $termin = terminRow($project, ['recipient_id' => $recipient->id]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/payment-termins/{$termin->id}/link-milestone", [
            'milestone_id' => $milestone->id,
        ])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized.']);

    $this->actingAs($recipient)
        ->postJson("/api/projects/{$project->id}/payment-termins/{$termin->id}/link-milestone", [
            'milestone_id' => $foreignMilestone->id,
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.milestone_id', ['The selected work phase does not belong to this project.']);

    $linked = $this->actingAs($recipient)
        ->postJson("/api/projects/{$project->id}/payment-termins/{$termin->id}/link-milestone", [
            'milestone_id' => $milestone->id,
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Payment linked successfully.');

    expect($linked->json('data.milestone_id'))->toBe($milestone->id);
    // The route-bound model never loaded the relation.
    expect($linked->json('data'))->not->toHaveKey('milestone');

    $second = terminRow($project, ['recipient_id' => $recipient->id]);
    $this->actingAs($recipient)
        ->postJson("/api/projects/{$project->id}/payment-termins/{$second->id}/link-milestone", [
            'milestone_id' => $milestone->id,
        ])
        ->assertStatus(422)
        ->assertExactJson(['message' => 'This work phase is already linked to another payment.']);

    $this->actingAs($recipient)
        ->postJson("/api/projects/{$project->id}/payment-termins/{$termin->id}/unlink-milestone")
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Payment unlinked.']);
    expect($termin->fresh()->milestone_id)->toBeNull();
});
