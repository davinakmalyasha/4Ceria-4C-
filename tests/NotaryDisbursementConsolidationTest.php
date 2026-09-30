<?php

use App\Models\NotarisProfile;
use App\Models\Project;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use App\Services\ProjectFinancialService;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Notary/architect disbursements live on the payment-stage path
|--------------------------------------------------------------------------
|
| Regression suite for B9.
|
| THE BUG
| -------
| `project_disbursements` was a SECOND representation of notary/architect
| money alongside `project_payment_termins`, and it had drifted into three
| defects:
|
|   1. REJECTING APPROVED. LegalVault.tsx POSTed `{ status: 'rejected' }`;
|      ProjectLegalController::verifyDisbursement validated `action` in
|      `verify|reject` and defaulted to `verify`. A Reject click therefore
|      wrote `status = 'verified'`.
|   2. VERIFYING MOVED NO MONEY. `verifyDisbursement` set `verified` without
|      calling deductBudget and without writing a ledger row, while
|      `legalSummary` reported `total_spent` from termin data. Money approved,
*      recorded nowhere, invisible in every financial figure.
|   3. CREATING ALWAYS 422'd. The SPA POSTed `description`; the controller
|      required `purpose`. Every submit failed validation.
|
| The read side had already migrated — `legalSummary` served `disbursements`
| from `paymentTermins()` filtered to notaris/arsitek — so the table was
| write-only and unreachable from the UI.
|
| An important correction to the severity of (1): `handleVerifyDisbursement`
| was declared in the component but never bound to any control, so the
| reject-approves defect was NOT reachable through the shipped UI. It was
| dead code with a live landmine in it. (3) WAS reachable — the modal is
| bound — which is why the create path failed visibly for any user who tried.
|
| THE FIX
| -------
| Payment stages are the only representation that posts to the ledger, so the
| duplicate is removed: the endpoints, the routes and the model are gone, the
| data is copied by 2026_09_29_000006, the table is dropped by 000007, and
| the SPA requests a stage and releases it through the mark-paid path every
| other professional payment uses.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * @return array{0: User, 1: User, 2: NotarisProfile, 3: Project}
 */
function notaryScenario(string $tag, int|float $budget = 200_000_000): array
{
    $owner = User::create([
        'name' => "LO {$tag}", 'username' => "lo_$tag" . uniqid(),
        'email' => "lo_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $notaryUser = User::create([
        'name' => "LN {$tag}", 'username' => "ln_$tag" . uniqid(),
        'email' => "ln_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'notaris',
    ]);

    $profile = NotarisProfile::create([
        'user_id' => $notaryUser->id, 'nama' => "Notaris {$tag}",
    ]);

    $project = Project::create([
        'title' => "Notary {$tag}", 'user_id' => $owner->id,
        'budget' => $budget, 'status' => 'in_progress',
        'selected_notaris_id' => $profile->id,
    ]);

    return [$owner, $notaryUser, $profile, $project];
}

it('no longer exposes the legacy disbursement routes', function () {
    $owner = User::create([
        'name' => 'LNR', 'username' => 'lnr' . uniqid(),
        'email' => 'lnr' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $project = Project::create([
        'title' => 'Routes', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
    ]);

    // The endpoints are gone, not merely unreachable: a request to a retired
    // path must 404 rather than quietly resolve to something else.
    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/legal-disbursements", [
            'amount' => 1_000, 'purpose' => 'x',
        ])
        ->assertStatus(404);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/legal-disbursements/1/verify", ['action' => 'verify'])
        ->assertStatus(404);
});

it('has removed the model, so the second representation cannot come back', function () {
    // Asserted on the FILE, not via class_exists(). `composer dump-autoload`
    // hangs in this environment at "Generating optimized autoload files", so
    // the committed classmap can still list the deleted class — and
    // class_exists() would then answer from a stale entry and tell us nothing
    // about the code. The file's absence is the fact that matters. Production
    // runs `composer install`, which regenerates the classmap, so this is a
    // local-tooling artefact rather than a shipping concern.
    expect(is_file(app_path('Models/ProjectDisbursement.php')))->toBeFalse();

    // And nothing in the application refers to it any more.
    $referrers = [];
    foreach (
        new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator(base_path('app'), FilesystemIterator::SKIP_DOTS)
        ) as $file
    ) {
        if ($file->getExtension() !== 'php') {
            continue;
        }
        if (str_contains((string) file_get_contents($file->getPathname()), 'ProjectDisbursement')) {
            $referrers[] = $file->getPathname();
        }
    }

    expect($referrers)->toBe([]);
});

it('serves the legal disbursement summary from payment stages', function () {
    [$owner, , , $project] = notaryScenario('b9c');

    $pending = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris',
        'label' => 'BPHTB Tax Payment', 'percentage' => 0,
        'amount' => 45_000_000, 'retention_amount' => 0, 'net_amount' => 45_000_000,
        'status' => 'pending',
    ]);
    $paid = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris',
        'label' => 'PNBP Land Registration', 'percentage' => 0,
        'amount' => 5_500_000, 'retention_amount' => 0, 'net_amount' => 5_500_000,
        'status' => 'paid', 'paid_at' => now(),
    ]);
    // A kontraktor stage must NOT appear in the legal summary.
    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'kontraktor',
        'label' => 'Concrete', 'percentage' => 0,
        'amount' => 99_000_000, 'retention_amount' => 0, 'net_amount' => 99_000_000,
        'status' => 'pending',
    ]);

    $res = $this->actingAs($owner, 'sanctum')
        ->getJson("/api/projects/{$project->id}/legal-financials")
        ->assertStatus(200);

    // getFinancials returns the payload directly; it is not wrapped in `data`.
    $ids = collect($res->json('disbursements'))->pluck('id')->map(fn ($id) => (int) $id)->all();

    expect($ids)->toContain($pending->id, $paid->id)
        ->and($ids)->toHaveCount(2);
});

it('releases a notary stage through mark-paid, writing a real ledger row', function () {
    [$owner, , , $project] = notaryScenario('b9d');

    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris',
        'recipient_id' => $project->selected_notaris_id ? User::where('role_type', 'notaris')->value('id') : null,
        'label' => 'BPHTB Tax Payment', 'percentage' => 0,
        'amount' => 45_000_000, 'retention_amount' => 0, 'net_amount' => 45_000_000,
        'status' => 'pending',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", [
            'type' => 'termin', 'id' => $termin->id,
        ])
        ->assertStatus(200);

    $termin->refresh();
    expect($termin->status)->toBe('paid')
        ->and($termin->paid_at)->not->toBeNull();

    // The defect the legacy verify endpoint had: approving moved no money.
    $financial = app(ProjectFinancialService::class);
    expect($financial->paidTotalMoney($project->id)->toFloat())->toBe(45_000_000.0)
        ->and($financial->availableMoney($project->fresh())->toFloat())->toBe(155_000_000.0);
});

it('refuses to release a stage the escrow cannot cover', function () {
    // The legacy verify endpoint had no affordability check at all.
    [$owner, , , $project] = notaryScenario('b9e', 10_000_000);

    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris',
        'label' => 'BPHTB Tax Payment', 'percentage' => 0,
        'amount' => 45_000_000, 'retention_amount' => 0, 'net_amount' => 45_000_000,
        'status' => 'pending',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", [
            'type' => 'termin', 'id' => $termin->id,
        ])
        ->assertStatus(422);

    expect($termin->fresh()->status)->toBe('pending')
        ->and((float) $project->fresh()->budget)->toBe(10_000_000.0);
});

it('rejects a stage addressed to a role that is not one of the seven', function () {
    // The owner defaulting `target_role` to 'user' was the hole behind B3: a
    // stage matching no contract, so every bound silently no-ops.
    [$owner, , , $project] = notaryScenario('b9f');

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payment-termins", [
            'label' => 'Something', 'percentage' => 0, 'amount' => 1_000,
            'role_type' => 'user',
        ])
        ->assertStatus(422);
});

it('rejects releasing a stage twice, so the escrow is not charged twice', function () {
    [$owner, , , $project] = notaryScenario('b9g');

    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris',
        'label' => 'BPHTB', 'percentage' => 0,
        'amount' => 45_000_000, 'retention_amount' => 0, 'net_amount' => 45_000_000,
        'status' => 'pending',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'termin', 'id' => $termin->id])
        ->assertStatus(200);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'termin', 'id' => $termin->id])
        ->assertStatus(422);

    expect(app(ProjectFinancialService::class)->paidTotalMoney($project->id)->toFloat())
        ->toBe(45_000_000.0);
});
