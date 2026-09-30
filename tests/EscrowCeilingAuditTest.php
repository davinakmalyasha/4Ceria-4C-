<?php

use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\User;
use App\Support\Money;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| The escrow ceiling is never written without a ledger row
|--------------------------------------------------------------------------
|
| Regression suite for B10.
|
| THE BUG
| -------
| `UpdateProjectRequest` accepts `budget`, and `ProjectController::update`
| passed it straight into `$project->update($data)`. So the owner could
| rewrite `projects.budget` with:
|
|   * no `project_budget_transactions` row
|   * no `project_activity_logs` entry
|   * nothing for `money:detect-duplicates` to report
|
| and dispute arbitration — whose entire job is answering "who moved this
| money and when" — had no way to do so. The escrow balance simply changed.
|
| There was already a correct endpoint for the same operation:
| `POST /projects/{id}/budget/transactions` with `transaction_type:
| deposit|adjustment_down`, which moves the ceiling through `deductBudget` and
| records the movement. Two paths existed for one action and only one of them
| was auditable. Same shape as the `/legal-disbursements` duplicate: a second
| representation that nobody policed.
|
| THE FIX
| -------
| The project update REJECTS `budget` with a 422 naming the correct endpoint.
| Rejecting rather than silently unsetting matters — a silent unset returns
| 200 and the owner believes their edit applied, which is the same
| "reported success, did nothing" shape as the create endpoint that always
| 422'd.
|
| And the ceiling now starts on the record. `ProjectController::store` writes an
| opening `deposit` row for the initial budget, so the invariant
|
|     projects.budget == SUM(deposit) - SUM(adjustment_down)
|
| is checkable rather than merely hoped for. Without an opening row the ceiling
| begins as an unexplained number and no reconciliation can ever succeed.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function budgetOwner(string $tag): User
{
    return User::create([
        'name' => "BO {$tag}", 'username' => "bo_$tag" . uniqid(),
        'email' => "bo_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

/**
 * A payload satisfying every REQUIRED rule in StoreProjectRequest.
 *
 * `project_category` and `deadline` are required but nullable-looking to the
 * naked eye, which is a trap for anyone writing a fixture against this
 * endpoint: the failure reads like the budget was the problem.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function projectPayload(array $overrides = []): array
{
    return array_merge([
        'title' => 'A project',
        'description' => 'A project description',
        'lokasi' => 'Jakarta',
        'project_category' => 'renovation',
        'deadline' => now()->addMonths(3)->toDateString(),
    ], $overrides);
}

/**
 * The ceiling as the ledger accounts for it.
 */
function ledgerCeiling(int $projectId): float
{
    return (float) ProjectBudgetTransaction::where('project_id', $projectId)
        ->whereIn('transaction_type', ['deposit', 'adjustment_down'])
        ->get()
        ->sum(fn ($row) => $row->transaction_type === 'deposit'
            ? (float) $row->amount
            : -(float) $row->amount);
}

it('records the opening budget in the ledger when a project is created', function () {
    $owner = budgetOwner('b10a');

    $this->actingAs($owner, 'sanctum')
        ->postJson('/api/projects', projectPayload([
            'title' => 'Opening budget', 'budget' => 250_000_000,
        ]))
        ->assertStatus(201);

    $project = Project::where('title', 'Opening budget')->firstOrFail();

    expect((float) $project->budget)->toBe(250_000_000.0)
        ->and(ledgerCeiling($project->id))->toBe(250_000_000.0);
});

it('does not double the budget when recording the opening ledger row', function () {
    // The trap: recording the opening amount through `deductBudget()`'s deposit
    // path would `increment('budget')` on top of the value `Project::create`
    // already stored, giving Rp 500,000,000 for a Rp 250,000,000 project.
    $owner = budgetOwner('b10b');

    $this->actingAs($owner, 'sanctum')
        ->postJson('/api/projects', projectPayload([
            'title' => 'No doubling', 'budget' => 250_000_000,
        ]))
        ->assertStatus(201);

    $project = Project::where('title', 'No doubling')->firstOrFail();

    expect((float) $project->budget)->toBe(250_000_000.0);
});

it('does not make a new deposit look like money already spent', function () {
    // `deposit` is excluded from paidTotal by DISBURSEMENT_TYPES, so recording
    // the opening row must not reduce `available` — the client has committed
    // Rp 250,000,000 and has spent none of it.
    $owner = budgetOwner('b10c');

    $this->actingAs($owner, 'sanctum')
        ->postJson('/api/projects', projectPayload([
            'title' => 'Available intact', 'budget' => 250_000_000,
        ]))
        ->assertStatus(201);

    $project = Project::where('title', 'Available intact')->firstOrFail();

    $financial = app(\App\Services\ProjectFinancialService::class);

    expect($financial->paidTotalMoney($project->id)->toFloat())->toBe(0.0)
        ->and($financial->availableMoney($project)->toFloat())->toBe(250_000_000.0);
});

it('writes no ledger row for a zero opening budget', function () {
    $owner = budgetOwner('b10d');

    $this->actingAs($owner, 'sanctum')
        ->postJson('/api/projects', projectPayload([
            'title' => 'Zero budget', 'budget' => 0,
        ]))
        ->assertStatus(201);

    $project = Project::where('title', 'Zero budget')->firstOrFail();

    expect(ProjectBudgetTransaction::where('project_id', $project->id)->count())->toBe(0);
});

it('refuses to change the budget through the project update', function () {
    $owner = budgetOwner('b10e');
    $project = Project::create([
        'title' => 'Locked ceiling', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->putJson("/api/projects/{$project->id}", [
            'title' => 'Locked ceiling',
            'budget' => 900_000_000,
        ])
        ->assertStatus(422);

    // The ceiling must be untouched, and nothing may be written to explain it.
    expect((float) $project->fresh()->budget)->toBe(100_000_000.0)
        ->and(ProjectBudgetTransaction::where('project_id', $project->id)->count())->toBe(0);
});

it('names the ledger-backed endpoint in the rejection, so the owner can proceed', function () {
    $owner = budgetOwner('b10f');
    $project = Project::create([
        'title' => 'Actionable error', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open',
    ]);

    $res = $this->actingAs($owner, 'sanctum')
        ->putJson("/api/projects/{$project->id}", [
            'title' => 'Actionable error',
            'budget' => 900_000_000,
        ])
        ->assertStatus(422);

    expect($res->json('message'))
        ->toContain('budget/transactions')
        ->toContain('deposit')
        ->toContain('adjustment_down');
});

it('still allows every OTHER project field to be edited', function () {
    // The guard must reject `budget` alone, not break the edit form.
    $owner = budgetOwner('b10g');
    $project = Project::create([
        'title' => 'Old title', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->putJson("/api/projects/{$project->id}", [
            'title' => 'New title', 'description' => 'Updated description',
        ])
        ->assertStatus(200);

    $project->refresh();
    expect($project->title)->toBe('New title')
        ->and($project->description)->toBe('Updated description')
        ->and((float) $project->budget)->toBe(100_000_000.0);
});

it('accepts an edit that does not mention the budget at all', function () {
    // The SPA edit form must keep working: it must simply stop sending budget.
    $owner = budgetOwner('b10h');
    $project = Project::create([
        'title' => 'No budget key', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->putJson("/api/projects/{$project->id}", ['title' => 'No budget key'])
        ->assertStatus(200);
});

it('keeps the ceiling reconcilable after a deposit and a reduction', function () {
    $owner = budgetOwner('b10i');
    $project = Project::create([
        'title' => 'Reconciled', 'user_id' => $owner->id,
        'budget' => 200_000_000, 'status' => 'open',
    ]);

    // Stand in for the opening row this project would have got from `store`.
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'deposit',
        'amount' => 200_000_000, 'title' => 'Opening project budget',
        'transaction_date' => now(),
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/transactions", [
            'transaction_type' => 'deposit', 'amount' => 50_000_000,
            'title' => 'Owner top-up',
        ])
        ->assertStatus(200);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/transactions", [
            'transaction_type' => 'adjustment_down', 'amount' => 30_000_000,
            'title' => 'Scope reduction',
        ])
        ->assertStatus(200);

    $project->refresh();

    // 200 + 50 - 30
    expect((float) $project->budget)->toBe(220_000_000.0)
        ->and(ledgerCeiling($project->id))->toBe(220_000_000.0);
});

it('refuses a non-owner from moving the escrow ceiling either way', function () {
    $owner = budgetOwner('b10j');
    $stranger = User::create([
        'name' => 'Stranger', 'username' => 'bs' . uniqid(),
        'email' => 'bs' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $project = Project::create([
        'title' => 'Not yours', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open',
    ]);

    $this->actingAs($stranger, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/transactions", [
            'transaction_type' => 'deposit', 'amount' => 50_000_000,
            'title' => 'Free money',
        ])
        ->assertStatus(403);

    expect((float) $project->fresh()->budget)->toBe(100_000_000.0)
        ->and(ProjectBudgetTransaction::where('project_id', $project->id)->count())->toBe(0);
});

it('keeps the ceiling exact for a deposit with sen', function () {
    $owner = budgetOwner('b10k');
    $project = Project::create([
        'title' => 'Sen precision', 'user_id' => $owner->id,
        'budget' => 0, 'status' => 'open',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/transactions", [
            'transaction_type' => 'deposit', 'amount' => '1000.10',
            'title' => 'Odd top-up',
        ])
        ->assertStatus(200);

    $budget = Money::fromColumn($project->fresh()->budget);

    expect($budget->toInt())->toBe(100_010)
        ->and($budget->toFloat())->toBe(1000.10);
});