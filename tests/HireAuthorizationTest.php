<?php

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\NotarisProfile;
use App\Models\InteriorProfile;
use App\Models\Project;
use App\Models\ProjectPaymentTermin;
use App\Models\MepEngineer;
use App\Models\ProjectManager;
use App\Models\StructuralEngineer;
use App\Models\User;
use App\Support\Hire;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| "Hired professional" must never be true for an absent profile
|--------------------------------------------------------------------------
|
| Regression suite for the CRITICAL authorization bypass found in the final
| security audit.
|
| THE BUG
| -------
| The check was written sixty times across sixteen controllers, and six of the
| spellings were this:
|
|     (int) $project->selected_arsitek_id === (int) $user->arsitek?->id,
|
| With no architect on the project and no `arsiteks` row on the user, that is
| `(int)null === (int)null`, which in PHP is TRUE:
|
|     var_dump((int)null === (int)null);   // bool(true)
|     var_dump((int)null === (int)0);     // bool(true)
|
| So a user whose `role_type` is `arsitek` but who has NO profile was the
| "hired architect" of every project with no architect. Same for all six
| profile-backed roles.
|
| REACHABLE STATE
| ---------------
| `AdminUserController::updateRole` changes `role_type` with no profile
| side-effect, so promoting a contractor to architect — or demoting any
| professional — produces exactly the mismatched pair.
|
| BLAST RADIUS (all verified reachable)
| -------------------------------------
| Minting a payment stage on a FOREIGN project; reading another project's payment
| stages; reading a dispute thread and downloading its EVIDENCE FILES from the
| private disk; the private document vault; phase sealing; BOM writes; warranty
| closure; termination. One rule, twenty doors.
|
| The fix is `App\Support\Hire::matches()`, which requires BOTH sides present.
| These tests pin that, per role, plus the endpoint-level consequence.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function roleUser(string $role, string $tag, bool $withProfile = true): User
{
    $user = User::create([
        'name' => "U {$role} {$tag}", 'username' => "u_{$role}_{$tag}" . uniqid(),
        'email' => "u_{$role}_{$tag}" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);

    if (! $withProfile) {
        return $user;
    }

    // A profile of the matching type, so the ONLY thing absent is the project's
    // column (or vice versa). Each case is tested both ways.
    match ($role) {
        'arsitek' => Arsitek::create(['user_id' => $user->id, 'nama' => 'A']),
        'kontraktor' => Kontraktor::create(['user_id' => $user->id, 'nama' => 'K']),
        'interior' => InteriorProfile::create(['user_id' => $user->id, 'nama' => 'I']),
        'notaris' => NotarisProfile::create(['user_id' => $user->id, 'nama' => 'N']),
        'structural' => StructuralEngineer::create(['user_id' => $user->id, 'nama' => 'S']),
        'mep' => MepEngineer::create(['user_id' => $user->id, 'nama' => 'M']),
        'project_manager' => ProjectManager::create(['user_id' => $user->id, 'nama' => 'P']),
        default => null,
    };

    return $user;
}

it('is FALSE when the project has no professional and the user has no profile', function (string $role) {
    $user = roleUser($role, 'bothnull', withProfile: false);

    $project = Project::create([
        'title' => "Both null {$role}", 'user_id' => $user->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
    ]);

    // THE REGRESSION: this was TRUE.
    expect(Hire::matches($project, $user, $role))->toBeFalse();
})->with(['arsitek', 'kontraktor', 'interior', 'notaris', 'structural', 'mep', 'project_manager']);

it('is FALSE when the user has a profile but the project has no professional', function (string $role) {
    $user = roleUser($role, 'profilenocol');

    $project = Project::create([
        'title' => "Profile no column {$role}", 'user_id' => $user->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
    ]);

    // (int)null === (int)<real id> -> false anyway, but the NULL check on the
    // column is what stops the symmetric case.
    expect(Hire::matches($project, $user, $role))->toBeFalse();
})->with(['arsitek', 'kontraktor', 'interior', 'notaris', 'structural', 'mep', 'project_manager']);

it('is TRUE only when the project actually names this profile', function (string $role) {
    $user = roleUser($role, 'real');

    $column = config("bids.{$role}.project_profile_column");
    $profileId = Hire::profileIdFor($role, $user);

    $project = Project::create([
        'title' => "Real hire {$role}", 'user_id' => $user->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
        $column => $profileId,
    ]);

    expect(Hire::matches($project, $user, $role))->toBeTrue();
})->with(['arsitek', 'kontraktor', 'interior', 'notaris', 'structural', 'mep', 'project_manager']);

it('is FALSE when a DIFFERENT professional of the same role holds the slot', function () {
    $user = roleUser('arsitek', 'mine');
    $other = roleUser('arsitek', 'theirs');

    $project = Project::create([
        'title' => 'Someone else is hired', 'user_id' => $other->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
        'selected_arsitek_id' => Hire::profileIdFor('arsitek', $other),
    ]);

    expect(Hire::matches($project, $user, 'arsitek'))->toBeFalse();
});

it('is FALSE when asked about a role the user does not hold', function () {
    $user = roleUser('arsitek', 'onlyarsitek');

    $project = Project::create([
        'title' => 'Cross role', 'user_id' => $user->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
        'selected_kontraktor_id' => Hire::profileIdFor('kontraktor', roleUser('kontraktor', 'k')),
    ]);

    // Asking "is this architect the hired contractor?" must be false even
    // though a contractor IS hired.
    expect(Hire::matches($project, $user, 'kontraktor'))->toBeFalse();
});

it('is FALSE for a role outside the seven licensed ones', function () {
    $user = roleUser('supplier', 'supplier');

    $project = Project::create([
        'title' => 'Unlicensed', 'user_id' => $user->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
    ]);

    expect(Hire::matches($project, $user, 'supplier'))->toBeFalse();
});

it('refuses to mint a payment stage on a project with no architect', function () {
    // The money-write consequence. `TerminPlanService`'s bound no-ops here
    // because there is no accepted bid for the role, so without the
    // authorization fix this wrote a schedule on a foreign project.
    $owner = User::create([
        'name' => 'Owner', 'username' => 'own' . uniqid(),
        'email' => 'own' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $project = Project::create([
        'title' => 'No architect', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
        // selected_arsitek_id deliberately NULL
    ]);

    // A user whose role_type says arsitek but who has no profile.
    $attacker = User::create([
        'name' => 'Ghost', 'username' => 'gho' . uniqid(),
        'email' => 'gho' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    $this->actingAs($attacker, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payment-termins", [
            'label' => 'Forged', 'percentage' => 100, 'amount' => 400_000_000,
            'role_type' => 'arsitek', 'status' => 'pending',
        ])
        ->assertStatus(403);

    expect(ProjectPaymentTermin::where('project_id', $project->id)->count())->toBe(0);
});

it('refuses to read a dispute thread and its evidence without a relationship', function () {
    $owner = User::create([
        'name' => 'DO', 'username' => 'do' . uniqid(),
        'email' => 'do' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $stranger = User::create([
        'name' => 'Ghost2', 'username' => 'gho2' . uniqid(),
        'email' => 'gho2' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);

    $project = Project::create([
        'title' => 'Private dispute', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
    ]);

    $this->actingAs($stranger, 'sanctum')
        ->getJson("/api/projects/{$project->id}/disputes")
        ->assertStatus(403);
});

it('refuses project document vault access on a project with no professional', function () {
    $owner = User::create([
        'name' => 'DO2', 'username' => 'do2' . uniqid(),
        'email' => 'do2' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $project = Project::create([
        'title' => 'Private vault', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
    ]);

    // A profileless "arsitek" on a project with no architect.
    $attacker = User::create([
        'name' => 'Ghost3', 'username' => 'gho3' . uniqid(),
        'email' => 'gho3' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    $this->actingAs($attacker, 'sanctum')
        ->getJson("/api/projects/{$project->id}/documents")
        ->assertStatus(403);
});

it('still grants the OWNER and the genuinely hired professional', function () {
    // The fix must not over-correct into refusing legitimate participants.
    $owner = User::create([
        'name' => 'RealOwner', 'username' => 'ro3' . uniqid(),
        'email' => 'ro3' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $architect = roleUser('arsitek', 'legit');
    $profileId = Hire::profileIdFor('arsitek', $architect);

    $project = Project::create([
        'title' => 'Legitimate', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
        'selected_arsitek_id' => $profileId,
    ]);

    expect(Hire::canAccess($project, $owner))->toBeTrue()
        ->and(Hire::canAccess($project, $architect))->toBeTrue();
});

it('distinguishes the ASSIGNED project manager from any other manager', function () {
    $owner = User::create([
        'name' => 'RO4', 'username' => 'ro4' . uniqid(),
        'email' => 'ro4' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $assigned = User::create([
        'name' => 'PM assigned', 'username' => 'pma' . uniqid(),
        'email' => 'pma' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);
    $other = User::create([
        'name' => 'PM other', 'username' => 'pmo' . uniqid(),
        'email' => 'pmo' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);

    // `projects.pm_id` stores the PM's USER id, and is NULL until assigned.
    $project = Project::create([
        'title' => 'PM gate', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
        'pm_id' => $assigned->id,
    ]);

    expect(Hire::isOwnerOrAssignedPm($project, $owner))->toBeTrue()
        ->and(Hire::isOwnerOrAssignedPm($project, $assigned))->toBeTrue()
        ->and(Hire::isOwnerOrAssignedPm($project, $other))->toBeFalse();

    // And with no PM assigned, nobody gets in on the PM's authority.
    $unassigned = Project::create([
        'title' => 'No PM', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
    ]);

    expect(Hire::isOwnerOrAssignedPm($unassigned, $assigned))->toBeFalse();
});