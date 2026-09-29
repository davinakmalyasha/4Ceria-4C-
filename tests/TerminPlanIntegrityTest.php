<?php

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectPaymentTermin;
use App\Models\TerminAuthorizable;
use App\Models\User;
use App\Services\ProjectFinancialService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Payment-plan integrity on the bulk replace path
|--------------------------------------------------------------------------
|
| `PUT /api/projects/{id}` accepts a `payment_termins` array and rewrites the
| calling role's whole payment schedule from it.
|
| THE HOLE
| --------
| That path called NO integrity guard. It deleted the role's existing stages and
| recreated them from the request body, so a hired professional could post
|
|     {"payment_termins":[{"label":"DP","percentage":100,"amount":280000000}]}
|
| against a Rp 50,000,000 contract and receive a 200. The escrow would then pay
| it, because `deductBudget` only checks that the PROJECT budget can cover the
| amount — not that the amount was ever agreed.
|
| `POST /api/projects/{id}/payment-termins` has always had
| `TerminPlanService::assertWithinContractValue()`. Two write paths, one guard:
| that is exactly the failure mode the service was built to prevent, and the
| second path simply never called it.
|
| A second defect in the same block: the project write happened BEFORE the
| delete, with no transaction, so a plan rejected part-way through left the
| project updated against a schedule that was never applied.
|
| SAFETY MODEL: real MySQL via DatabaseHarness, DML only, always rolled back.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function planUser(string $tag, string $role = 'user'): User
{
    return User::create([
        'name' => "Plan {$tag}", 'username' => "pl_$tag" . uniqid(),
        'email' => "pl_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

/**
 * A project with an ACCEPTED kontraktor bid worth Rp 50,000,000 and that
 * professional selected, so the contract value is resolvable.
 *
 * @return array{0: User, 1: User, 2: Project}
 */
function planProject(string $tag, int|float $contractValue = 50_000_000): array
{
    $owner = planUser("{$tag}_owner");
    $pro = planUser("{$tag}_pro", 'kontraktor');
    $profile = Kontraktor::create(['user_id' => $pro->id, 'nama' => "Kontraktor {$tag}"]);

    $project = Project::create([
        'title' => "Plan {$tag}", 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
        'selected_kontraktor_id' => $profile->id,
    ]);

    \App\Models\BidKontraktor::create([
        'project_id' => $project->id, 'kontraktor_id' => $profile->id,
        'price' => $contractValue, 'status' => 'active', 'payment_status' => 'unpaid',
    ]);

    return [$owner, $pro, $project];
}

function planPayload(array $termins, ?string $targetRole = null): array
{
    return array_filter([
        'title' => 'renamed',
        'payment_termins' => $termins,
        'target_role' => $targetRole,
    ], static fn ($v) => $v !== null);
}

// ---------------------------------------------------------------------------
// The forgery
// ---------------------------------------------------------------------------

it('refuses a bulk termin replace that exceeds the negotiated contract value', function () {
    Mail::fake();
    [$owner, $pro, $project] = planProject('forge');

    // 280,000,000 against a 50,000,000 contract.
    $this->actingAs($pro, 'sanctum')
        ->putJson("/api/projects/{$project->id}", planPayload([
            ['label' => 'DP', 'percentage' => 100, 'amount' => 280_000_000],
        ]))
        ->assertStatus(422);

    // Nothing was created.
    expect($project->paymentTermins()->where('role_type', 'kontraktor')->count())->toBe(0);
});

it('refuses a bulk termin replace that totals more than 100 percent', function () {
    Mail::fake();
    [$owner, $pro, $project] = planProject('pct');

    $this->actingAs($pro, 'sanctum')
        ->putJson("/api/projects/{$project->id}", planPayload([
            ['label' => 'DP', 'percentage' => 80, 'amount' => 20_000_000],
            ['label' => 'Final', 'percentage' => 80, 'amount' => 20_000_000],
        ]))
        ->assertStatus(422);

    expect($project->paymentTermins()->where('role_type', 'kontraktor')->count())->toBe(0);
});

it('refuses the same forgery from the owner, who may re-plan their own project', function () {
    // The bound is a COMMERCIAL invariant, not an authorisation one. The owner
    // re-planning their own schedule must not be able to invent money either —
    // otherwise the "owner may do anything with their project" reading undoes
    // the guard entirely.
    Mail::fake();
    [$owner, $pro, $project] = planProject('ownerforge');

    $this->actingAs($owner, 'sanctum')
        ->putJson("/api/projects/{$project->id}", planPayload([
            ['label' => 'DP', 'percentage' => 100, 'amount' => 400_000_000],
        ]))
        ->assertStatus(422);

    expect($project->paymentTermins()->where('role_type', 'kontraktor')->count())->toBe(0);
});

it('leaves the project untouched when the plan is rejected', function () {
    // The project write used to run BEFORE the termin delete, outside any
    // transaction, so a rejected plan still applied the other field changes.
    Mail::fake();
    [$owner, $pro, $project] = planProject('atomic');

    $this->actingAs($pro, 'sanctum')
        ->putJson("/api/projects/{$project->id}", planPayload([
            ['label' => 'DP', 'percentage' => 100, 'amount' => 999_000_000],
        ], 'kontraktor'))
        ->assertStatus(422);

    $project->refresh();
    expect($project->title)->toBe('Plan atomic');
});

// ---------------------------------------------------------------------------
// The legitimate path must still work
// ---------------------------------------------------------------------------

it('accepts a plan within the contract value', function () {
    Mail::fake();
    [$owner, $pro, $project] = planProject('ok');

    $this->actingAs($pro, 'sanctum')
        ->putJson("/api/projects/{$project->id}", planPayload([
            ['label' => 'DP', 'percentage' => 30, 'amount' => 15_000_000],
            ['label' => 'Progres', 'percentage' => 40, 'amount' => 20_000_000],
            ['label' => 'Serah terima', 'percentage' => 30, 'amount' => 15_000_000],
        ]))
        ->assertOk();

    $stages = $project->paymentTermins()->where('role_type', 'kontraktor')->get();
    expect($stages)->toHaveCount(3)
        ->and((float) $stages->sum('amount'))->toBe(50_000_000.0)
        // The payee is set from the caller, which is what authorises them to
        // verify it later.
        ->and($stages->pluck('recipient_id')->unique()->all())->toBe([$pro->id]);
});

it('accepts an incomplete plan while a professional is still building it', function () {
    // Totalling exactly 100% is only required where a plan becomes BINDING
    // (signContract). Forcing it here would block the normal drafting flow.
    Mail::fake();
    [$owner, $pro, $project] = planProject('draft');

    $this->actingAs($pro, 'sanctum')
        ->putJson("/api/projects/{$project->id}", planPayload([
            ['label' => 'DP', 'percentage' => 30, 'amount' => 15_000_000],
        ]))
        ->assertOk();

    expect($project->paymentTermins()->where('role_type', 'kontraktor')->count())->toBe(1);
});

it('replaces a role plan wholesale, and leaves other roles alone', function () {
    Mail::fake();
    [$owner, $pro, $project] = planProject('roles');

    $arsitek = planUser('roles_arsitek', 'arsitek');
    $arsitekProfile = Arsitek::create(['user_id' => $arsitek->id, 'nama' => 'A']);
    $project->update(['selected_arsitek_id' => $arsitekProfile->id]);

    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'arsitek', 'label' => 'Arsitek DP',
        'percentage' => 100, 'amount' => 20_000_000, 'status' => 'locked',
    ]);

    $this->actingAs($pro, 'sanctum')
        ->putJson("/api/projects/{$project->id}", planPayload([
            ['label' => 'Kontraktor DP', 'percentage' => 100, 'amount' => 25_000_000],
        ], 'kontraktor'))
        ->assertOk();

    expect($project->paymentTermins()->where('role_type', 'kontraktor')->count())->toBe(1)
        ->and($project->paymentTermins()->where('role_type', 'arsitek')->count())->toBe(1);
});

it('still refuses a role plan rewrite from a professional who is not that role', function () {
    Mail::fake();
    [$owner, $pro, $project] = planProject('crossrole');

    $arsitek = planUser('cross_arsitek', 'arsitek');
    $arsitekProfile = Arsitek::create(['user_id' => $arsitek->id, 'nama' => 'A']);
    $project->update(['selected_arsitek_id' => $arsitekProfile->id]);

    $this->actingAs($arsitek, 'sanctum')
        ->putJson("/api/projects/{$project->id}", planPayload([
            ['label' => 'Hacked', 'percentage' => 100, 'amount' => 1_000],
        ], 'kontraktor'))
        ->assertStatus(403);
});

it('still refuses a wholesale replace while a stage is in flight', function () {
    Mail::fake();
    [$owner, $pro, $project] = planProject('inflight');

    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'kontraktor', 'recipient_id' => $pro->id,
        'label' => 'DP', 'percentage' => 100, 'amount' => 50_000_000, 'status' => 'verifying',
    ]);

    $this->actingAs($pro, 'sanctum')
        ->putJson("/api/projects/{$project->id}", planPayload([
            ['label' => 'DP', 'percentage' => 100, 'amount' => 50_000_000],
        ]))
        ->assertStatus(422);

    expect($project->paymentTermins()->where('role_type', 'kontraktor')->count())->toBe(1);
});

// ---------------------------------------------------------------------------
// Both paths now share the bound
// ---------------------------------------------------------------------------

it('applies the same contract-value bound to the dedicated termin endpoint', function () {
    // The point of the shared service: two write paths, one invariant. This
    // asserts the dedicated endpoint is bounded by the same rule, so the two
    // cannot drift apart again.
    Mail::fake();
    [$owner, $pro, $project] = planProject('parity');

    $this->actingAs($pro, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payment-termins", [
            'label' => 'DP', 'percentage' => 100, 'amount' => 280_000_000,
        ])
        ->assertStatus(422);

    expect($project->paymentTermins()->count())->toBe(0);
});
