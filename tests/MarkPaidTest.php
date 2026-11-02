<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Owner-declared payments settle through the shared escrow guard
|--------------------------------------------------------------------------
|
| Regression suite for the mark-paid decision:
| - Validation answers the standard bag; the owner gate admits only the
|   project owner; a missing row is the 500 generic (findOrFail), never
|   a 404.
| - Settled rows refuse with the already-paid 422 before any write.
| - Termins book the retention NET, bids book calculated_total ?? price,
|   and addendums book the gross — each with a ledger row, a released
|   activity log and a payee notification, while the ceiling stays put.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function markOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "mown_$tag" . uniqid(),
        'email' => "mown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function markArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "ma_$tag" . uniqid(),
        'email' => "ma_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);

    return $user;
}

function markProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "Mark Job $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open',
        'target_role' => 'both',
    ]);
}

function markUri(Project $project): string
{
    return "/api/projects/{$project->id}/budget/mark-paid";
}

it('validates and gates before touching the ledger', function () {
    $owner = markOwner('val');
    $stranger = markOwner('outsider');
    $project = markProject($owner, 'val');

    $this->actingAs($owner)
        ->postJson(markUri($project), [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['type', 'id']);

    $this->actingAs($owner)
        ->postJson(markUri($project), ['type' => 'wire', 'id' => 1])
        ->assertStatus(422)
        ->assertJsonPath('errors.type', ['The selected type is invalid.']);

    $this->actingAs($owner)
        ->postJson(markUri($project), ['type' => 'termin', 'id' => 'abc'])
        ->assertStatus(422)
        ->assertJsonPath('errors.id', ['The id field must be an integer.']);

    $this->actingAs($stranger)
        ->postJson(markUri($project), ['type' => 'termin', 'id' => 1])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only the project owner can confirm payments.');

    // findOrFail misses read as the 500 generic, never a 404.
    $this->actingAs($owner)
        ->postJson(markUri($project), ['type' => 'termin', 'id' => 999999999])
        ->assertStatus(500)
        ->assertJsonPath('message', 'Failed to process payment tracking.');

    expect(ProjectBudgetTransaction::where('project_id', $project->id)->count())->toBe(0);
});

it('refuses an already-paid row before writing', function () {
    $owner = markOwner('paid');
    $project = markProject($owner, 'paid');
    $addendum = ProjectAddendum::create([
        'project_id' => $project->id, 'type' => 'extra_fee',
        'role_type' => 'arsitek', 'user_id' => $owner->id,
        'title' => 'Done', 'amount' => 100000, 'status' => 'paid',
    ]);

    $this->actingAs($owner)
        ->postJson(markUri($project), ['type' => 'addendum', 'id' => $addendum->id])
        ->assertStatus(422)
        ->assertJsonPath('message', 'This payment has already been marked as paid.');

    expect(ProjectBudgetTransaction::where('project_id', $project->id)->count())->toBe(0);
});

it('marks a termin paid at the retention net with an audit trail', function () {
    $owner = markOwner('termin');
    $project = markProject($owner, 'termin');
    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'arsitek',
        'label' => 'DP', 'percentage' => 50, 'amount' => 2000000,
        'status' => 'locked',
    ]);

    $response = $this->actingAs($owner)
        ->postJson(markUri($project), ['type' => 'termin', 'id' => $termin->id])
        ->assertStatus(200);

    expect($response->json('message'))->toBe('Successfully marked as paid and deducted from budget.');
    // Ceiling-neutral: the budget column does not move for payments.
    expect($response->json('budget'))->toBe('100000000.00');
    expect($termin->fresh()->status)->toBe('paid');

    $row = ProjectBudgetTransaction::where('project_id', $project->id)->sole();
    expect($row->amount)->toBe('1900000.00');
    expect($row->title)->toBe('Paid Architect Termin: DP');
    expect($row->reference_model)->toBe('App\Models\ProjectPaymentTermin');
    expect($row->actor_user_id)->toBe($owner->id);
});

it('marks a bid paid at the agreed value and tells the payee', function () {
    $owner = markOwner('bid');
    $pro = markArchitect('bid');
    $project = markProject($owner, 'bid');
    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $pro->arsitek->id,
        'price' => 5000000, 'status' => 'pending', 'offered_by_id' => $pro->id,
    ]);

    $this->actingAs($owner)
        ->postJson(markUri($project), ['type' => 'bid_arsitek', 'id' => $bid->id])
        ->assertStatus(200);

    expect($bid->fresh()->payment_status)->toBe('paid');

    $row = ProjectBudgetTransaction::where('project_id', $project->id)->sole();
    expect($row->amount)->toBe('5000000.00');
    expect($row->title)->toBe('Paid Architect Base Fee');

    $notice = Notification::where('user_id', $pro->id)->where('type', 'payment_verified')->latest('id')->first();
    expect($notice)->not->toBeNull();
    expect($notice->title)->toBe('Payment Released');
});

it('marks an addendum paid and authorizes no procurement it does not name', function () {
    $owner = markOwner('add');
    $project = markProject($owner, 'add');
    $addendum = ProjectAddendum::create([
        'project_id' => $project->id, 'type' => 'extra_fee',
        'role_type' => 'arsitek', 'user_id' => $owner->id,
        'title' => 'Extra', 'amount' => 250000, 'status' => 'approved_unpaid',
    ]);

    $this->actingAs($owner)
        ->postJson(markUri($project), ['type' => 'addendum', 'id' => $addendum->id])
        ->assertStatus(200);

    expect($addendum->fresh()->status)->toBe('paid');

    $row = ProjectBudgetTransaction::where('project_id', $project->id)->sole();
    expect($row->amount)->toBe('250000.00');
    expect($row->title)->toBe('Paid Addendum: Extra');
    // The owner is both payer and payee here, so no notification fires.
    expect(Notification::where('type', 'payment_verified')->where('title', 'Payment Released')->where('body', 'like', '%Paid Addendum: Extra%')->count())->toBe(0);
});
