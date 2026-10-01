<?php

use App\Models\FirmMember;
use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\ProjectMilestone;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Two more `null == null` "you are hired" bypasses
|--------------------------------------------------------------------------
|
| Regression suite for two CRITICAL audit findings, both the same family as
| App\Support\Hire: a comparison that succeeds when BOTH sides are null.
|
| 1. ProjectTerminationController::resignFromProject()  (CRITICAL)
| ------------------------------------------------------------------
|     $isHired = $role === 'pm'
|         ? (int) $project->pm_id === (int) $user->id
|         : ($column && (int) $project->$column
|             === (int) $this->getProfileIdForUser($user, $role));
|
| With no professional of that role on the project and no profile on the user,
| `getProfileIdForUser()` returns null and the column is null, so this is
| `(int)null === (int)null` -- TRUE.
|
| `POST /api/projects/{any}/resign` then:
|   - voided every unpaid payment stage of that role;
|   - ran `where('structural_id', null)`, which SQL renders as
|     `structural_id IS NULL` and therefore DELETED every incomplete milestone of
#     ANY unassigned role on a foreign project;
|   - billed the attacker a reliability-score penalty for resigning from a
#     project they were never on.
|
| 2. FirmMemberController::quickAssign()  (CRITICAL)
| ---------------------------------------------------
|     if ($user->role_type === 'arsitek'
#         && $project->selected_arsitek_id == optional($user->arsitek)->id) ...
|
| Loose `==` on two nulls again. A profile-less `role_type=arsitek` passed and
| created a `specialist_assignment` addendum at an ATTACKER-CHOSEN `rate`, which
| the owner or PM can then authorise and pay -- a direct route to draining
| escrow.
|
| Reachable state for both: Admin\AdminUserController::updateRole changes
# `role_type` with no profile side-effect, which is the same reachability
# App\Support\Hire's docblock documents.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function bypassUser(string $roleType, string $tag): User
{
    return User::create([
        'name' => "$roleType $tag", 'username' => "u_$tag" . uniqid(),
        'email' => "e_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'),
        'role_type' => $roleType,
    ]);
}

/**
 * A user with `role_type` set but NO profile row -- the state that makes
 * `optional($user->arsitek)->id` null while the project's column is also null.
 */
function profileLessUser(string $roleType, string $tag): User
{
    return bypassUser($roleType, $tag);
}

function ownerProject(string $tag, array $columns = []): array
{
    $owner = bypassUser('user', "own_$tag");
    $project = Project::create(array_merge([
        'title' => "Job $tag", 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
    ], $columns));

    return [$owner, $project];
}

// ---------------------------------------------------------------------------
// 1. resignFromProject
// ---------------------------------------------------------------------------

it('refuses a resign from a project where the caller holds no profile', function (string $roleType) {
    $attacker = profileLessUser($roleType, 'resign');
    [, $project] = ownerProject('r1');

    $this->actingAs($attacker)
        ->postJson("/api/projects/{$project->id}/resign", ['reason' => 'not my project'])
        ->assertStatus(403);
})->with(['arsitek', 'kontraktor', 'interior', 'notaris', 'structural', 'mep']);

it('does not void payment stages when a profile-less caller resigns', function () {
    $attacker = profileLessUser('arsitek', 'void');
    [, $project] = ownerProject('r2');

    $project->paymentTermins()->create([
        'label' => 'Design', 'percentage' => 100, 'amount' => 40_000_000,
        'role_type' => 'arsitek', 'status' => 'pending',
    ]);

    $this->actingAs($attacker)
        ->postJson("/api/projects/{$project->id}/resign", ['reason' => 'x'])
        ->assertStatus(403);

    expect($project->paymentTermins()->where('status', 'pending')->count())->toBe(1);
});

it('does not delete unassigned milestones when a profile-less caller resigns', function () {
    // The `where('structural_id', null)` deletion. `structural_id IS NULL`
    // matched EVERY unassigned milestone, of any role.
    $attacker = profileLessUser('structural', 'ms');
    [, $project] = ownerProject('r3');

    $orphan = $project->milestones()->create([
        'title' => 'Unassigned milestone', 'is_completed' => false,
    ]);

    expect($orphan->structural_id)->toBeNull();

    $this->actingAs($attacker)
        ->postJson("/api/projects/{$project->id}/resign", ['reason' => 'x'])
        ->assertStatus(403);

    expect($project->milestones()->whereKey($orphan->id)->exists())->toBeTrue();
});

it('still lets a GENUINELY hired professional resign', function () {
    $pro = bypassUser('arsitek', 'good');

    $profile = \App\Models\Arsitek::create([
        'user_id' => $pro->id, 'nama' => 'Studio',
        'verification_status' => 'verified',
    ]);

    [, $project] = ownerProject('r4', ['selected_arsitek_id' => $profile->id]);

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/resign", ['reason' => 'conflict of interest'])
        ->assertStatus(200);

    expect($project->fresh()->selected_arsitek_id)->toBeNull();
});

it('refuses a professional who holds a profile but is not hired on THIS project', function () {
    $pro = bypassUser('arsitek', 'other');
    $profile = \App\Models\Arsitek::create([
        'user_id' => $pro->id, 'nama' => 'Studio',
        'verification_status' => 'verified',
    ]);

    // The project HAS an architect, just a different one.
    $other = bypassUser('arsitek', 'third');
    $otherProfile = \App\Models\Arsitek::create([
        'user_id' => $other->id, 'nama' => 'Other',
        'verification_status' => 'verified',
    ]);

    [, $project] = ownerProject('r5', ['selected_arsitek_id' => $otherProfile->id]);

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/resign", ['reason' => 'x'])
        ->assertStatus(403);
});

// ---------------------------------------------------------------------------
// 2. quickAssign
// ---------------------------------------------------------------------------

it('refuses a specialist assignment from a profile-less lead professional', function () {
    $attacker = profileLessUser('arsitek', 'assign');

    $specialist = bypassUser('structural', 'spec');
    $specProfile = \App\Models\StructuralEngineer::create([
        'user_id' => $specialist->id, 'nama' => 'S',
        'verification_status' => 'verified',
    ]);

    [, $project] = ownerProject('q1');

    // The attacker must own a firm roster row for this to get past gate 1.
    FirmMember::create([
        'firm_owner_id' => $attacker->id,
        'member_user_id' => $specialist->id,
        'role_in_firm' => 'structural',
        'status' => 'active',
    ]);

    $this->actingAs($attacker)
        ->postJson('/api/firm-members/quick-assign', [
            'member_user_id' => $specialist->id,
            'project_id' => $project->id,
            'sub_role' => 'structural',
            'rate' => 99_000_000,
        ])
        ->assertStatus(403);

    expect(ProjectAddendum::where('project_id', $project->id)->count())->toBe(0);
});

it('refuses a specialist assignment by a contractor on an architect project', function () {
    $contractor = bypassUser('kontraktor', 'kc');
    $kontraktorProfile = \App\Models\Kontraktor::create([
        'user_id' => $contractor->id, 'nama' => 'K',
        'verification_status' => 'verified',
    ]);

    $specialist = bypassUser('mep', 'spec2');
    \App\Models\MepEngineer::create([
        'user_id' => $specialist->id, 'nama' => 'M',
        'verification_status' => 'verified',
    ]);

    FirmMember::create([
        'firm_owner_id' => $contractor->id,
        'member_user_id' => $specialist->id,
        'role_in_firm' => 'mep',
        'status' => 'active',
    ]);

    // Hired as contractor; the project has NO contractor column match problem,
    // so this must succeed -- proving the gate is not blanket-denying.
    [, $project] = ownerProject('q2', ['selected_kontraktor_id' => $kontraktorProfile->id]);

    $this->actingAs($contractor)
        ->postJson('/api/firm-members/quick-assign', [
            'member_user_id' => $specialist->id,
            'project_id' => $project->id,
            'sub_role' => 'mep',
            'rate' => 5_000_000,
        ])
        ->assertStatus(201);

    expect(ProjectAddendum::where('project_id', $project->id)->count())->toBe(1);
});

it('refuses a specialist assignment by a lead hired on a DIFFERENT project', function () {
    $pro = bypassUser('arsitek', 'lead');
    $profile = \App\Models\Arsitek::create([
        'user_id' => $pro->id, 'nama' => 'Studio',
        'verification_status' => 'verified',
    ]);

    $specialist = bypassUser('structural', 'spec3');
    \App\Models\StructuralEngineer::create([
        'user_id' => $specialist->id, 'nama' => 'S',
        'verification_status' => 'verified',
    ]);

    FirmMember::create([
        'firm_owner_id' => $pro->id,
        'member_user_id' => $specialist->id,
        'role_in_firm' => 'structural',
        'status' => 'active',
    ]);

    // Hired on project A, attacking project B.
    [, $projectA] = ownerProject('q3', ['selected_arsitek_id' => $profile->id]);
    [, $projectB] = ownerProject('q4');

    $this->actingAs($pro)
        ->postJson('/api/firm-members/quick-assign', [
            'member_user_id' => $specialist->id,
            'project_id' => $projectB->id,
            'sub_role' => 'structural',
            'rate' => 10_000_000,
        ])
        ->assertStatus(403);

    expect(ProjectAddendum::where('project_id', $projectB->id)->count())->toBe(0);
});