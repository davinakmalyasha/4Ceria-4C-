<?php

use App\Models\Arsitek;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\ProjectManager;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Budget addendum proposals and their negotiation
|--------------------------------------------------------------------------
|
| Regression suite for the addendum decision machine:
| - createAddendum admits only the hired professional for their own
|   role and validates with the standard bag.
| - handleAddendumStatus splits the authoriser (owner/assigned PM) from
|   the proposer, with a distinct 403 per overreach and a 422 once the
|   item leaves the negotiable states.
| - The full chain (negotiate, revise, accept, authorise) notifies the
|   other side each step and binds the amount once authorised.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function addOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "aown_$tag" . uniqid(),
        'email' => "aown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function addArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "aa_$tag" . uniqid(),
        'email' => "aa_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);

    return $user;
}

function addPM(string $tag): User
{
    $user = User::create([
        'name' => "PM $tag", 'username' => "apm_$tag" . uniqid(),
        'email' => "apm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);

    ProjectManager::create(['user_id' => $user->id, 'nama' => "PM $tag"]);

    return $user;
}

function addProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "Addendum Job $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open',
        'target_role' => 'both',
    ]);
}

function addUri(Project $project): string
{
    return "/api/projects/{$project->id}/budget/addendums";
}

function decideUri(Project $project, int $id): string
{
    return "/api/projects/{$project->id}/budget/addendums/{$id}";
}

it('admits only hired professionals and validates the proposal', function () {
    $owner = addOwner('hire');
    $stranger = addOwner('outsider');
    $pro = addArchitect('hire');
    $project = addProject($owner, 'hire');
    $project->update(['selected_arsitek_id' => $pro->arsitek->id]);

    $this->actingAs($stranger)
        ->postJson(addUri($project), ['title' => 'x', 'amount' => 100])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Must be hired professional.');

    // The owner is not hired on their own project.
    $this->actingAs($owner)
        ->postJson(addUri($project), ['title' => 'x', 'amount' => 100])
        ->assertStatus(403);

    $this->actingAs($pro)
        ->postJson(addUri($project), [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['title', 'amount']);

    $this->actingAs($pro)
        ->postJson(addUri($project), ['title' => 'x', 'amount' => 100, 'type' => 'zzz'])
        ->assertStatus(422)
        ->assertJsonPath('errors.type', ['The selected type is invalid.']);

    $this->actingAs($pro)
        ->postJson(addUri($project), ['title' => 'x', 'amount' => 100, 'team_member_id' => 999999])
        ->assertStatus(422)
        ->assertJsonPath('errors.team_member_id', ['The selected team member id is invalid.']);

    expect(ProjectAddendum::where('project_id', $project->id)->count())->toBe(0);
});

it('mints a pending addendum with create-order keys', function () {
    $owner = addOwner('mint');
    $pro = addArchitect('mint');
    $project = addProject($owner, 'mint');
    $project->update(['selected_arsitek_id' => $pro->arsitek->id]);

    $response = $this->actingAs($pro)
        ->postJson(addUri($project), ['title' => 'Extra', 'amount' => 300000, 'description' => 'scratch'])
        ->assertStatus(200);

    expect($response->json('message'))->toBe('Addendum submitted for client approval.');
    $row = $response->json('addendum');
    expect(array_keys($row))->toBe(['project_id', 'role_type', 'user_id', 'title', 'amount', 'description', 'type', 'team_member_id', 'assigned_user_id', 'specialist_type', 'attachment_path', 'status', 'updated_at', 'created_at', 'id']);
    expect($row['status'])->toBe('pending_approval');
    expect($row['type'])->toBe('extra_fee');
    expect($row['amount'])->toBe('300000.00');
});

it('splits authoriser from proposer with a 403 per overreach', function () {
    $owner = addOwner('split');
    $pro = addArchitect('split');
    $outsider = addOwner('split-out');
    $project = addProject($owner, 'split');
    $project->update(['selected_arsitek_id' => $pro->arsitek->id]);
    $addendum = ProjectAddendum::create([
        'project_id' => $project->id, 'type' => 'extra_fee',
        'role_type' => 'arsitek', 'user_id' => $pro->id,
        'title' => 'Extra', 'amount' => 100000, 'status' => 'pending_approval',
    ]);

    $this->actingAs($outsider)
        ->putJson(decideUri($project, $addendum->id), ['status' => 'rejected'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only the project owner or assigned PM can authorise budget items.');

    // The proposer cannot authorise their own fee.
    $this->actingAs($pro)
        ->putJson(decideUri($project, $addendum->id), ['status' => 'rejected'])
        ->assertStatus(403)
        ->assertJsonPath('message', "A professional may accept or counter a negotiation, but cannot authorise or reject their own addendum. That is the Owner's or PM's decision.");

    // A missing row is the plain 404, never the debug trace.
    $this->actingAs($owner)
        ->putJson(decideUri($project, $addendum->id + 99999), ['status' => 'rejected'])
        ->assertStatus(404)
        ->assertJsonPath('message', 'Addendum not found.');

    // A settled row refuses with the processed 422 before any write.
    $paid = ProjectAddendum::create([
        'project_id' => $project->id, 'type' => 'extra_fee',
        'role_type' => 'arsitek', 'user_id' => $pro->id,
        'title' => 'Done', 'amount' => 100000, 'status' => 'paid',
    ]);
    $this->actingAs($owner)
        ->putJson(decideUri($project, $paid->id), ['status' => 'rejected'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'This item has already been processed or is not in a negotiable state.');
});

it('walks the negotiation chain with a notification each step', function () {
    $owner = addOwner('chain');
    $pro = addArchitect('chain');
    $pm = addPM('chain');
    $project = addProject($owner, 'chain');
    $project->update(['selected_arsitek_id' => $pro->arsitek->id, 'pm_id' => $pm->project_manager->id]);
    $addendum = ProjectAddendum::create([
        'project_id' => $project->id, 'type' => 'extra_fee',
        'role_type' => 'arsitek', 'user_id' => $pro->id,
        'title' => 'Extra', 'amount' => 300000, 'status' => 'pending_approval',
    ]);

    $this->actingAs($owner)
        ->putJson(decideUri($project, $addendum->id), ['status' => 'negotiating', 'counter_offer_amount' => 250000, 'negotiation_note' => 'trim'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Negotiation request sent.');
    expect($addendum->fresh()->counter_offer_amount)->toBe('250000.00');

    $this->actingAs($pro)
        ->putJson(decideUri($project, $addendum->id), ['status' => 'negotiating'])
        ->assertStatus(200);

    $this->actingAs($pro)
        ->putJson(decideUri($project, $addendum->id), ['status' => 'accepted_by_pro'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Counter-offer accepted. Awaiting authorisation.');
    // Accepting adopts the counter figure.
    expect($addendum->fresh()->amount)->toBe('250000.00');

    $this->actingAs($owner)
        ->putJson(decideUri($project, $addendum->id), ['status' => 'approved_unpaid'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Budget authorized successfully. Awaiting payment from the Project Owner.');
    expect($addendum->fresh()->status)->toBe('approved_unpaid');

    // Each step told the other side.
    expect(Notification::where('type', 'budget_negotiation')->count())->toBe(2);
    expect(Notification::where('type', 'budget_counter_accepted')->count())->toBe(1);
    expect(Notification::where('type', 'budget_approved')->count())->toBe(1);
});

it('binds the agreed figure once negotiation closes', function () {
    $owner = addOwner('bind');
    $pro = addArchitect('bind');
    $project = addProject($owner, 'bind');
    $project->update(['selected_arsitek_id' => $pro->arsitek->id]);
    $addendum = ProjectAddendum::create([
        'project_id' => $project->id, 'type' => 'extra_fee',
        'role_type' => 'arsitek', 'user_id' => $pro->id,
        'title' => 'Extra', 'amount' => 300000, 'status' => 'accepted_by_pro',
    ]);

    // The figure is binding: revising it now is refused.
    $this->actingAs($owner)
        ->putJson(decideUri($project, $addendum->id), ['status' => 'accepted_by_pro', 'amount' => 999])
        ->assertStatus(422)
        ->assertJsonPath('message', 'The agreed amount is binding once an addendum leaves negotiation.');
});

it('rejects with the authoriser label and tells the proposer', function () {
    $owner = addOwner('rej');
    $pro = addArchitect('rej');
    $pm = addPM('rej');
    $project = addProject($owner, 'rej');
    $project->update(['selected_arsitek_id' => $pro->arsitek->id, 'pm_id' => $pm->project_manager->id]);
    $addendum = ProjectAddendum::create([
        'project_id' => $project->id, 'type' => 'extra_fee',
        'role_type' => 'arsitek', 'user_id' => $pro->id,
        'title' => 'Extra', 'amount' => 100000, 'status' => 'pending_approval',
    ]);

    $pmUser = $pm;

    $this->actingAs($owner)
        ->putJson(decideUri($project, $addendum->id), ['status' => 'rejected'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Budget authorization rejected.');

    // Rejection tells the PM (the owner's counterpart), not the proposer.
    $notice = Notification::where('user_id', $pmUser->id)->where('type', 'budget_rejected')->latest('id')->first();
    expect($notice)->not->toBeNull();
    expect($notice->title)->toBe('Budget Authorization Rejected by Owner');
});
