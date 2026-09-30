<?php

use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use App\Services\ProjectFinancialService;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Every money figure has one definition
|--------------------------------------------------------------------------
|
| Regression suite for B6.
|
| THE BUGS
| -------
| (1) `legalSummary.total_spent` summed PAID PAYMENT STAGES. A termin is only
|     one of several places money leaves a project. A professional fee verified
|     through `PaymentVerificationService`, an addendum marked paid, a material
|     order and an imported vendor fee all post straight to the ledger and
|     never touch a termin — so the legal page reported a FRACTION of what the
|     client had actually paid. It also disagreed with the owner's own budget
|     summary, which reads the ledger: two pages on the same project showing
|     two different totals.
|
|     `pending_approval` was the same mistake: termin-only, so approved-unpaid
|     ADDENDUMS — a large share of real commitments — were invisible.
|
| (2) `client_history.total_spent` summed `transaction_type = 'payment'` and
|     never subtracted `refund`. Refunds are negative ledger rows, so disputed-
|     and-returned money still counted as spent. It is a PUBLIC figure on a
|     professional's profile, and it inflated precisely when the platform
|     wrongly judged and refunded them — wrong in the platform's own favour.
|
| WHAT THIS DOES NOT CHANGE
| -------------------------
| `legalSummary.disbursements` stays termin-scoped and role-filtered. It is the
| NOTARY/ARCHITECT PAYMENT SCHEDULE — a projection of a plan — not a financial
| total, and turning it into "one more definition of total_spent" is the same
| class of mistake in reverse.
|
| `DisputeService::paidAgainst()` also stays payment-only, correctly: it is the
| GROSS paid against one payment reference, and is the deliberate counterpart of
| the gross refunded figure in the refund cap.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function ownerScenario(string $tag, int|float $budget = 500_000_000): array
{
    $owner = User::create([
        'name' => "FO {$tag}", 'username' => "fo_$tag" . uniqid(),
        'email' => "fo_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $project = Project::create([
        'title' => "Figures {$tag}", 'user_id' => $owner->id,
        'budget' => $budget, 'status' => 'in_progress',
    ]);

    return [$owner, $project];
}

it('reports the ledger total, not just the termin total', function () {
    [$owner, $project] = ownerScenario('b6a');

    // 10,000,000 via a PAID termin — the ONLY kind the old code counted. It needs
    // a ledger row too: flipping a termin's status is not what records a
    // payment, the ledger row is. Without one it is deliberately excluded, which
    // the next test pins.
    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris',
        'label' => 'Notary DP', 'percentage' => 10, 'amount' => 10_000_000,
        'retention_amount' => 0, 'net_amount' => 10_000_000, 'status' => 'paid',
        'paid_at' => now(),
    ]);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'payment',
        'amount' => 10_000_000, 'title' => 'Paid Notary Termin: Notary DP',
        'reference_model' => 'App\Models\ProjectPaymentTermin', 'reference_id' => $termin->id,
        'transaction_date' => now(),
    ]);

    // 75,000,000 via an ADDENDUM marked paid. This posts to the ledger and
    // never touches a termin — invisible to the old `total_spent`.
    $addendum = ProjectAddendum::create([
        'project_id' => $project->id, 'user_id' => $owner->id,
        'role_type' => 'kontraktor', 'title' => 'Additional works',
        'amount' => 75_000_000, 'status' => 'approved_unpaid',
    ]);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'payment',
        'amount' => 75_000_000, 'title' => 'Paid Addendum: Additional works',
        'reference_model' => 'App\Models\ProjectAddendum', 'reference_id' => $addendum->id,
        'transaction_date' => now(),
    ]);

    $res = $this->actingAs($owner, 'sanctum')
        ->getJson("/api/projects/{$project->id}/legal-financials")
        ->assertStatus(200);

    // 85,000,000 — both figures. The old code returned 10,000,000.
    expect((float) $res->json('total_spent'))->toBe(85_000_000.0)
        ->and((int) $res->json('total_spent_cents'))->toBe(8_500_000_000);
});

it('subtracts refunds from total_spent, because they are money returned', function () {
    [$owner, $project] = ownerScenario('b6b');

    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'payment',
        'amount' => 40_000_000, 'title' => 'Payment',
        'reference_model' => 'App\Models\ProjectPaymentTermin', 'reference_id' => 1,
        'transaction_date' => now(),
    ]);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'refund',
        'amount' => -15_000_000, 'title' => 'Refund',
        'reference_model' => 'App\Models\ProjectDispute', 'reference_id' => 1,
        'reverses_model' => 'App\Models\ProjectPaymentTermin', 'reverses_id' => 1,
        'transaction_date' => now(),
    ]);

    $res = $this->actingAs($owner, 'sanctum')
        ->getJson("/api/projects/{$project->id}/legal-financials")
        ->assertStatus(200);

    expect((float) $res->json('total_spent'))->toBe(25_000_000.0);
});

it('counts approved-unpaid addendums as committed but unpaid', function () {
    [$owner, $project] = ownerScenario('b6c');

    ProjectAddendum::create([
        'project_id' => $project->id, 'user_id' => $owner->id,
        'role_type' => 'kontraktor', 'title' => 'Approved unpaid',
        'amount' => 30_000_000, 'status' => 'approved_unpaid',
    ]);
    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris',
        'label' => 'Pending', 'percentage' => 5, 'amount' => 5_000_000,
        'retention_amount' => 0, 'net_amount' => 5_000_000, 'status' => 'pending',
    ]);

    $res = $this->actingAs($owner, 'sanctum')
        ->getJson("/api/projects/{$project->id}/legal-financials")
        ->assertStatus(200);

    // The old termin-only sum returned 5,000,000 and missed the addendum.
    expect((float) $res->json('pending_approval'))->toBe(35_000_000.0);
});

it('agrees with the owner budget summary on the same project', function () {
    // The whole point: two pages, one number. If these ever diverge, a summary
    // is lying to somebody.
    [$owner, $project] = ownerScenario('b6d');

    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris',
        'label' => 'Paid', 'percentage' => 10, 'amount' => 12_000_000,
        'retention_amount' => 0, 'net_amount' => 12_000_000, 'status' => 'paid',
        'paid_at' => now(),
    ]);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'payment',
        'amount' => 8_000_000, 'title' => 'A bid fee verified elsewhere',
        'reference_model' => 'App\Models\BidArsitek', 'reference_id' => 1,
        'transaction_date' => now(),
    ]);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'refund',
        'amount' => -2_000_000, 'title' => 'Refund',
        'reference_model' => 'App\Models\ProjectDispute', 'reference_id' => 1,
        'transaction_date' => now(),
    ]);

    $legal = $this->actingAs($owner, 'sanctum')
        ->getJson("/api/projects/{$project->id}/legal-financials")
        ->assertStatus(200);

    $financial = app(ProjectFinancialService::class);

    expect((float) $legal->json('total_spent'))
        ->toBe($financial->paidTotalMoney($project->id)->toFloat())
        ->and((float) $legal->json('pending_approval'))
        ->toBe($financial->committedUnpaidMoney($project)->toFloat());
});

it('still reports the notary schedule from payment stages, not the ledger', function () {
    // `disbursements` is the notary/architect PLAN. It must not become a third
    // definition of total_spent.
    [$owner, $project] = ownerScenario('b6e');

    $notaryStage = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris',
        'label' => 'Notary stage', 'percentage' => 10, 'amount' => 9_000_000,
        'retention_amount' => 0, 'net_amount' => 9_000_000, 'status' => 'pending',
    ]);
    $contractorStage = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'kontraktor',
        'label' => 'Contractor stage', 'percentage' => 20, 'amount' => 90_000_000,
        'retention_amount' => 0, 'net_amount' => 90_000_000, 'status' => 'pending',
    ]);

    $res = $this->actingAs($owner, 'sanctum')
        ->getJson("/api/projects/{$project->id}/legal-financials")
        ->assertStatus(200);

    $ids = collect($res->json('disbursements'))->pluck('id')->map(fn ($i) => (int) $i);

    expect($ids)->toContain($notaryStage->id)
        ->and($ids)->not->toContain($contractorStage->id);
});

it('excludes a termin flipped to paid with no ledger row, rather than trusting the status', function () {
    // The status column is not the record of payment — the ledger row is. A
    // termin whose status was set to `paid` without one is exactly the shape
    // `money:detect-duplicates` reports as "paid rows with no ledger entry", and
    // it is how the orphaned specialist bid in `markPaid` presented itself.
    //
    // Counting it would mean a summary trusts a mutable status flag over the
    // append-only audit trail, which is the wrong way round. Excluding it means
    // the figure stays defensible and the inconsistency stays visible to the
    // diagnostic instead of being laundered into a total.
    [$owner, $project] = ownerScenario('b6h');

    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris',
        'label' => 'Paid but unrecorded', 'percentage' => 10, 'amount' => 45_000_000,
        'retention_amount' => 0, 'net_amount' => 45_000_000, 'status' => 'paid',
        'paid_at' => now(),
    ]);

    $res = $this->actingAs($owner, 'sanctum')
        ->getJson("/api/projects/{$project->id}/legal-financials")
        ->assertStatus(200);

    expect((float) $res->json('total_spent'))->toBe(0.0);
});

it('nets refunds out of a professional\'s public client_history total', function () {
    [$owner, $project] = ownerScenario('b6f');

    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'payment',
        'amount' => 50_000_000, 'title' => 'Payment',
        'reference_model' => 'App\Models\ProjectPaymentTermin', 'reference_id' => 1,
        'transaction_date' => now(),
    ]);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'refund',
        'amount' => -20_000_000, 'title' => 'Refund after arbitration',
        'reference_model' => 'App\Models\ProjectDispute', 'reference_id' => 1,
        'transaction_date' => now(),
    ]);

    $totals = app(ProjectFinancialService::class)->paidTotalByOwner([$owner->id]);

    expect($totals)->toHaveKey($owner->id)
        ->and($totals[$owner->id]->toFloat())->toBe(30_000_000.0);
});

it('serves a project resource whose client_history nets refunds', function () {
    // Asserted THROUGH THE ENDPOINT, not only against the service method.
    //
    // Testing `paidTotalByOwner` directly would pass even if
    // `attachClientHistory` still ran the old payment-only query — the bug was
    // in the controller, and a test that only exercises the new helper cannot
    // see it. This is the same mistake the earlier refund-cap fix hid behind,
    // where the schema enforced the limit so no behavioural test could fail.
    [$owner, $project] = ownerScenario('b6i');

    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'payment',
        'amount' => 50_000_000, 'title' => 'Payment',
        'reference_model' => 'App\Models\ProjectPaymentTermin', 'reference_id' => 1,
        'transaction_date' => now(),
    ]);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'refund',
        'amount' => -20_000_000, 'title' => 'Refund after arbitration',
        'reference_model' => 'App\Models\ProjectDispute', 'reference_id' => 1,
        'transaction_date' => now(),
    ]);

    $res = $this->actingAs($owner, 'sanctum')
        ->getJson("/api/projects/{$project->id}")
        ->assertStatus(200);

    $history = $res->json('data.client_history');

    expect($history)->toBeArray()
        // 30,000,000 net. The old query returned 50,000,000 because refunds are
        // negative rows and it never subtracted them.
        ->and((float) $history['total_spent'])->toBe(30_000_000.0);
});

it('returns nothing for an owner who has never been paid', function () {
    $owner = User::create([
        'name' => 'Unpaid', 'username' => 'unp' . uniqid(),
        'email' => 'unp' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    // An absent key, not a zero entry: `paidTotalByOwner` is documented as
    // keyed by user id with absent = nothing paid, and a zero row would imply
    // a query had already found something.
    expect(app(ProjectFinancialService::class)->paidTotalByOwner([$owner->id]))
        ->toBe([]);
});

it('does not count deposits or adjustments as disbursed money', function () {
    [$owner, $project] = ownerScenario('b6g');

    // A deposit RAISES the ceiling; an adjustment_lowers it. Neither is money
    // spent, so neither may appear in a "total spent" figure — that is exactly
    // the double-count `DISBURSEMENT_TYPES` documents.
    $project->update(['budget' => 600_000_000]);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'deposit',
        'amount' => 100_000_000, 'title' => 'Top up',
        'transaction_date' => now(),
    ]);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'adjustment_down',
        'amount' => 20_000_000, 'title' => 'Vendor fee allocation',
        'reference_model' => 'App\Models\ProjectExternalVendor', 'reference_id' => 1,
        'transaction_date' => now(),
    ]);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'payment',
        'amount' => 60_000_000, 'title' => 'Real disbursement',
        'reference_model' => 'App\Models\ProjectPaymentTermin', 'reference_id' => 1,
        'transaction_date' => now(),
    ]);

    $res = $this->actingAs($owner, 'sanctum')
        ->getJson("/api/projects/{$project->id}/legal-financials")
        ->assertStatus(200);

    expect((float) $res->json('total_spent'))->toBe(60_000_000.0);
});