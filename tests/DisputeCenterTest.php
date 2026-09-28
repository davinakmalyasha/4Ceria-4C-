<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectDispute;
use App\Models\ProjectPaymentTermin;
use App\Models\ProjectTermination;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Dispute / arbitration center tests (Track C)
|--------------------------------------------------------------------------
| Locks in:
|   - freeze: open dispute blocks mark-paid, upload-proof, verify-proof (422)
|   - freeze lifts on dismiss (and on withdraw)
|   - escalation of a rejected mutual termination materializes a dispute row
|   - release_payment runs the full accept path (paid + ledger)
|   - record_refund writes a negative ledger row and marks the payment refunded
|   - terminate_project cancels the project
|   - outsider access is 403; one open dispute per project (409)
|
| SAFETY MODEL: same as MoneyIntegrityTest / RefinementRegressionTest —
| explicit MySQL config recovery, DML only, ALWAYS rolled back.
*/

beforeEach(function () {
    // Shared harness — see tests/Support/DatabaseHarness.php.
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function disputeTestUser(string $suffix, string $role = 'user'): User
{
    return User::create([
        'name' => "Dispute {$suffix}",
        'username' => 'dispute_' . $suffix . '_' . uniqid(),
        'email' => 'dispute_' . $suffix . '_' . uniqid() . '@example.test',
        'password' => Hash::make('password123'),
        'role_type' => $role,
    ]);
}

function disputeOpenPayload(array $overrides = []): array
{
    return array_merge([
        'category' => 'payment',
        'title' => 'Payment not delivered',
        'description' => 'Contractor refused to mobilize after DP was sent.',
    ], $overrides);
}

it('freezes mark-paid while a dispute is open and lifts the freeze on dismiss', function () {
    Mail::fake();
    $owner = disputeTestUser('owner');
    $admin = disputeTestUser('admin', 'admin');
    $proUser = disputeTestUser('arsitek', 'arsitek');
    $profile = Arsitek::create(['user_id' => $proUser->id, 'nama' => 'Pro']);
    $project = Project::create(['title' => 'Freeze', 'user_id' => $owner->id, 'budget' => 100_000_000, 'status' => 'in_progress']);

    $bid = BidArsitek::create([
        'project_id' => $project->id,
        'arsitek_id' => $profile->id,
        'price' => 5_000_000,
        'status' => 'active',
        'payment_status' => 'unpaid',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes", disputeOpenPayload())
        ->assertStatus(201);

    $dispute = ProjectDispute::where('project_id', $project->id)->firstOrFail();
    expect($dispute->status)->toBe('open');

    // Frozen: mark-paid must refuse with the dispute message.
    $frozen = $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'bid_arsitek', 'id' => $bid->id]);
    $frozen->assertStatus(422);
    expect($bid->fresh()->payment_status)->not->toBe('paid');

    // Admin dismisses -> freeze lifts.
    $this->actingAs($admin, 'sanctum')
        ->postJson("/api/admin/disputes/{$dispute->id}/act", ['action' => 'dismiss'])
        ->assertStatus(200);

    expect($dispute->fresh()->status)->toBe('dismissed');

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'bid_arsitek', 'id' => $bid->id])
        ->assertStatus(200);

    expect($bid->fresh()->payment_status)->toBe('paid');
});

it('freezes payment-proof upload and verification while a dispute is open', function () {
    Mail::fake();
    $owner = disputeTestUser('up_owner');
    $proUser = disputeTestUser('up_pro', 'kontraktor');
    $project = Project::create(['title' => 'Proof freeze', 'user_id' => $owner->id, 'budget' => 50_000_000, 'status' => 'in_progress']);

    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id,
        'label' => 'DP',
        'percentage' => 50,
        'amount' => 5_000_000,
        'status' => 'verifying',
        'role_type' => 'kontraktor',
        'recipient_id' => $proUser->id,
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes", disputeOpenPayload(['title' => 'Proof freeze']))
        ->assertStatus(201);

    // Upload must be frozen (422 carries the dispute message).
    $file = UploadedFile::fake()->image('proof.png');
    $upload = $this->actingAs($owner, 'sanctum')
        ->post("/api/projects/{$project->id}/payments/termin/{$termin->id}/upload-proof", ['proof' => $file]);
    expect($upload->getStatusCode())->toBe(422);

    // Verification must be frozen too (payee is otherwise authorized).
    $verify = $this->actingAs($proUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payments/termin/{$termin->id}/verify-proof", ['action' => 'accept']);
    $verify->assertStatus(422);
    expect($termin->fresh()->status)->not->toBe('paid');
});

it('escalates a rejected mutual termination into a dispute row', function () {
    $owner = disputeTestUser('esc_owner');
    $project = Project::create(['title' => 'Escalate', 'user_id' => $owner->id, 'budget' => 10_000_000, 'status' => 'in_progress']);

    $termination = ProjectTermination::create([
        'project_id' => $project->id,
        'initiator_id' => $owner->id,
        'reason' => 'Work quality unacceptable.',
        'status' => 'rejected',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/escalate")
        ->assertStatus(200);

    expect($termination->fresh()->status)->toBe('escalated');

    $dispute = ProjectDispute::where('project_id', $project->id)->firstOrFail();
    expect($dispute->status)->toBe('open');
    expect($dispute->category)->toBe('termination');
    expect((int) $dispute->termination_id)->toBe((int) $termination->id);

    // Escalating again is idempotent — still exactly one dispute.
    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/escalate")
        ->assertStatus(200);
    expect(ProjectDispute::where('project_id', $project->id)->count())->toBe(1);
});

it('releases the linked payment through admin arbitration (full accept path)', function () {
    Mail::fake();
    $owner = disputeTestUser('rel_owner');
    $admin = disputeTestUser('rel_admin', 'admin');
    $proUser = disputeTestUser('rel_arsitek', 'arsitek');
    $profile = Arsitek::create(['user_id' => $proUser->id, 'nama' => 'RelPro']);
    $project = Project::create(['title' => 'Release', 'user_id' => $owner->id, 'budget' => 100_000_000, 'status' => 'in_progress']);

    $bid = BidArsitek::create([
        'project_id' => $project->id,
        'arsitek_id' => $profile->id,
        'price' => 7_500_000,
        'status' => 'active',
        'payment_status' => 'unpaid',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes", disputeOpenPayload([
            'payment_type' => 'arsitek_bid',
            'payment_id' => $bid->id,
        ]))
        ->assertStatus(201);

    $dispute = ProjectDispute::where('project_id', $project->id)->firstOrFail();

    $this->actingAs($admin, 'sanctum')
        ->postJson("/api/admin/disputes/{$dispute->id}/act", [
            'action' => 'release_payment',
            'notes' => 'Evidence supports the professional.',
        ])
        ->assertStatus(200);

    $bid->refresh();
    expect($bid->payment_status)->toBe('paid');
    expect($bid->status)->toBe('active');

    $ledger = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('reference_model', 'App\\Models\\BidArsitek')
        ->where('reference_id', $bid->id)
        ->first();
    expect($ledger)->not->toBeNull();
    expect((float) $ledger->amount)->toBe(7_500_000.0);

    expect($dispute->fresh()->status)->toBe('resolved');
    expect($dispute->fresh()->resolution)->toBe('release_payment');
});

it('records a refund as a negative ledger row and marks the payment refunded', function () {
    Mail::fake();
    $owner = disputeTestUser('ref_owner');
    $admin = disputeTestUser('ref_admin', 'admin');
    $proUser = disputeTestUser('ref_arsitek', 'arsitek');
    $profile = Arsitek::create(['user_id' => $proUser->id, 'nama' => 'RefPro']);
    $project = Project::create(['title' => 'Refund', 'user_id' => $owner->id, 'budget' => 100_000_000, 'status' => 'in_progress']);

    $bid = BidArsitek::create([
        'project_id' => $project->id,
        'arsitek_id' => $profile->id,
        'price' => 4_000_000,
        'status' => 'active',
        'payment_status' => 'unpaid',
    ]);

    // Settle the payment first (ledger +5M -> +4M).
    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'bid_arsitek', 'id' => $bid->id])
        ->assertStatus(200);
    expect($bid->fresh()->payment_status)->toBe('paid');

    // Dispute it, then refund via arbitration.
    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes", disputeOpenPayload([
            'payment_type' => 'arsitek_bid',
            'payment_id' => $bid->id,
            'disputed_amount' => 4_000_000,
        ]))
        ->assertStatus(201);

    $dispute = ProjectDispute::where('project_id', $project->id)->firstOrFail();

    $this->actingAs($admin, 'sanctum')
        ->postJson("/api/admin/disputes/{$dispute->id}/act", [
            'action' => 'record_refund',
            'amount' => 4_000_000,
            'notes' => 'Work never started.',
        ])
        ->assertStatus(200);

    // REFUND SEMANTICS (2026-09-23): the reversal is attributed to the PAYMENT
    // it reverses (type `refund`), not to the dispute, and the payment carries a
    // durable refunded_amount. The unique index is now
    // (project_id, reference_model, reference_id, transaction_type) so exactly
    // one payment + one refund may exist per reference.
    $reversal = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('transaction_type', 'refund')
        ->where('reference_model', 'App\\Models\\BidArsitek')
        ->where('reference_id', $bid->id)
        ->first();
    expect($reversal)->not->toBeNull();
    expect((float) $reversal->amount)->toBe(-4_000_000.0);
    expect((float) $bid->fresh()->refunded_amount)->toBe(4_000_000.0);

    // Net ledger across payments+refunds is back to zero.
    $net = (float) ProjectBudgetTransaction::where('project_id', $project->id)
        ->whereIn('transaction_type', ['payment', 'refund'])
        ->sum('amount');
    expect($net)->toBe(0.0);

    // Underlying payment flipped to refunded (lifecycle status untouched).
    $bid->refresh();
    expect($bid->payment_status)->toBe('refunded');
    expect($bid->status)->toBe('active');

    expect($dispute->fresh()->status)->toBe('resolved');
    expect($dispute->fresh()->resolution)->toBe('record_refund');
});

it('force-terminates the project through dispute arbitration', function () {
    $owner = disputeTestUser('term_owner');
    $admin = disputeTestUser('term_admin', 'admin');
    $project = Project::create(['title' => 'Terminate', 'user_id' => $owner->id, 'budget' => 10_000_000, 'status' => 'in_progress']);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes", disputeOpenPayload(['category' => 'termination']))
        ->assertStatus(201);

    $dispute = ProjectDispute::where('project_id', $project->id)->firstOrFail();

    $this->actingAs($admin, 'sanctum')
        ->postJson("/api/admin/disputes/{$dispute->id}/act", [
            'action' => 'terminate_project',
            'notes' => 'Irreconcilable breakdown.',
        ])
        ->assertStatus(200);

    expect($project->fresh()->status)->toBe('cancelled');
    expect($dispute->fresh()->status)->toBe('resolved');
    expect($dispute->fresh()->resolution)->toBe('terminate_project');
});

it('lets the opener withdraw an open dispute and lifts the freeze', function () {
    Mail::fake();
    $owner = disputeTestUser('wd_owner');
    $proUser = disputeTestUser('wd_arsitek', 'arsitek');
    $profile = Arsitek::create(['user_id' => $proUser->id, 'nama' => 'WdPro']);
    $project = Project::create(['title' => 'Withdraw', 'user_id' => $owner->id, 'budget' => 100_000_000, 'status' => 'in_progress']);

    $bid = BidArsitek::create([
        'project_id' => $project->id,
        'arsitek_id' => $profile->id,
        'price' => 2_000_000,
        'status' => 'active',
        'payment_status' => 'unpaid',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes", disputeOpenPayload(['title' => 'Withdraw me']))
        ->assertStatus(201);

    $dispute = ProjectDispute::where('project_id', $project->id)->firstOrFail();

    // Non-opener (the pro) cannot withdraw it.
    $this->actingAs($proUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes/{$dispute->id}/withdraw")
        ->assertStatus(403);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes/{$dispute->id}/withdraw")
        ->assertStatus(200);

    expect($dispute->fresh()->status)->toBe('withdrawn');

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'bid_arsitek', 'id' => $bid->id])
        ->assertStatus(200);
    expect($bid->fresh()->payment_status)->toBe('paid');
});

it('forbids outsiders and enforces one open dispute per project', function () {
    $owner = disputeTestUser('out_owner');
    $stranger = disputeTestUser('stranger');
    $admin = disputeTestUser('out_admin', 'admin');
    $project = Project::create(['title' => 'Outsider', 'user_id' => $owner->id, 'budget' => 10_000_000, 'status' => 'in_progress']);

    // Outsider cannot view or open.
    $this->actingAs($stranger, 'sanctum')
        ->getJson("/api/projects/{$project->id}/disputes")
        ->assertStatus(403);
    $this->actingAs($stranger, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes", disputeOpenPayload())
        ->assertStatus(403);

    // Non-admin cannot run arbitration actions.
    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes", disputeOpenPayload())
        ->assertStatus(201);
    $dispute = ProjectDispute::where('project_id', $project->id)->firstOrFail();

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/admin/disputes/{$dispute->id}/act", ['action' => 'dismiss'])
        ->assertStatus(403);

    // Second open dispute on the same project -> 409.
    $res = $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes", disputeOpenPayload(['title' => 'Duplicate']));
    $res->assertStatus(409);
    expect(ProjectDispute::where('project_id', $project->id)->where('status', 'open')->count())->toBe(1);
});
