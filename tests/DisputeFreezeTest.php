<?php

use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\ProjectDispute;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| No NEW financial commitments while a dispute is open
|--------------------------------------------------------------------------
|
| Regression suite for a MEDIUM audit finding.
|
| `DisputeService::assertNoOpenDispute()` is the platform's payment freeze, and it
| was applied inconsistently:
#
|   HAS IT   ProjectChangeOrderController  (both sites)
#            ProjectPaymentTerminController::storePaymentTermin / updatePaymentTermin
#
|   LACKS IT ProjectFeatureController::verifyProcurementRequest
#            ProjectRequirementController::requestProcurement
#            FirmMemberController::quickAssign
#            ProjectPaymentTerminController::linkMilestone / unlinkMilestone
#
| Every one of those creates or alters a new payable obligation, so a project
| under arbitration could still accumulate costs and could still change WHEN money
| becomes payable. That is precisely what arbitration is meant to stop: the
| arbitrating admin is deciding about a contested sum while the parties keep
| adding to it.
|
| `linkMilestone` is the interesting one. It moves no money, so it does not look
| financial -- but linking a stage to a milestone is exactly what allows that
| stage to be unlocked by a milestone approval. Changing the trigger mid-arbitration
| changes when money becomes payable without moving any money yet.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function frzUser(string $roleType, string $tag): User
{
    $user = User::create([
        'name' => "$roleType $tag", 'username' => "u_$tag" . uniqid(),
        'email' => "e_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $roleType,
    ]);

    match ($roleType) {
        'kontraktor' => Kontraktor::create([
            'user_id' => $user->id, 'nama' => "Kontraktor $tag",
            'verification_status' => 'verified',
        ]),
        'arsitek' => \App\Models\Arsitek::create([
            'user_id' => $user->id, 'nama' => "Studio $tag",
            'verification_status' => 'verified',
        ]),
        // `user` is the client role: no professional profile by design.
        'user' => null,
        default => null,
    };

    return $user;
}

function frzProject(string $tag, array $columns = []): array
{
    $owner = frzUser('user', "own_$tag");
    $project = Project::create(array_merge([
        'title' => "Job $tag", 'user_id' => $owner->id,
        'budget' => 300_000_000, 'status' => 'in_progress',
    ], $columns));

    return [$owner, $project];
}

function openDispute(Project $project, User $openedBy): ProjectDispute
{
    return ProjectDispute::create([
        'project_id' => $project->id,
        'opened_by' => $openedBy->id,
        'category' => 'payment',
        'title' => 'Contested termin',
        'description' => 'The client disputes this payment stage.',
        'status' => 'open',
    ]);
}

// ---------------------------------------------------------------------------
// Payment stage link / unlink
// ---------------------------------------------------------------------------

it('refuses to LINK a payment stage while a dispute is open', function () {
    $pro = frzUser('kontraktor', 'link');
    [, $project] = frzProject('link', ['selected_kontraktor_id' => $pro->kontraktor->id]);

    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'label' => 'Stage', 'percentage' => 50,
        'amount' => 10_000_000, 'role_type' => 'kontraktor',
        'recipient_id' => $pro->id, 'status' => 'locked',
    ]);

    $milestone = \App\Models\ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Phase', 'is_completed' => false,
    ]);

    openDispute($project, $pro);

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/payment-termins/{$termin->id}/link-milestone", [
            'milestone_id' => $milestone->id,
        ])
        ->assertStatus(422);

    expect($termin->fresh()->milestone_id)->toBeNull();
});

it('refuses to UNLINK a payment stage while a dispute is open', function () {
    $pro = frzUser('kontraktor', 'unlink');
    [, $project] = frzProject('unlink', ['selected_kontraktor_id' => $pro->kontraktor->id]);

    $milestone = \App\Models\ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Phase', 'is_completed' => false,
    ]);

    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'label' => 'Stage', 'percentage' => 50,
        'amount' => 10_000_000, 'role_type' => 'kontraktor',
        'recipient_id' => $pro->id, 'status' => 'locked',
        'milestone_id' => $milestone->id,
    ]);

    openDispute($project, $pro);

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/payment-termins/{$termin->id}/unlink-milestone")
        ->assertStatus(422);

    expect((int) $termin->fresh()->milestone_id)->toBe((int) $milestone->id);
});

it('still links a stage when NO dispute is open', function () {
    // Guards against the freeze becoming a blanket denial.
    $pro = frzUser('kontraktor', 'linkok');
    [, $project] = frzProject('linkok', ['selected_kontraktor_id' => $pro->kontraktor->id]);

    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'label' => 'Stage', 'percentage' => 50,
        'amount' => 10_000_000, 'role_type' => 'kontraktor',
        'recipient_id' => $pro->id, 'status' => 'locked',
    ]);

    $milestone = \App\Models\ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Phase', 'is_completed' => false,
    ]);

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/payment-termins/{$termin->id}/link-milestone", [
            'milestone_id' => $milestone->id,
        ])
        ->assertStatus(200);

    expect((int) $termin->fresh()->milestone_id)->toBe((int) $milestone->id);
});

it('allows the link again once the dispute is RESOLVED', function () {
    $pro = frzUser('kontraktor', 'resolved');
    [, $project] = frzProject('resolved', ['selected_kontraktor_id' => $pro->kontraktor->id]);

    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'label' => 'Stage', 'percentage' => 50,
        'amount' => 10_000_000, 'role_type' => 'kontraktor',
        'recipient_id' => $pro->id, 'status' => 'locked',
    ]);

    $milestone = \App\Models\ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Phase', 'is_completed' => false,
    ]);

    $dispute = openDispute($project, $pro);

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/payment-termins/{$termin->id}/link-milestone", [
            'milestone_id' => $milestone->id,
        ])
        ->assertStatus(422);

    $dispute->update(['status' => 'resolved']);

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/payment-termins/{$termin->id}/link-milestone", [
            'milestone_id' => $milestone->id,
        ])
        ->assertStatus(200);

    expect((int) $termin->fresh()->milestone_id)->toBe((int) $milestone->id);
});

// ---------------------------------------------------------------------------
// Specialist assignment
// ---------------------------------------------------------------------------

it('refuses to assign a specialist while a dispute is open', function () {
    $architect = frzUser('arsitek', 'assign');
    [, $project] = frzProject('assign', ['selected_arsitek_id' => $architect->arsitek->id]);

    $specialist = frzUser('kontraktor', 'specialist');

    \App\Models\FirmMember::create([
        'firm_owner_id' => $architect->id,
        'member_user_id' => $specialist->id,
        'role_in_firm' => 'structural',
        'status' => 'active',
    ]);

    openDispute($project, $architect);

    $this->actingAs($architect)
        ->postJson('/api/firm-members/quick-assign', [
            'member_user_id' => $specialist->id,
            'project_id' => $project->id,
            'sub_role' => 'structural',
            'rate' => 5_000_000,
        ])
        ->assertStatus(422);

    expect(ProjectAddendum::where('project_id', $project->id)->count())->toBe(0);
});

it('still assigns a specialist when no dispute is open', function () {
    $architect = frzUser('arsitek', 'assignok');
    [, $project] = frzProject('assignok', ['selected_arsitek_id' => $architect->arsitek->id]);

    $specialist = frzUser('kontraktor', 'specialistok');

    \App\Models\FirmMember::create([
        'firm_owner_id' => $architect->id,
        'member_user_id' => $specialist->id,
        'role_in_firm' => 'structural',
        'status' => 'active',
    ]);

    $this->actingAs($architect)
        ->postJson('/api/firm-members/quick-assign', [
            'member_user_id' => $specialist->id,
            'project_id' => $project->id,
            'sub_role' => 'structural',
            'rate' => 5_000_000,
        ])
        ->assertStatus(201);

    expect(ProjectAddendum::where('project_id', $project->id)->count())->toBe(1);
});