<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\BidStructural;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectManager;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Shortlist a bid
|--------------------------------------------------------------------------
|
| Owner and assigned PM may shortlist any role; the lead architect or lead
| contractor may shortlist SPECIALISTS. A PM-managed project refuses the owner
| while the PM is the acting party. Only live bids qualify, and the answer is
| the reloaded project resource.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function slUser(string $tag, string $role = 'user'): User
{
    return User::create([
        'name' => "SL $tag", 'username' => "sl_$tag" . uniqid(),
        'email' => "sl_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

function slProject(User $owner, string $tag, array $extra = []): Project
{
    return Project::create(array_merge([
        'title' => "SL Project $tag", 'user_id' => $owner->id,
        'budget' => 10000000, 'status' => 'open', 'target_role' => 'both',
    ], $extra));
}

it('shortlists a live bid and notifies the professional', function () {
    $owner = slUser('own');
    $project = slProject($owner, 'own');
    $architect = slUser('arch', 'arsitek');
    $profile = Arsitek::create(['user_id' => $architect->id, 'nama' => 'Arch']);
    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 5000000, 'proposal' => 'x', 'status' => 'pending',
    ]);

    $this->actingAs(slUser('str'))
        ->postJson("/api/projects/{$project->id}/shortlist-bid", [
            'bid_id' => $bid->id, 'bid_type' => 'arsitek',
        ])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized. Only project owner, PM, or assigned lead professional can shortlist candidates.']);

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/shortlist-bid", [
            'bid_id' => $bid->id, 'bid_type' => 'arsitek',
        ])
        ->assertStatus(200)
        ->assertJsonPath('data.id', $project->id);

    expect($bid->fresh()->status)->toBe('shortlisted');
    expect(Notification::where('user_id', $architect->id)
        ->where('type', 'bid_shortlisted')->count())->toBe(1);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/shortlist-bid", [
            'bid_id' => $bid->id, 'bid_type' => 'arsitek',
        ])
        ->assertStatus(422)
        ->assertExactJson(['message' => "A bid with status 'shortlisted' cannot be shortlisted."]);
});

it('refuses the owner on a PM-managed project but not the PM', function () {
    $owner = slUser('pmown');
    $pmUser = slUser('pmpm', 'project_manager');
    $pmProfile = ProjectManager::create(['user_id' => $pmUser->id, 'nama' => 'PM']);
    $project = slProject($owner, 'pm', [
        'wants_project_manager' => true, 'pm_id' => $pmProfile->id,
    ]);
    $architect = slUser('pmarch', 'arsitek');
    $profile = Arsitek::create(['user_id' => $architect->id, 'nama' => 'Arch']);
    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 5000000, 'proposal' => 'x', 'status' => 'pending',
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/shortlist-bid", [
            'bid_id' => $bid->id, 'bid_type' => 'arsitek',
        ])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'This project is managed by a Project Manager. Only the Project Manager can shortlist professionals.']);

    $this->actingAs($pmUser)
        ->postJson("/api/projects/{$project->id}/shortlist-bid", [
            'bid_id' => $bid->id, 'bid_type' => 'arsitek',
        ])
        ->assertStatus(200);
    expect($bid->fresh()->status)->toBe('shortlisted');
});

it('lets the lead architect shortlist a specialist', function () {
    $owner = slUser('lead');
    $architect = slUser('leada', 'arsitek');
    $arsitek = Arsitek::create(['user_id' => $architect->id, 'nama' => 'Lead']);
    $project = slProject($owner, 'lead', ['selected_arsitek_id' => $arsitek->id]);
    $engineer = StructuralEngineer::create([
        'user_id' => slUser('leade', 'structural')->id, 'nama' => 'Eng',
    ]);
    $bid = BidStructural::create([
        'project_id' => $project->id, 'structural_id' => $engineer->id,
        'price' => 5000000, 'proposal' => 'x', 'status' => 'pending',
    ]);

    $this->actingAs($architect)
        ->postJson("/api/projects/{$project->id}/shortlist-bid", [
            'bid_id' => $bid->id, 'bid_type' => 'structural',
        ])
        ->assertStatus(200);
    expect($bid->fresh()->status)->toBe('shortlisted');

    // A non-specialist role is not the lead's to shortlist.
    $project2 = slProject($owner, 'lead2', ['selected_arsitek_id' => $arsitek->id]);
    $bid2 = BidArsitek::create([
        'project_id' => $project2->id, 'arsitek_id' => $arsitek->id,
        'price' => 100, 'proposal' => 'y', 'status' => 'pending',
    ]);
    $this->actingAs($architect)
        ->postJson("/api/projects/{$project2->id}/shortlist-bid", [
            'bid_id' => $bid2->id, 'bid_type' => 'arsitek',
        ])
        ->assertStatus(403);
});
