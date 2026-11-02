<?php

use App\Models\BidProjectManager;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectManager;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Project-manager bids: submit, shortlist, hire and decline
|--------------------------------------------------------------------------
|
| Regression suite for the four pm-bids routes:
| - only project managers submit, the project must want a PM and have
|   none, and the created model answers in its declared default order;
| - shortlist/accept/decline are owner-only and answer the project
|   resource;
| - accept writes the PM's PROFILE id into projects.pm_id (the oracle
|   used to write the USER id, which no Hire gate could match).
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function pmbOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "pmbown_$tag" . uniqid(),
        'email' => "pmbown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function pmbManager(string $tag): User
{
    $user = User::create([
        'name' => "PM $tag", 'username' => "pmbm_$tag" . uniqid(),
        'email' => "pmbm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);

    ProjectManager::create(['user_id' => $user->id, 'nama' => "PM $tag"]);

    return $user;
}

function pmbProject(User $owner, string $tag, bool $wantsPM = true): Project
{
    return Project::create([
        'title' => "PM Job $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open', 'target_role' => 'both',
        'wants_project_manager' => $wantsPM,
    ]);
}

it('submits a bid in model-default order', function () {
    $owner = pmbOwner('sub');
    $pm = pmbManager('sub');
    $project = pmbProject($owner, 'sub');

    $response = $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/pm-bids", [
            'price' => 2_500_000, 'proposal' => 'I will manage.',
            'estimated_duration' => 8, 'duration_unit' => 'weeks',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Bid submitted successfully!');

    expect(array_keys($response->json('bid')))->toBe([
        'duration_unit', 'status', 'payment_status', 'project_id', 'pm_id', 'price',
        'fee_type', 'unit_price', 'quantity', 'calculated_total', 'proposal',
        'estimated_duration', 'scopes', 'deliverables', 'updated_at', 'created_at', 'id',
    ]);
    expect($response->json('bid.price'))->toBe('2500000.00');
    expect($response->json('bid.status'))->toBe('pending');

    expect(Notification::where('user_id', $owner->id)->where('type', 'pm_bid_received')->count())->toBe(1);
});

it('gates the submission and refuses duplicates', function () {
    $owner = pmbOwner('gate');
    $pm = pmbManager('gate');
    $notWanted = pmbProject($owner, 'nw', false);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$notWanted->id}/pm-bids", ['price' => 1, 'proposal' => 'x'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only Project Managers can submit this bid.');

    $this->actingAs($pm)
        ->postJson("/api/projects/{$notWanted->id}/pm-bids", ['price' => 1, 'proposal' => 'x'])
        ->assertStatus(400)
        ->assertJsonPath('message', 'This project does not require a Project Manager.');

    $project = pmbProject($owner, 'ok');
    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/pm-bids", [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['price', 'proposal']);

    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/pm-bids", ['price' => 1_000_000, 'proposal' => 'x'])
        ->assertStatus(200);

    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/pm-bids", ['price' => 1_000_000, 'proposal' => 'x'])
        ->assertStatus(400)
        ->assertJsonPath('message', 'You have already submitted a bid for this project.');
});

it('shortlists, hires and declines for the owner only', function () {
    $owner = pmbOwner('flow');
    $stranger = pmbOwner('out');
    $pm = pmbManager('flow');
    $project = pmbProject($owner, 'flow');
    $bid = BidProjectManager::create([
        'project_id' => $project->id, 'pm_id' => $pm->project_manager->id,
        'price' => 2_500_000, 'proposal' => 'I will manage.', 'status' => 'pending',
    ]);

    $this->actingAs($stranger)
        ->postJson("/api/projects/{$project->id}/pm-bids/{$bid->id}/shortlist")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only project owner can shortlist.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/pm-bids/{$bid->id}/shortlist")
        ->assertStatus(200);

    expect($bid->fresh()->status)->toBe('shortlisted');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/pm-bids/{$bid->id}/accept")
        ->assertStatus(200);

    // The PROFILE id lands in projects.pm_id — the same space
    // Hire::isAssignedPm compares against.
    expect($project->fresh()->pm_id)->toBe($pm->project_manager->id);
    expect($bid->fresh()->status)->toBe('contract_pending');

    $second = BidProjectManager::create([
        'project_id' => $project->id, 'pm_id' => pmbManager('flow2')->project_manager->id,
        'price' => 1_000_000, 'proposal' => 'second', 'status' => 'pending',
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/pm-bids/{$second->id}/decline")
        ->assertStatus(200);

    expect($second->fresh()->status)->toBe('declined');
});
