<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectMilestone;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Design payment verification settles the architect's fee
|--------------------------------------------------------------------------
|
| Regression suite for the verify-payment decision:
| - Only the hired architect passes the gate; planning must be approved
|   and the fee not yet verified.
| - Success stamps the project, flips the accepted bid to paid, books
|   the fee through the shared escrow guard, tells the owner, and
|   regenerates the deliverable milestones with their checklists.
| - The answer is the lean resource: attributes, owner, zeroed counts
|   and the budget summary — never the bid or milestone relations.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function vpOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "vpown_$tag" . uniqid(),
        'email' => "vpown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function vpArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "vpa_$tag" . uniqid(),
        'email' => "vpa_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);

    return $user;
}

function vpProject(User $owner, User $architect, string $tag, array $overrides = []): Project
{
    return Project::create(array_merge([
        'title' => "Design Job $tag", 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'open',
        'target_role' => 'both',
        'planning_status' => 'approved',
        'selected_arsitek_id' => $architect->arsitek->id,
        'design_details' => ['deliverables' => ['floor_plan', '3d_render']],
    ], $overrides));
}

function vpUri(Project $project): string
{
    return "/api/projects/{$project->id}/verify-payment";
}

it('admits only the assigned architect behind the planning guards', function () {
    $owner = vpOwner('gate');
    $stranger = vpArchitect('outsider');
    $pro = vpArchitect('gate');
    $project = vpProject($owner, $pro, 'gate');

    $this->actingAs($owner)
        ->postJson(vpUri($project))
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the assigned architect can verify payments.');

    $this->actingAs($stranger)
        ->postJson(vpUri($project))
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the assigned architect can verify payments.');

    $draft = vpProject($owner, $pro, 'draft', ['planning_status' => 'draft']);
    $this->actingAs($pro)
        ->postJson(vpUri($draft))
        ->assertStatus(422)
        ->assertJsonPath('message', 'The project must be approved before payment can be verified.');

    $done = vpProject($owner, $pro, 'done', ['design_payment_verified_at' => now()]);
    $this->actingAs($pro)
        ->postJson(vpUri($done))
        ->assertStatus(422)
        ->assertJsonPath('message', 'The design fee has already been verified for this project.');
});

it('verifies the fee, tells the owner and rebuilds the roadmap', function () {
    $owner = vpOwner('ok');
    $pro = vpArchitect('ok');
    $project = vpProject($owner, $pro, 'ok');
    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $pro->arsitek->id,
        'price' => 20000000, 'proposal' => 'Design.', 'status' => 'accepted',
        'offered_by_id' => $pro->id,
    ]);

    $response = $this->actingAs($pro)
        ->postJson(vpUri($project))
        ->assertStatus(200);

    $data = $response->json('data');
    expect(array_keys($response->json()))->toBe(['data']);
    expect($data['design_payment_verified_at'])->not->toBeNull();
    // Lean: relations are never loaded.
    expect($data)->not->toHaveKey('bids_arsitek');
    expect($data)->not->toHaveKey('milestones');
    expect($data['bids_arsitek_count'])->toBe(0);
    expect($data['budget_summary']['paid'])->toBe(20000000);
    expect($data['budget_summary']['available'])->toBe(480000000);

    expect($bid->fresh()->payment_status)->toBe('paid');

    $row = ProjectBudgetTransaction::where('project_id', $project->id)->sole();
    expect($row->amount)->toBe('20000000.00');
    expect($row->title)->toBe('Paid Architect Base Fee (Verified by Professional)');

    $notice = Notification::where('user_id', $owner->id)->where('type', 'payment_verified')->latest('id')->first();
    expect($notice)->not->toBeNull();
    expect($notice->body)->toContain('20.000.000');

    $milestones = ProjectMilestone::where('project_id', $project->id)->orderBy('sort_order')->get();
    expect($milestones)->toHaveCount(2);
    expect($milestones[0]->title)->toBe('Architectural Design: Detailed Floor Plans');
    expect($milestones[1]->title)->toBe('3D Visualization: Photorealistic Renders');
    expect($milestones[0]->content['synced_from_brief'])->toBeTrue();
    expect($milestones[0]->content['checklist'])->toHaveCount(3);
});

it('refuses when the escrow cannot cover the fee', function () {
    $owner = vpOwner('poor');
    $pro = vpArchitect('poor');
    $project = vpProject($owner, $pro, 'poor', ['budget' => 1000]);
    BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $pro->arsitek->id,
        'price' => 20000000, 'proposal' => 'Design.', 'status' => 'accepted',
        'offered_by_id' => $pro->id,
    ]);

    $this->actingAs($pro)
        ->postJson(vpUri($project))
        ->assertStatus(422)
        ->assertJsonPath('message', 'Project budget is insufficient for the design fee (Rp 20.000.000). Available: Rp 1.000.');

    expect(ProjectBudgetTransaction::where('project_id', $project->id)->count())->toBe(0);
    expect(ProjectMilestone::where('project_id', $project->id)->count())->toBe(0);
});
