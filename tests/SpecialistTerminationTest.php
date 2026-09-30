<?php

use App\Models\InteriorProfile;
use App\Models\MepEngineer;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectManager;
use App\Models\ProjectPaymentTermin;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Termination must actually terminate, for every role
|--------------------------------------------------------------------------
|
| Regression suite for B8.
|
| THE BUGS
| -------
| (1) STRUCTURAL AND MEP COULD NOT BE FIRED AT ALL. `fireProfessional`
|     validated `role_type` in `arsitek,kontraktor,interior,notaris,pm`, so a
|     structural engineer or an MEP engineer was rejected with a 422 before
|     any work happened. That was only the gate: SEVEN further places in the
|     method also omitted them — the profile relation, both column maps, both
|     `in_array` reopen guards, the bid-status match and the profile model.
|     Widening the validation alone would have produced a worse failure: a 200
|     response that marked nothing, notified nobody, voided no payment stage and
|     still counted the bid as allocated.
|
| (2) A RESIGNING PM'S PAYMENT STAGES WERE NEVER SETTLED. The resignation path
|     read `$role === 'project_manager'`, which is NEVER true: `$role` comes
|     from `$user->role_type` and the PM's token is `pm`. So `settlePaymentStages`
|     was called with role_type `pm` and matched zero rows, while payment stages
|     are stored with `project_manager`. `fireProfessional` translated the token
*      correctly; this path did not — a straight copy-paste divergence.
|
|     Impact is money, not bookkeeping: `settlePaymentStages` exists precisely
|     so a departed professional's unpaid stages become `void`. Leaving them
|     payable means `verifyProof` — which authorizes on `recipient_id` alone —
|     would let a resigned PM accept an in-flight proof and pull a ledger debit
|     against a contract they had left.
|
| (3) `getProfileIdForUser` returned `$user->id` for an unrecognised role. Every
|     caller compares that against a project column holding a PROFILE id, so
|     the value was the wrong kind of identifier entirely: it either failed to
|     match by luck, or matched an unrelated profile.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * @return array{0: User, 1: User, 2: StructuralEngineer, 3: User, 4: MepEngineer, 5: Project}
 */
function specialistTerminationScenario(string $tag, int|float $budget = 500_000_000): array
{
    $owner = User::create([
        'name' => "TO {$tag}", 'username' => "to_$tag" . uniqid(),
        'email' => "to_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $structuralUser = User::create([
        'name' => "TS {$tag}", 'username' => "ts_$tag" . uniqid(),
        'email' => "ts_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'structural',
    ]);
    $mepUser = User::create([
        'name' => "TM {$tag}", 'username' => "tm_$tag" . uniqid(),
        'email' => "tm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'mep',
    ]);

    $structural = StructuralEngineer::create([
        'user_id' => $structuralUser->id, 'nama' => "Structural {$tag}",
        'reliability_score' => 100,
    ]);
    $mep = MepEngineer::create([
        'user_id' => $mepUser->id, 'nama' => "MEP {$tag}",
        'reliability_score' => 100,
    ]);

    $project = Project::create([
        'title' => "Termination {$tag}", 'user_id' => $owner->id,
        'budget' => $budget, 'status' => 'in_progress',
        'requires_structural' => true, 'requires_mep' => true,
        'structural_id' => $structural->id, 'mep_id' => $mep->id,
    ]);

    return [$owner, $structuralUser, $structural, $mepUser, $mep, $project];
}

it('lets the owner fire a structural engineer, marking and penalising the bid', function () {
    [$owner, $structuralUser, $structural, , , $project] = specialistTerminationScenario('b8a');

    // The bid must exist BEFORE the first fire: fireProfessional nulls
    // `projects.structural_id`, so a second call would 422 with "no
    // professional of type structural is currently hired".
    $bid = \App\Models\BidStructural::create([
        'project_id' => $project->id, 'structural_id' => $structural->id,
        'price' => 25_000_000, 'calculated_total' => 25_000_000,
        'proposal' => 'Structural proposal', 'status' => 'active',
        'payment_status' => 'unpaid',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/terminate", [
            'role_type' => 'structural', 'reason' => 'Repeated no-shows',
        ])
        ->assertStatus(200);

    expect($project->fresh()->structural_id)->toBeNull()
        ->and($bid->fresh()->status)->toBe('terminated');

    // Accountability: 10 points off for being fired.
    expect($structural->fresh()->reliability_score)->toBe(90);

    // And they were told. `Notification` in this codebase is App\Models\
    // Notification — a database table, not Laravel's notification pipeline — so
    // this asserts on the row rather than using Notification::fake().
    $notice = Notification::where('user_id', $structuralUser->id)
        ->where('type', 'contract_terminated')
        ->first();

    expect($notice)->not->toBeNull()
        ->and($notice->body)->toContain('Repeated no-shows');
});

it('lets the owner fire an MEP engineer', function () {
    [$owner, , , , $mep, $project] = specialistTerminationScenario('b8b');

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/terminate", [
            'role_type' => 'mep', 'reason' => 'Scope dispute',
        ])
        ->assertStatus(200);

    expect($project->fresh()->mep_id)->toBeNull();
});

it('voids a fired specialist engineer\'s unpaid payment stages', function () {
    [$owner, , , , , $project] = specialistTerminationScenario('b8c');

    $locked = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'structural',
        'label' => 'DP', 'percentage' => 20, 'amount' => 10_000_000,
        'retention_amount' => 0, 'net_amount' => 10_000_000, 'status' => 'locked',
    ]);
    $mepStage = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'mep',
        'label' => 'DP', 'percentage' => 20, 'amount' => 8_000_000,
        'retention_amount' => 0, 'net_amount' => 8_000_000, 'status' => 'pending',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/terminate", [
            'role_type' => 'structural', 'reason' => 'Terminated',
        ])
        ->assertStatus(200);

    // Only the fired role's stages may be voided. An MEP engineer who was not
    // fired must still be payable.
    expect($locked->fresh()->status)->toBe('void')
        ->and($mepStage->fresh()->status)->toBe('pending');
});

it('voids a RESIGNING project manager\'s stages, which the role token broke', function () {
    // Two bugs stack here.
    //
    // (a) `users.role_type` spells the PM 'project_manager', but every `match`
    //     in ProjectTerminationController only knew 'pm'. resignFromProject
    //     reads `$user->role_type`, so `getColumnForRole` returned null and the
    //     request 403'd — a PM could never resign at all, so the stage
    //     settlement below was unreachable for that role.
    // (b) The settlement then passed role_type 'pm' while payment stages are
    //     stored as 'project_manager', matching zero rows.
    $owner = User::create([
        'name' => 'RPO', 'username' => 'rpo' . uniqid(),
        'email' => 'rpo' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $pmUser = User::create([
        // The real enum value, NOT 'pm' — using 'pm' here would have been a
        // MySQL error 1265 and would not have exercised the bug.
        'name' => 'RPM', 'username' => 'rpm' . uniqid(),
        'email' => 'rpm' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);
    $profile = ProjectManager::create([
        'user_id' => $pmUser->id, 'nama' => 'PM', 'reliability_score' => 100,
    ]);

    $project = Project::create([
        'title' => 'PM resign', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
        // TRAP: projects.pm_id stores the PM's USER id, not the profile id.
        'pm_id' => $pmUser->id,
    ]);

    $pmStage = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'project_manager',
        'recipient_id' => $pmUser->id,
        'label' => 'PM retainer', 'percentage' => 10, 'amount' => 50_000_000,
        'retention_amount' => 0, 'net_amount' => 50_000_000, 'status' => 'pending',
    ]);

    $this->actingAs($pmUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/resign", ['reason' => 'Better paid elsewhere'])
        ->assertStatus(200);

    expect($pmStage->fresh()->status)->toBe('void')
        ->and($project->fresh()->pm_id)->toBeNull()
        // Resigning costs 5, being fired costs 10.
        ->and($profile->fresh()->reliability_score)->toBe(95);
});

it('leaves an in-flight verifying stage alone for arbitration to settle', function () {
    // Voiding a `verifying` stage would destroy evidence of money that has
    // already moved; only dispute arbitration may settle that.
    [$owner, , , , , $project] = specialistTerminationScenario('b8d');

    $inFlight = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'mep',
        'label' => 'Mid-flight', 'percentage' => 30, 'amount' => 20_000_000,
        'retention_amount' => 0, 'net_amount' => 20_000_000, 'status' => 'verifying',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/terminate", [
            'role_type' => 'mep', 'reason' => 'Terminated mid-flight',
        ])
        ->assertStatus(200);

    expect($inFlight->fresh()->status)->toBe('verifying');
});

it('refuses a resignation from an interior designer who was not the one hired', function () {
    // getProfileIdForUser used to return $user->id for an unrecognised role — a
    // USER id compared against a column that holds a PROFILE id. The stranger
    // below HAS a valid interior profile, so this only passes if the lookup
    // returns the PROFILE id and it is correctly found NOT to match.
    $owner = User::create([
        'name' => 'SO2', 'username' => 'so2' . uniqid(),
        'email' => 'so2' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $hiredUser = User::create([
        'name' => 'Hired', 'username' => 'hir' . uniqid(),
        'email' => 'hir' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'interior',
    ]);
    $stranger = User::create([
        'name' => 'Stranger', 'username' => 'str' . uniqid(),
        'email' => 'str' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'interior',
    ]);

    $hiredProfile = InteriorProfile::create(['user_id' => $hiredUser->id, 'nama' => 'Hired one']);
    $strangerProfile = InteriorProfile::create(['user_id' => $stranger->id, 'nama' => 'Someone else']);

    $project = Project::create([
        'title' => 'Not hired', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
        'selected_interior_id' => $hiredProfile->id,
    ]);

    $this->actingAs($stranger, 'sanctum')
        ->postJson("/api/projects/{$project->id}/resign", ['reason' => 'I was never here'])
        ->assertStatus(403);

    // Nothing may be touched: the hired designer keeps the project.
    expect($project->fresh()->selected_interior_id)->toBe($hiredProfile->id)
        ->and($strangerProfile->fresh()->reliability_score)->toBe(100);
});

it('rejects an unknown role outright rather than guessing', function () {
    [$owner, , , , , $project] = specialistTerminationScenario('b8e');

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/terminate", [
            'role_type' => 'surveyor', 'reason' => 'Not a licensed role',
        ])
        ->assertStatus(422);

    expect($project->fresh()->structural_id)->not->toBeNull();
});

it('refuses to terminate on a completed project', function () {
    [$owner, , , , , $project] = specialistTerminationScenario('b8f');
    $project->update(['status' => 'completed']);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/terminate", [
            'role_type' => 'structural', 'reason' => 'Too late',
        ])
        ->assertStatus(422);
});

it('refuses a non-owner from firing anyone', function () {
    [$owner, $structuralUser, , , , $project] = specialistTerminationScenario('b8g');

    $this->actingAs($structuralUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/terminate", [
            'role_type' => 'mep', 'reason' => 'Not my call',
        ])
        ->assertStatus(403);

    expect($project->fresh()->mep_id)->not->toBeNull();
});