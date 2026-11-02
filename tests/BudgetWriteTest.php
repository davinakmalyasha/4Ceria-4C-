<?php

use App\Models\Project;
use App\Models\ProjectBudgetSandbox;
use App\Models\ProjectBudgetTransaction;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Budget transactions and sandbox planning
|--------------------------------------------------------------------------
|
| Regression suite for the S2 budget writes:
| - addTransaction is owner-only and answers a CUSTOM 422 envelope
|   ("Validation error", not the summarized shape).
| - Deposits raise the ceiling, adjustment_down lowers it through the
|   shared deductBudget guard, and the response echoes the fresh ceiling
|   as a decimal string with the latest matching ledger row.
| - The sandbox plan admits the owner or the assigned PM with the bare
|   "Unauthorized" sentence; create answers create-order keys while
|   toggle/update answer table order; toggle flips, update revises,
|   delete removes.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function bwOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "bown_$tag" . uniqid(),
        'email' => "bown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function bwProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "Budget Job $tag", 'user_id' => $owner->id,
        'budget' => 10_000_000, 'status' => 'open',
        'target_role' => 'both',
    ]);
}

function txnUri(Project $project): string
{
    return "/api/projects/{$project->id}/budget/transactions";
}

function sandboxUri(Project $project): string
{
    return "/api/projects/{$project->id}/budget/sandbox";
}

it('validates transactions with the custom envelope before touching the ceiling', function () {
    $owner = bwOwner('val');
    $project = bwProject($owner, 'val');

    $this->actingAs($owner)
        ->postJson(txnUri($project), [])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Validation error')
        ->assertJsonPath('errors.transaction_type', ['The transaction type field is required.'])
        ->assertJsonPath('errors.amount', ['The amount field is required.'])
        ->assertJsonPath('errors.title', ['The title field is required.']);

    $this->actingAs($owner)
        ->postJson(txnUri($project), ['transaction_type' => 'payment', 'amount' => 100, 'title' => 't'])
        ->assertStatus(422)
        ->assertJsonPath('errors.transaction_type', ['The selected transaction type is invalid.']);

    $this->actingAs($owner)
        ->postJson(txnUri($project), ['transaction_type' => 'deposit', 'amount' => 0, 'title' => 't'])
        ->assertStatus(422)
        ->assertJsonPath('errors.amount', ['The amount field must be at least 1.']);

    $this->actingAs($owner)
        ->postJson(txnUri($project), ['transaction_type' => 'deposit', 'amount' => 'abc', 'title' => 't'])
        ->assertStatus(422)
        ->assertJsonPath('errors.amount', ['The amount field must be a number.']);

    $this->actingAs($owner)
        ->postJson(txnUri($project), ['transaction_type' => 'deposit', 'amount' => 100, 'title' => 5])
        ->assertStatus(422)
        ->assertJsonPath('errors.title', ['The title field must be a string.']);

    expect($project->fresh()->budget)->toBe('10000000.00');
    expect(ProjectBudgetTransaction::where('project_id', $project->id)->count())->toBe(0);
});

it('refuses strangers and over-reductions without writing', function () {
    $owner = bwOwner('own');
    $stranger = bwOwner('stranger');
    $project = bwProject($owner, 'own');

    $this->actingAs($stranger)
        ->postJson(txnUri($project), ['transaction_type' => 'deposit', 'amount' => 100, 'title' => 't'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only the project owner can adjust the total balance.');

    $this->actingAs($owner)
        ->postJson(txnUri($project), ['transaction_type' => 'adjustment_down', 'amount' => 99999999999999, 'title' => 't'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Transaction failed: insufficient escrow to reduce.');

    expect($project->fresh()->budget)->toBe('10000000.00');
    expect(ProjectBudgetTransaction::where('project_id', $project->id)->count())->toBe(0);
});

it('moves the ceiling with the ledger row and echoes both', function () {
    $owner = bwOwner('ok');
    $project = bwProject($owner, 'ok');

    $deposit = $this->actingAs($owner)
        ->postJson(txnUri($project), ['transaction_type' => 'deposit', 'amount' => 100000, 'title' => 'Topup'])
        ->assertStatus(200);

    expect($deposit->json('message'))->toBe('Transaction recorded successfully');
    expect($deposit->json('transaction.transaction_type'))->toBe('deposit');
    expect($deposit->json('transaction.amount'))->toBe('100000.00');
    expect($deposit->json('transaction.actor_user_id'))->toBe($owner->id);
    expect($deposit->json('budget'))->toBe('10100000.00');
    expect($project->fresh()->budget)->toBe('10100000.00');

    $down = $this->actingAs($owner)
        ->postJson(txnUri($project), ['transaction_type' => 'adjustment_down', 'amount' => 100000, 'title' => 'Topup'])
        ->assertStatus(200);

    expect($down->json('transaction.transaction_type'))->toBe('adjustment_down');
    expect($down->json('budget'))->toBe('10000000.00');
    expect($project->fresh()->budget)->toBe('10000000.00');
});

it('gates the sandbox plan and validates with the standard bag', function () {
    $owner = bwOwner('sb');
    $stranger = bwOwner('outsider');
    $project = bwProject($owner, 'sb');

    $this->actingAs($stranger)
        ->postJson(sandboxUri($project), ['title' => 'x', 'estimated_amount' => 5])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');

    $this->actingAs($owner)
        ->postJson(sandboxUri($project), [])
        ->assertStatus(422)
        ->assertJsonPath('message', 'The title field is required. (and 1 more error)')
        ->assertJsonValidationErrors(['title', 'estimated_amount']);

    $this->actingAs($stranger)
        ->putJson(sandboxUri($project) . '/1', [])
        ->assertStatus(403);

    $this->actingAs($stranger)
        ->deleteJson(sandboxUri($project) . '/1')
        ->assertStatus(403);

    expect(ProjectBudgetSandbox::where('project_id', $project->id)->count())->toBe(0);
});

it('plans, flips, revises and removes a sandbox item', function () {
    $owner = bwOwner('plan');
    $project = bwProject($owner, 'plan');

    $created = $this->actingAs($owner)
        ->postJson(sandboxUri($project), ['title' => 'Plan', 'estimated_amount' => 150000])
        ->assertStatus(200);

    $item = $created->json('item');
    expect(array_keys($item))->toBe(['project_id', 'title', 'estimated_amount', 'is_active', 'updated_at', 'created_at', 'id']);
    expect($item['estimated_amount'])->toBe('150000.00');
    expect($item['is_active'])->toBeTrue();

    $toggled = $this->actingAs($owner)
        ->putJson(sandboxUri($project) . '/' . $item['id'])
        ->assertStatus(200);

    expect(array_keys($toggled->json('item')))->toBe(['id', 'project_id', 'title', 'estimated_amount', 'is_active', 'created_at', 'updated_at']);
    expect($toggled->json('item.is_active'))->toBeFalse();

    $revised = $this->actingAs($owner)
        ->putJson(sandboxUri($project) . '/' . $item['id'] . '/update', ['title' => 'Plan v2', 'estimated_amount' => 200000])
        ->assertStatus(200);

    expect($revised->json('item.title'))->toBe('Plan v2');
    expect($revised->json('item.estimated_amount'))->toBe('200000.00');

    $this->actingAs($owner)
        ->deleteJson(sandboxUri($project) . '/' . $item['id'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Sandbox item deleted successfully');

    expect(ProjectBudgetSandbox::where('project_id', $project->id)->count())->toBe(0);
});
