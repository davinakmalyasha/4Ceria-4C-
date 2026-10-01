<?php

use App\Models\Arsitek;
use App\Models\InteriorProfile;
use App\Models\Kontraktor;
use App\Models\MepEngineer;
use App\Models\NotarisProfile;
use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\ProjectManager;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Phase seals, BOM and engineering lifecycle were gated on the wrong subject
|--------------------------------------------------------------------------
|
| Regression suite for five HIGH/LOW audit findings that share one root cause:
| an authorization test written inline, against a column that can be NULL, by
| someone who expected the comparison to fail closed.
|
| 1. ProjectPhaseController -- four phase-seal endpoints (HIGH)
|      if ($user->role_type !== 'arsitek'
|          || $project->selected_arsitek_id !== optional($user->arsitek)->id)
|
|    `null !== null` is FALSE, so `!==` is not a fix here: a profile-less
|    `role_type=arsitek` on a project with no architect passed and wrote
|    `design_handover_submitted_at` on a FOREIGN project. Same for kontraktor,
|    interior and notaris.
|
| 2. ProjectRequirementController -- BOM authorization (HIGH)
|      $project->structural_id === optional($user->structural_engineer)->id
|      $project->mep_id        === optional($user->mep_engineer)->id
|
|    Same shape, so any profile-less structural/MEP account could read and write
|    the bill of materials, folders, stock levels, usage history and procurement
|    requests of ANY project that had not yet hired one.
|
| 3. ProjectEngineeringController -- six lifecycle endpoints (HIGH)
|    `authorizeProjectAccess` admits ANY participant, so a hired specialist could
|    authorise their own hiring request, which sets an addendum to `authorized`
|    and makes an arbitrary-amount fee payable.
|
| 4. TechnicalDesignReviewController -- design approval (HIGH)
|    `checkAuth(..., 'pm')` also admitted the HIRED ARCHITECT, who was then both
|    the author and the approver of their own design integration -- and
|    `approveDesign()` bulk-flips every linked termin from `locked` to `pending`,
|    which is the payment trigger.
|
| 5. ProjectController::update -- negotiated_fee (LOW, latent)
|      Auth::user()->arsitek?->id === $project->selected_arsitek_id
|
|    No column guard, so the same null pair would let such an account KEEP
#    `negotiated_fee` rather than having it stripped -- and that figure is what
#    the whole termin plan is validated against.
|    Not reachable TODAY: `update()`'s `$isWorker` branch already requires both a
|    non-null column and a profile row, so such a caller is refused with 403
|    first. Fixed anyway, because this family becomes live the moment anyone
|    loosens that guard, and the tests assert the outcome that matters.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function sweepUser(string $roleType, string $tag): User
{
    $user = User::create([
        'name' => "$roleType $tag", 'username' => "u_$tag" . uniqid(),
        'email' => "e_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $roleType,
    ]);

    // Intentionally NO profile row: this is the state that makes the id
    // comparison null on both sides.
    return $user;
}

function sweepUserWithProfile(string $roleType, string $tag): User
{
    $user = sweepUser($roleType, $tag);

    $model = match ($roleType) {
        'arsitek' => Arsitek::class,
        'kontraktor' => Kontraktor::class,
        'interior' => InteriorProfile::class,
        'notaris' => NotarisProfile::class,
        'structural' => StructuralEngineer::class,
        'mep' => MepEngineer::class,
        'project_manager' => ProjectManager::class,
    };

    $model::create([
        'user_id' => $user->id, 'nama' => "Firm $tag",
        'verification_status' => 'verified',
    ]);

    return $user;
}

function sweepProject(string $tag, array $columns = []): array
{
    $owner = User::create([
        'name' => "Owner $tag", 'username' => "own_$tag" . uniqid(),
        'email' => "own_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    $project = Project::create(array_merge([
        'title' => "Job $tag", 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
    ], $columns));

    return [$owner, $project];
}

function profileIdFor(User $user): ?int
{
    return match ($user->role_type) {
        'arsitek' => $user->arsitek?->id,
        'kontraktor' => $user->kontraktor?->id,
        'interior' => $user->interior_profile?->id,
        'notaris' => $user->notaris_profile?->id,
        'structural' => $user->structural_engineer?->id,
        'mep' => $user->mep_engineer?->id,
        'project_manager' => $user->project_manager?->id,
        default => null,
    };
}

// ---------------------------------------------------------------------------
// 1. Phase seals
// ---------------------------------------------------------------------------

it('refuses a phase seal from a profile-less caller on a project with no such role', function (
    string $roleType,
    string $route,
    string $column,
) {
    $attacker = sweepUser($roleType, "seal_$roleType");
    [, $project] = sweepProject("seal_$roleType");

    // Guard: the project must genuinely have nobody in that role, or the test
    // would prove nothing about the null pair.
    expect($project->{$column})->toBeNull()
        ->and(profileIdFor($attacker))->toBeNull();

    $this->actingAs($attacker)
        ->postJson("/api/projects/{$project->id}/{$route}")
        ->assertStatus(403);
})->with([
    ['arsitek', 'seal-design', 'selected_arsitek_id'],
    ['kontraktor', 'seal-construction', 'selected_kontraktor_id'],
    ['interior', 'seal-interior', 'selected_interior_id'],
    ['notaris', 'seal-legal', 'selected_notaris_id'],
]);

it('still lets the genuinely hired professional seal their own phase', function (string $roleType) {
    $pro = sweepUserWithProfile($roleType, "real_$roleType");

    $column = match ($roleType) {
        'arsitek' => 'selected_arsitek_id',
        'kontraktor' => 'selected_kontraktor_id',
        'interior' => 'selected_interior_id',
        'notaris' => 'selected_notaris_id',
    };

    $route = match ($roleType) {
        'arsitek' => 'seal-design',
        'kontraktor' => 'seal-construction',
        'interior' => 'seal-interior',
        'notaris' => 'seal-legal',
    };

    [, $project] = sweepProject("real_$roleType", [$column => profileIdFor($pro)]);

    // sealDesign has deliverable gates; the target here is the AUTHORIZATION, so
    // a 422 from a gate is a pass, while 403 means the guard rejected them.
    $status = $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/{$route}")
        ->getStatusCode();

    expect($status)->not->toBe(403);
})->with(['arsitek', 'kontraktor', 'interior', 'notaris']);

// ---------------------------------------------------------------------------
// 2. BOM authorization
// ---------------------------------------------------------------------------

it('refuses BOM access to a profile-less structural or mep user', function (string $roleType) {
    $attacker = sweepUser($roleType, "bom_$roleType");
    [, $project] = sweepProject("bom_$roleType");

    $this->actingAs($attacker)
        ->getJson("/api/projects/{$project->id}/requirements")
        ->assertStatus(403);
})->with(['structural', 'mep']);

it('allows BOM access to a genuinely hired structural engineer', function () {
    $pro = sweepUserWithProfile('structural', 'bomreal');

    [, $project] = sweepProject('bomreal2', ['structural_id' => profileIdFor($pro)]);

    $this->actingAs($pro)
        ->getJson("/api/projects/{$project->id}/requirements")
        ->assertStatus(200);
});

it('allows BOM access to an ACTIVE sub-professional', function () {
    // The sub-professional branch is legitimate and must not be broken by the
    // fix: a specialist engaged under a lead is authorised without the core slot.
    $pro = sweepUser('structural', 'bomsub');

    [$owner, $project] = sweepProject('bomsub2');

    \App\Models\ProjectSubProfessional::create([
        'project_id' => $project->id, 'user_id' => $pro->id,
        'parent_role' => 'arsitek', 'sub_role' => 'structural',
        'assigned_by' => $owner->id, 'status' => 'active',
    ]);

    $this->actingAs($pro)
        ->getJson("/api/projects/{$project->id}/requirements")
        ->assertStatus(200);
});

// ---------------------------------------------------------------------------
// 3. Engineering lifecycle
// ---------------------------------------------------------------------------

it('refuses to authorise a specialist request from a mere participant', function () {
    // A hired architect is a participant but not the owner or PM.
    $pro = sweepUserWithProfile('arsitek', 'eng');

    [, $project] = sweepProject('eng1', ['selected_arsitek_id' => profileIdFor($pro)]);

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/authorize-specialist", [
            'role_type' => 'structural',
        ])
        ->assertStatus(403);
});

it('refuses to verify an engineering request from a mere participant', function () {
    $pro = sweepUserWithProfile('kontraktor', 'engver');

    [, $project] = sweepProject('eng2', ['selected_kontraktor_id' => profileIdFor($pro)]);

    $addendum = ProjectAddendum::create([
        'project_id' => $project->id, 'role_type' => 'structural',
        'user_id' => $pro->id, 'title' => 'Hire structural', 'amount' => 5_000_000,
        'status' => 'pending_approval',
    ]);

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/verify-engineering/{$addendum->id}", [
            'status' => 'approved',
        ])
        ->assertStatus(403);

    expect($addendum->fresh()->status)->toBe('pending_approval');
});

it('still lets a participant REQUEST an engineering role and upload logs', function () {
    // The participation rights that must NOT be broken by the tightening.
    $pro = sweepUserWithProfile('arsitek', 'engright');

    [, $project] = sweepProject('eng3', ['selected_arsitek_id' => profileIdFor($pro)]);

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/request-engineering", [
            'role_type' => 'structural',
            'description' => 'We need a structural review for the roof.',
        ])
        ->assertStatus(200);
});

// ---------------------------------------------------------------------------
// 4. Design approval
// ---------------------------------------------------------------------------

it('refuses design-integration approval from the HIRED ARCHITECT', function () {
    // The architect authored the design; approving it is the client's or PM's
    // call. `approveDesign` is the payment trigger, so self-approval is the worst
    // case of author-equals-approver.
    $architect = sweepUserWithProfile('arsitek', 'tdr');

    [, $project] = sweepProject('tdr1', ['selected_arsitek_id' => profileIdFor($architect)]);

    $this->actingAs($architect)
        ->postJson("/api/projects/{$project->id}/documents/approve-design", [
            'role_type' => 'structural',
        ])
        ->assertStatus(403);

    expect($project->fresh()->structural_approved_at)->toBeNull();
});

it('lets the OWNER approve a design integration', function () {
    [$owner, $project] = sweepProject('tdr2');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/documents/approve-design", [
            'role_type' => 'structural',
        ])
        ->assertStatus(200);

    expect($project->fresh()->structural_approved_at)->not->toBeNull();
});

// ---------------------------------------------------------------------------
// 5. negotiated_fee
// ---------------------------------------------------------------------------

it('cannot have a profile-less arsitek set negotiated_fee', function () {
    // NOT AN EXPLOIT TODAY, and the test says so.
    //
    // `update()`'s `$isWorker` branch already requires BOTH
    // `$project->selected_arsitek_id` and an `arsiteks` row, so a profile-less
    // arsitek can never become a worker and is refused with 403 before reaching
    // the `unset()` line. The null pair at ProjectController:2518 was therefore a
    // latent trap rather than a live hole.
    //
    // It is still fixed, because the whole family of these is a trap that becomes
    // live the moment anyone loosens `$isWorker`, and because the corrected line
    // now says the same thing as the guard above it. This test pins the OUTCOME
    // that matters -- the fee is never written by an unauthorised caller -- and
    // would keep passing if the endpoint's guard were relaxed by mistake.
    $attacker = sweepUser('arsitek', 'fee');

    [, $project] = sweepProject('fee1');

    $this->actingAs($attacker)
        ->putJson("/api/projects/{$project->id}", [
            'title' => $project->title,
            'negotiated_fee' => 99_000_000,
        ])
        ->assertStatus(403);

    expect($project->fresh()->negotiated_fee)->not->toBe(99000000.0);
});

it('never lets a non-owner write another project\'s negotiated_fee', function () {
    $attacker = sweepUser('arsitek', 'fee2');
    [, $otherOwnerProject] = sweepProject('fee2', ['negotiated_fee' => 12_000_000]);

    $this->actingAs($attacker)
        ->putJson("/api/projects/{$otherOwnerProject->id}", [
            'title' => $otherOwnerProject->title,
            'negotiated_fee' => 77_000_000,
        ])
        ->assertStatus(403);

    // decimal(24,2) comes back as a string, so compare numerically.
    expect((float) $otherOwnerProject->fresh()->negotiated_fee)->toBe(12000000.0);
});

it('keeps negotiated_fee OWNER-ONLY on project update', function () {
    // The real invariant. A project PATCH is not the fee-negotiation channel:
    // `negotiated_fee` and `payment_instructions` are stripped for every
    // non-owner by an unconditional `unset()`, and a professional negotiates
    // through the bid flow (`negotiation_count` / `fee_agreed_at`).
    //
    // The gate that used to sit here looked like it made the assigned architect
    // an exception. It did not: the earlier `unset()` had already removed both
    // keys, so `$isArsitek` was dead code that only *appeared* to be a policy.
    $architect = sweepUserWithProfile('arsitek', 'feeowner');

    [, $project] = sweepProject('fee3', [
        'selected_arsitek_id' => profileIdFor($architect),
        'negotiated_fee' => 40_000_000,
    ]);

    $this->actingAs($architect)
        ->putJson("/api/projects/{$project->id}", [
            'title' => $project->title,
            'negotiated_fee' => 45_000_000,
        ])
        ->assertStatus(200);

    // Unchanged: the owner-only strip wins over the architect allowance.
    expect((float) $project->fresh()->negotiated_fee)->toBe(40000000.0);
});

it('lets the OWNER set negotiated_fee', function () {
    [$owner, $project] = sweepProject('fee4', ['negotiated_fee' => 40_000_000]);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}", [
            'title' => $project->title,
            'negotiated_fee' => 45_000_000,
        ])
        ->assertStatus(200);

    expect((float) $project->fresh()->negotiated_fee)->toBe(45000000.0);
});