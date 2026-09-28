<?php

use App\Models\BidKontraktor;
use App\Models\BidProjectManager;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectManager;
use App\Models\ProjectSchedule;
use App\Models\User;
use App\Services\ProjectScheduleService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Refinement-pass regression tests (2026-09)
|--------------------------------------------------------------------------
| Locks in the correctness batch:
|   - D1 handover endpoints must not eager-load a nonexistent `bids` relation
|   - D2 walkthrough status is persisted and a real column exists
|   - D3 markPaid supports contractor + PM bids (frontend already calls them)
|   - D4 ledger amounts use calculated_total for percentage-fee bids
|   - D5 markPaid enforces affordability and rolls back state
|   - D9 delays cascade-shift target dates and keep the original baseline
|
| SAFETY MODEL: same as MoneyIntegrityTest — explicit MySQL config recovery,
| everything wrapped in a transaction that is ALWAYS rolled back. DML only.
*/

beforeEach(function () {
    // Shared harness — see tests/Support/DatabaseHarness.php.
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function refineTestUser(string $suffix, string $role = 'user'): User
{
    return User::create([
        'name' => "Refine {$suffix}",
        'username' => 'refine_' . $suffix . '_' . uniqid(),
        'email' => 'refine_' . $suffix . '_' . uniqid() . '@example.test',
        'password' => Hash::make('password123'),
        'role_type' => $role,
    ]);
}

it('marks a contractor base fee paid using calculated_total', function () {
    $owner = refineTestUser('owner');
    $proUser = refineTestUser('kontraktor', 'kontraktor');
    $profile = Kontraktor::create(['user_id' => $proUser->id, 'nama' => 'CV Test']);
    $project = Project::create(['title' => 'T', 'user_id' => $owner->id, 'budget' => 100_000_000, 'status' => 'in_progress']);

    $bid = BidKontraktor::create([
        'project_id' => $project->id,
        'kontraktor_id' => $profile->id,
        'price' => 12.5,
        'fee_type' => 'percentage',
        'calculated_total' => 8_750_000,
        'status' => 'active',
        'payment_status' => 'unpaid',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'bid_kontraktor', 'id' => $bid->id])
        ->assertStatus(200);

    $ledger = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('reference_model', 'App\\Models\\BidKontraktor')
        ->where('reference_id', $bid->id)
        ->first();

    expect($ledger)->not->toBeNull();
    expect((float) $ledger->amount)->toBe(8_750_000.0);
    expect($bid->fresh()->payment_status)->toBe('paid');
});

it('marks a project-manager base fee paid (enum gap + profile/user id trap)', function () {
    $owner = refineTestUser('owner');
    $pmUser = refineTestUser('pm', 'project_manager');
    $profile = ProjectManager::create(['user_id' => $pmUser->id]);
    $project = Project::create(['title' => 'T', 'user_id' => $owner->id, 'budget' => 100_000_000, 'status' => 'in_progress']);
    // pm_id stores the PM's USER id on projects.
    $project->update(['pm_id' => $pmUser->id]);

    $bid = BidProjectManager::create([
        'project_id' => $project->id,
        'pm_id' => $profile->id,
        'price' => 7_500_000,
        'proposal' => 'Test PM proposal',
        'status' => 'active',
        'payment_status' => 'unpaid',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'bid_project_manager', 'id' => $bid->id])
        ->assertStatus(200);

    expect($bid->fresh()->payment_status)->toBe('paid');
    expect(
        ProjectBudgetTransaction::where('project_id', $project->id)
            ->where('reference_model', 'App\\Models\\BidProjectManager')
            ->where('reference_id', $bid->id)
            ->count()
    )->toBe(1);
});

it('refuses markPaid when the budget cannot cover the payment and rolls back state', function () {
    $owner = refineTestUser('owner');
    $proUser = refineTestUser('kontraktor', 'kontraktor');
    $profile = Kontraktor::create(['user_id' => $proUser->id, 'nama' => 'CV Broke']);
    $project = Project::create(['title' => 'T', 'user_id' => $owner->id, 'budget' => 1_000, 'status' => 'in_progress']);

    $bid = BidKontraktor::create([
        'project_id' => $project->id,
        'kontraktor_id' => $profile->id,
        'price' => 5_000_000,
        'status' => 'active',
        'payment_status' => 'unpaid',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'bid_kontraktor', 'id' => $bid->id])
        ->assertStatus(422);

    expect($bid->fresh()->payment_status)->toBe('unpaid');
    expect(
        ProjectBudgetTransaction::where('project_id', $project->id)
            ->where('reference_model', 'App\\Models\\BidKontraktor')
            ->where('reference_id', $bid->id)
            ->count()
    )->toBe(0);
});

it('persists walkthrough status and the initiation timestamp', function () {
    $owner = refineTestUser('owner');
    $pmUser = refineTestUser('pm', 'project_manager');
    ProjectManager::create(['user_id' => $pmUser->id]);
    $project = Project::create([
        'title' => 'T',
        'user_id' => $owner->id,
        'budget' => 50_000_000,
        'status' => 'in_progress',
        'pm_id' => $pmUser->id,
    ]);

    $this->actingAs($pmUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/initiate-walkthrough")
        ->assertStatus(200);

    $fresh = $project->fresh();
    expect($fresh->walkthrough_status)->toBe('in_progress');
    expect($fresh->final_walkthrough_at)->not->toBeNull();
});

it('serves handover revision without eager-load relation errors', function () {
    $owner = refineTestUser('owner');
    $pmUser = refineTestUser('pm', 'project_manager');
    ProjectManager::create(['user_id' => $pmUser->id]);
    $project = Project::create([
        'title' => 'T',
        'user_id' => $owner->id,
        'budget' => 50_000_000,
        'status' => 'in_progress',
        'pm_id' => $pmUser->id,
    ]);

    // Previously 500'd: loadFullProject() eager-loaded a `bids` relation that
    // does not exist on Project.
    $this->actingAs($pmUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/handover/reject", [
            'phase' => 'design',
            'notes' => 'Please revise the drawings.',
        ])
        ->assertStatus(200);
});

it('cascades logged delays to subsequent phases and keeps the baseline', function () {
    $owner = refineTestUser('owner');
    $project = Project::create(['title' => 'T', 'user_id' => $owner->id, 'budget' => 50_000_000, 'status' => 'in_progress']);

    $design = ProjectSchedule::create([
        'project_id' => $project->id,
        'phase_slug' => 'design',
        'target_start_date' => '2026-10-01',
        'target_end_date' => '2026-10-10',
        'status' => 'active',
    ]);
    $build = ProjectSchedule::create([
        'project_id' => $project->id,
        'phase_slug' => 'build',
        'target_start_date' => '2026-10-11',
        'target_end_date' => '2026-12-01',
        'status' => 'pending',
    ]);
    $legal = ProjectSchedule::create([
        'project_id' => $project->id,
        'phase_slug' => 'legal',
        'target_start_date' => '2026-09-01',
        'target_end_date' => '2026-09-20',
        'status' => 'completed',
    ]);

    app(ProjectScheduleService::class)->logDelay($project, [
        'phase_slug' => 'design',
        'days' => 5,
        'reason' => 'Heavy rain',
        'category' => 'weather',
    ]);

    $design = $design->fresh();
    $build = $build->fresh();
    $legal = $legal->fresh();

    expect($design->target_end_date)->toBe('2026-10-15');
    expect($design->original_target_end_date)->toBe('2026-10-10');
    expect($design->shifted_days)->toBe(5);

    // Subsequent phase shifts too...
    expect($build->target_end_date)->toBe('2026-12-06');
    expect($build->shifted_days)->toBe(5);

    // ...but an earlier (already completed) phase must not move.
    expect($legal->target_end_date)->toBe('2026-09-20');
    expect($legal->shifted_days)->toBe(0);
});
