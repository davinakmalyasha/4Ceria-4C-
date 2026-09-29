<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectDispute;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use App\Services\DisputeService;
use App\Services\PaymentVerificationService;
use App\Services\ProjectFinancialService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Payment settlement is terminal
|--------------------------------------------------------------------------
|
| Regression suite for a resurrection hole in the payment lifecycle.
|
| THE HOLE
| -------
| Two guards existed and neither was enough.
|
| `PaymentVerificationService::uploadProof` refused to overwrite a payment
| whose status was exactly 'paid'. It did NOT refuse 'refunded' or 'void', and
| it set the status to 'verifying' on the way through.
|
| `PaymentVerificationService::verifyProof` DID check for 'refunded' — but it
| reads the CURRENT status, which by then was 'verifying' rather than
| 'refunded'. So the guard was evaluating a state that no longer existed:
|
|     pay  ->  dispute refund  ->  uploadProof  ->  verifyProof
|                                                 ^^^^^^^^^^^^^^^^ passed
|
| verifyProof then accepted the payment, set it back to 'paid', and
| `deductBudget`'s dedupe found the ORIGINAL ledger row for that
| (reference_model, reference_id) and short-circuited to `true` WITHOUT writing
| a new one. Net result: the professional had been paid twice in cash, the
| escrow ledger recorded one movement, and the payment state asserted a
| settlement that had no money behind it.
|
| A terminated or resigned bid has the same shape: it keeps
| `payment_status = 'unpaid'`, so neither guard saw it, and the dismissed
| professional could re-drive the payment.
|
| SAFETY MODEL: real MySQL via DatabaseHarness, DML only, always rolled back.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
    Storage::fake('railway');
    Storage::fake('public');
    Mail::fake();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * A paid termin owned by a professional, ready to be re-attacked.
 *
 * @return array{0: User, 1: User, 2: ProjectPaymentTermin, 3: Project}
 */
function terminalScenario(string $tag): array
{
    $owner = User::create([
        'name' => "TO {$tag}", 'username' => "to_$tag" . uniqid(),
        'email' => "to_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $pro = User::create([
        'name' => "TP {$tag}", 'username' => "tp_$tag" . uniqid(),
        'email' => "tp_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create(['user_id' => $pro->id, 'nama' => "Arsitek {$tag}"]);
    $project = Project::create([
        'title' => "Terminal {$tag}", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
    ]);

    $termin = new ProjectPaymentTermin;
    $termin->forceFill([
        'project_id' => $project->id,
        'role_type' => 'arsitek',
        'recipient_id' => $pro->id,
        'label' => 'DP',
        'percentage' => 100,
        'amount' => 10_000_000,
        'status' => 'verifying',
        // Not mass-assignable on purpose: the service sets it as a direct
        // property, so a request can never choose where a receipt is stored.
        'payment_proof_path' => 'receipts/initial.pdf',
    ]);
    $termin->save();

    $recorded = app(ProjectFinancialService::class)->recordPayment(
        $project, 10_000_000, 'Professional Fee: '.$pro->name,
        ProjectPaymentTermin::class, $termin->id
    );
    expect($recorded)->toBeTrue();

    $termin->update(['status' => 'paid', 'paid_at' => now()]);

    return [$owner, $pro, $termin, $project];
}

function proofFile(): UploadedFile
{
    return UploadedFile::fake()->create('receipt.pdf', 8, 'application/pdf');
}

// ---------------------------------------------------------------------------
// The chain
// ---------------------------------------------------------------------------

it('refuses to resurrect a refunded payment through uploadProof', function () {
    [$owner, $pro, $termin, $project] = terminalScenario('refund');

    $admin = User::create([
        'name' => 'TA refund', 'username' => 'ta_refund' . uniqid(),
        'email' => 'ta_refund' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'admin',
    ]);

    $disputes = app(DisputeService::class);

    $dispute = $disputes->open($project, $owner, [
        'category' => 'payment',
        'title' => 'Paid for nothing',
        'description' => 'Work was never delivered.',
        'payment_type' => 'termin',
        'payment_id' => $termin->id,
        'disputed_amount' => 10_000_000,
    ]);
    $disputes->adminAction($dispute, $admin, 'record_refund', null, 10_000_000);

    $termin->refresh();
    expect($termin->status)->toBe('refunded');

    $ledgerAfterRefund = ProjectBudgetTransaction::where('project_id', $project->id)
        ->whereIn('transaction_type', ['payment', 'refund'])
        ->count();
    $netAfterRefund = (float) ProjectBudgetTransaction::where('project_id', $project->id)
        ->whereIn('transaction_type', ['payment', 'refund'])
        ->sum('amount');
    expect($netAfterRefund)->toBe(0.0);

    // THE HOLE: this used to succeed and reset the state to 'verifying',
    // erasing the only evidence that the payment had been returned.
    expect(fn () => app(PaymentVerificationService::class)
        ->uploadProof($project, 'termin', $termin->id, proofFile(), $owner))
        ->toThrow(Exception::class, 'was refunded through dispute arbitration');

    $termin->refresh();
    expect($termin->status)->toBe('refunded');

    // And therefore verifyProof cannot be reached either.
    expect(fn () => app(PaymentVerificationService::class)
        ->verifyProof($project, 'termin', $termin->id, $pro, 'accept'))
        ->toThrow(Exception::class, 'refunded');

    $termin->refresh();
    expect($termin->status)->toBe('refunded');

    // No new money, and no new ledger row.
    expect((float) ProjectBudgetTransaction::where('project_id', $project->id)
        ->whereIn('transaction_type', ['payment', 'refund'])
        ->sum('amount'))->toBe(0.0)
        ->and(ProjectBudgetTransaction::where('project_id', $project->id)
            ->whereIn('transaction_type', ['payment', 'refund'])
            ->count())->toBe($ledgerAfterRefund);
});

it('refuses to resurrect a voided payment stage', function () {
    [$owner, $pro, $termin, $project] = terminalScenario('void');

    // `void` is what contract termination and re-signing write.
    $termin->update(['status' => 'void']);

    expect(fn () => app(PaymentVerificationService::class)
        ->uploadProof($project, 'termin', $termin->id, proofFile(), $owner))
        ->toThrow(Exception::class, 'voided');

    $termin->refresh();
    expect($termin->status)->toBe('void');
});

it('refuses to resurrect a payment whose contract was terminated or resigned', function () {
    // A fired professional keeps `payment_status = 'unpaid'` on their bid, so
    // neither the 'paid' guard nor the 'refunded' guard saw them. The
    // dismissed pro could re-drive the payment.
    //
    // 'terminated' only became a legal bid status in
    // 2026_09_29_000004_add_terminated_status_to_bids. Before it, writing it
    // failed with error 1265, so `fireProfessional` threw and the guard below
    // was unreachable for a bid. See that migration for the full chain.
    [$owner, $pro, $termin, $project] = terminalScenario('fired');

    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => Arsitek::where('user_id', $pro->id)->value('id'),
        'price' => 5_000_000, 'status' => 'terminated', 'payment_status' => 'unpaid',
    ]);
    expect($bid->status)->toBe('terminated');

    expect(fn () => app(PaymentVerificationService::class)
        ->uploadProof($project, 'arsitek_bid', $bid->id, proofFile(), $owner))
        ->toThrow(Exception::class, 'no longer payable');

    $bid->refresh();
    expect($bid->payment_status)->toBe('unpaid');

    // ...and verifyProof refuses too.
    expect(fn () => app(PaymentVerificationService::class)
        ->verifyProof($project, 'arsitek_bid', $bid->id, $pro, 'accept'))
        ->toThrow(Exception::class, 'no longer payable');
});

// ---------------------------------------------------------------------------
// The normal path must still work
// ---------------------------------------------------------------------------

it('still accepts a first proof and a re-upload before verification', function () {
    [$owner, $pro, $termin, $project] = terminalScenario('normal');

    $termin->update(['status' => 'pending']);
    // Not mass-assignable on purpose, so it is set directly — exactly as the
    // service does.
    $termin->payment_proof_path = null;
    $termin->save();

    $service = app(PaymentVerificationService::class);

    // First upload.
    $model = $service->uploadProof($project, 'termin', $termin->id, proofFile(), $owner);
    expect($model->status)->toBe('verifying');

    // Replacing the receipt before anyone has accepted is legitimate.
    $model = $service->uploadProof($project, 'termin', $termin->id, proofFile(), $owner);
    expect($model->status)->toBe('verifying');

    // ...and it still settles.
    $settled = $service->verifyProof($project, 'termin', $termin->id, $pro, 'accept');
    expect($settled->status)->toBe('paid');
});

it('refuses a second proof once the payment is paid', function () {
    // The pre-existing guard, kept: re-uploading after settlement is state
    // churn and would start a duplicate notification loop.
    [$owner, $pro, $termin, $project] = terminalScenario('paid');

    expect($termin->status)->toBe('paid');

    expect(fn () => app(PaymentVerificationService::class)
        ->uploadProof($project, 'termin', $termin->id, proofFile(), $owner))
        ->toThrow(Exception::class, 'already marked as paid');
});
