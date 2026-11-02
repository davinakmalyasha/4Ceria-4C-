<?php

use App\Models\Arsitek;
use App\Models\BidStructural;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectAddendum;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Engineering / specialist workflow
|--------------------------------------------------------------------------
|
| Two authorization tiers: participation (ask for a role, decline a bid,
| interview) and owner-or-assigned-PM (verify, approve/reject hire, authorize
| a specialist, approve integration). Specialist fees must never be
| authorized by the specialist who will be paid.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function engUser(string $tag, string $role = 'user'): User
{
    return User::create([
        'name' => "EN $tag", 'username' => "en_$tag" . uniqid(),
        'email' => "en_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

function engProject(User $owner, string $tag, array $extra = []): Project
{
    return Project::create(array_merge([
        'title' => "EN Project $tag", 'user_id' => $owner->id,
        'budget' => 10000000, 'status' => 'open', 'target_role' => 'both',
    ], $extra));
}

function engAddendum(Project $project, array $extra = []): ProjectAddendum
{
    return ProjectAddendum::create(array_merge([
        'project_id' => $project->id, 'type' => 'specialist_request',
        'role_type' => 'structural', 'title' => 'Request Specialist: Structural',
        'description' => 'Need engineer', 'amount' => 1000,
        'status' => 'pending_approval',
    ], $extra));
}

it('requests a specialist role and records the activity', function () {
    $owner = engUser('req');
    $project = engProject($owner, 'req');

    $this->actingAs(engUser('reqs'))
        ->postJson("/api/projects/{$project->id}/request-engineering", [
            'role_type' => 'structural', 'description' => 'x',
        ])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/request-engineering", [])
        ->assertStatus(422)
        ->assertJsonPath('errors.role_type', ['The role type field is required.']);

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/request-engineering", [
            'role_type' => 'structural', 'description' => 'Need a structural engineer',
            'suggested_fee' => 2500000,
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Specialist coordination request submitted successfully.');

    expect(array_keys($response->json('data')))->toBe([
        'project_id', 'user_id', 'role_type', 'type', 'title', 'description',
        'amount', 'status', 'assigned_user_id', 'team_member_id',
        'updated_at', 'created_at', 'id',
    ]);
    expect($response->json('data.amount'))->toBe('2500000.00');
    expect($response->json('data.title'))->toBe('Request Specialist: Structural');
    expect(ProjectActivityLog::where('project_id', $project->id)
        ->where('action', 'specialist_requested')->count())->toBe(1);
});

it('verifies an engineering request and flips the project flag', function () {
    $owner = engUser('ver');
    $pmUser = engUser('verpm', 'project_manager');
    $pmProfile = \App\Models\ProjectManager::create(['user_id' => $pmUser->id, 'nama' => 'PM']);
    $project = engProject($owner, 'ver', ['pm_id' => $pmProfile->id]);
    $addendum = engAddendum($project);

    $this->actingAs(engUser('vers'))
        ->postJson("/api/projects/{$project->id}/verify-engineering/{$addendum->id}", ['status' => 'approved'])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized.']);

    $this->actingAs($pmUser)
        ->postJson("/api/projects/{$project->id}/verify-engineering/{$addendum->id}", ['status' => 'bogus'])
        ->assertStatus(422)
        ->assertJsonPath('errors.status', ['The selected status is invalid.']);

    $this->actingAs($pmUser)
        ->postJson("/api/projects/{$project->id}/verify-engineering/{$addendum->id}", ['status' => 'approved'])
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Request approved']);

    // No assigned user or team member: open bidding, status `authorized`.
    expect($addendum->fresh()->status)->toBe('authorized');
    expect($project->fresh()->requires_structural)->toBeTrue();
    expect(ProjectActivityLog::where('project_id', $project->id)
        ->where('action', 'engineering_request_verified')->count())->toBe(1);

    // A direct team hire awaits payment instead.
    $second = engAddendum($project, ['assigned_user_id' => $owner->id]);
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/verify-engineering/{$second->id}", ['status' => 'approved'])
        ->assertStatus(200);
    expect($second->fresh()->status)->toBe('approved_unpaid');

    // Rejection does not flip the project flag and answers the status word.
    $third = engAddendum($project);
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/verify-engineering/{$third->id}", ['status' => 'rejected'])
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Request rejected']);
    expect($third->fresh()->status)->toBe('rejected');
});

it('approves and rejects engineering hires', function () {
    $owner = engUser('hire');
    $project = engProject($owner, 'hire');
    $addendum = engAddendum($project);

    $this->actingAs(engUser('hires'))
        ->postJson("/api/projects/{$project->id}/approve-engineering-hire/{$addendum->id}")
        ->assertStatus(403);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/approve-engineering-hire/{$addendum->id}")
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Hiring approved. Awaiting payment.']);
    expect($addendum->fresh()->status)->toBe('authorized');

    $second = engAddendum($project);
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/reject-engineering-hire/{$second->id}")
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Hiring rejected.']);
    expect($second->fresh()->status)->toBe('rejected');
});

it('approves the engineering integration', function () {
    $owner = engUser('int');
    $project = engProject($owner, 'int');

    $this->actingAs(engUser('ints'))
        ->postJson("/api/projects/{$project->id}/approve-engineering", ['role_type' => 'structural'])
        ->assertStatus(403);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/approve-engineering", [])
        ->assertStatus(422)
        ->assertJsonPath('errors.role_type', ['The role type field is required.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/approve-engineering", ['role_type' => 'structural'])
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Integration approved.']);
    expect($project->fresh()->structural_approved_at)->not->toBeNull();
});

it('authorizes a platform-hired specialist and unlocks the bid', function () {
    $owner = engUser('auth');
    $project = engProject($owner, 'auth');
    $engineer = StructuralEngineer::create(['user_id' => engUser('authe', 'structural')->id, 'nama' => 'Eng']);
    $bid = BidStructural::create([
        'project_id' => $project->id, 'structural_id' => $engineer->id,
        'price' => 5000000, 'proposal' => 'x', 'status' => 'recommended',
        'is_recommended' => true,
    ]);
    $addendum = engAddendum($project, [
        'type' => 'specialist_assignment', 'specialist_type' => 'platform_hired',
        'recommended_bid_id' => $bid->id,
    ]);

    $this->actingAs(engUser('auths'))
        ->postJson("/api/projects/{$project->id}/authorize-specialist", [
            'role_type' => 'structural', 'addendum_id' => $addendum->id,
        ])
        ->assertStatus(403);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/authorize-specialist", [
            'role_type' => 'structural', 'addendum_id' => $addendum->id,
        ])
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Specialist hiring authorized. Awaiting payment.']);

    expect($addendum->fresh()->status)->toBe('authorized');
    expect($bid->fresh()->status)->toBe('awaiting_payment');

    // Rejection stores the reason on the addendum.
    $second = engAddendum($project);
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/reject-specialist", [
            'role_type' => 'structural', 'addendum_id' => $second->id, 'reason' => 'Too expensive',
        ])
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Specialist hiring rejected.']);
    expect($second->fresh()->status)->toBe('rejected');
    expect($second->fresh()->negotiation_note)->toBe('Too expensive');
});

it('declines a recommended engineering bid and its addendum', function () {
    $owner = engUser('rjb');
    $project = engProject($owner, 'rjb');
    $engineer = StructuralEngineer::create(['user_id' => engUser('rjbe', 'structural')->id, 'nama' => 'Eng']);
    $bid = BidStructural::create([
        'project_id' => $project->id, 'structural_id' => $engineer->id,
        'price' => 5000000, 'proposal' => 'x', 'status' => 'recommended',
        'is_recommended' => true,
    ]);
    $addendum = engAddendum($project, ['recommended_bid_id' => $bid->id]);

    $this->actingAs(engUser('rjbs'))
        ->postJson("/api/projects/{$project->id}/reject-engineering-bid/{$bid->id}", ['bid_type' => 'structural'])
        ->assertStatus(403);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/reject-engineering-bid/999999999", ['bid_type' => 'structural'])
        ->assertStatus(404)
        ->assertExactJson(['message' => 'Bid not found.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/reject-engineering-bid/{$bid->id}", ['bid_type' => 'structural'])
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Recommendation rejected.']);

    expect($bid->fresh()->status)->toBe('declined');
    expect($addendum->fresh()->status)->toBe('rejected');
});

it('lets only the architect interview and recommend a specialist', function () {
    $owner = engUser('itv');
    $architect = engUser('itva', 'arsitek');
    $arsitek = Arsitek::create(['user_id' => $architect->id, 'nama' => 'Architect']);
    $project = engProject($owner, 'itv', ['selected_arsitek_id' => $arsitek->id]);
    $engineer = StructuralEngineer::create(['user_id' => engUser('itve', 'structural')->id, 'nama' => 'Eng']);
    $bid = BidStructural::create([
        'project_id' => $project->id, 'structural_id' => $engineer->id,
        'price' => 5000000, 'proposal' => 'x', 'status' => 'pending',
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/submit-engineering-interview", [
            'bid_id' => $bid->id, 'bid_type' => 'structural',
            'interview_notes' => 'x', 'is_recommended' => true,
        ])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized. Only the Project Architect can interview specialized engineers.']);

    $this->actingAs($architect)
        ->postJson("/api/projects/{$project->id}/submit-engineering-interview", [])
        ->assertStatus(422)
        ->assertJsonPath('errors.bid_id', ['The bid id field is required.']);

    $response = $this->actingAs($architect)
        ->postJson("/api/projects/{$project->id}/submit-engineering-interview", [
            'bid_id' => $bid->id, 'bid_type' => 'structural',
            'interview_notes' => 'Strong portfolio.', 'is_recommended' => true,
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Interview notes saved and recommendation updated.');

    expect($response->json('data.status'))->toBe('recommended');
    expect($response->json('data.is_recommended'))->toBeTrue();
    expect($response->json('data.interview_notes'))->toBe('Strong portfolio.');
    expect(Notification::where('user_id', $owner->id)
        ->where('type', 'specialist_recommendation')->count())->toBe(1);

    // Not recommending leaves the status untouched and sends no notification.
    // One bid per (project, engineer): a second engineer for the second bid.
    $secondEngineer = StructuralEngineer::create([
        'user_id' => engUser('itve2', 'structural')->id, 'nama' => 'Eng 2',
    ]);
    $second = BidStructural::create([
        'project_id' => $project->id, 'structural_id' => $secondEngineer->id,
        'price' => 5000000, 'proposal' => 'y', 'status' => 'pending',
    ]);
    $this->actingAs($architect)
        ->postJson("/api/projects/{$project->id}/submit-engineering-interview", [
            'bid_id' => $second->id, 'bid_type' => 'structural',
            'interview_notes' => 'Not a fit.', 'is_recommended' => false,
        ])
        ->assertStatus(200);
    expect($second->fresh()->status)->toBe('pending');
    expect(Notification::where('type', 'specialist_recommendation')->count())->toBe(1);
});
