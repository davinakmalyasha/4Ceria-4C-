<?php

use App\Models\Arsitek;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\ProjectProcurementRequest;
use App\Models\ProjectSubProfessional;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Generic addendum approval is owner-or-PM, pending_approval only
|--------------------------------------------------------------------------
|
| Regression suite for the binary decision next to the negotiation
| machine:
| - Binding 404, per-verb 403s, and the cluster's only 400.
| - Approve forks on the amount: > 0 → approved_unpaid (payment still
|   owed, specialist invited), == 0 → approved (counts toward budget).
| - A procurement-linked addendum authorises the request — the old
|   `approved` write was an enum value that does not exist and 500'd.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function adOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "adown_$tag" . uniqid(),
        'email' => "adown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function adArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "ada_$tag" . uniqid(),
        'email' => "ada_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);

    return $user;
}

function adProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "Addendum Decision $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open', 'target_role' => 'both',
    ]);
}

function adUri(Project $project, int $id, string $verb): string
{
    return "/api/projects/{$project->id}/addendums/{$id}/{$verb}";
}

it('answers the binding 404, the per-verb 403s and the pending 400', function () {
    $owner = adOwner('gate');
    $pro = adArchitect('gate');
    $other = adProject($owner, 'other');
    $project = adProject($owner, 'gate');
    $addendum = ProjectAddendum::create([
        'project_id' => $project->id, 'type' => 'extra_fee', 'role_type' => 'arsitek',
        'user_id' => $pro->id, 'title' => 'Extra', 'amount' => 100000,
        'status' => 'pending_approval',
    ]);

    $this->actingAs($owner)
        ->postJson(adUri($other, $addendum->id, 'approve'))
        ->assertStatus(404)
        ->assertJsonPath('message', 'Not found.');

    $this->actingAs($pro)
        ->postJson(adUri($project, $addendum->id, 'approve'))
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only the Owner or PM can approve addendums.');

    $this->actingAs($pro)
        ->postJson(adUri($project, $addendum->id, 'reject'))
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only the Owner or PM can reject addendums.');

    $paid = ProjectAddendum::create([
        'project_id' => $project->id, 'type' => 'extra_fee', 'role_type' => 'arsitek',
        'user_id' => $pro->id, 'title' => 'Done', 'amount' => 100000, 'status' => 'paid',
    ]);

    $this->actingAs($owner)
        ->postJson(adUri($project, $paid->id, 'approve'))
        ->assertStatus(400)
        ->assertJsonPath('message', 'This addendum is not pending approval.');

    expect($addendum->fresh()->status)->toBe('pending_approval');
});

it('approves a paid-later addendum and invites the specialist', function () {
    $owner = adOwner('spec');
    $pro = adArchitect('spec');
    $specialist = User::create([
        'name' => 'Structural Pro', 'username' => 'sp' . uniqid(),
        'email' => 'sp' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'structural',
    ]);
    StructuralEngineer::create(['user_id' => $specialist->id, 'nama' => 'Struct Co']);
    $project = adProject($owner, 'spec');
    $addendum = ProjectAddendum::create([
        'project_id' => $project->id, 'type' => 'specialist_assignment',
        'role_type' => 'arsitek', 'user_id' => $pro->id,
        'title' => 'Struct Hire', 'amount' => 1000000,
        'status' => 'pending_approval',
        'specialist_type' => 'structural', 'assigned_user_id' => $specialist->id,
    ]);

    $response = $this->actingAs($owner)
        ->postJson(adUri($project, $addendum->id, 'approve'))
        ->assertStatus(200);

    expect($response->json('data.status'))->toBe('approved_unpaid');
    // The specialist branch dereferences the author, so the user block
    // ships with the answer.
    expect($response->json('data.user.id'))->toBe($pro->id);

    $sub = ProjectSubProfessional::where('project_id', $project->id)->where('sub_role', 'structural')->sole();
    expect($sub->status)->toBe('invited');
    expect($sub->assigned_by)->toBe($pro->id);
    expect($sub->user_id)->toBe($specialist->id);

    expect(Notification::where('user_id', $specialist->id)->where('type', 'sub_professional_invite')->count())->toBe(1);
    expect(Notification::where('user_id', $pro->id)->where('type', 'addendum_approved')->count())->toBe(1);
});

it('approves a zero-amount addendum as approved and touches the project', function () {
    $owner = adOwner('zero');
    $pro = adArchitect('zero');
    $project = adProject($owner, 'zero');
    $addendum = ProjectAddendum::create([
        'project_id' => $project->id, 'type' => 'extra_fee', 'role_type' => 'arsitek',
        'user_id' => $pro->id, 'title' => 'Freebie', 'amount' => 0,
        'status' => 'pending_approval',
    ]);

    $before = $project->fresh()->updated_at;

    $response = $this->actingAs($owner)
        ->postJson(adUri($project, $addendum->id, 'approve'))
        ->assertStatus(200);

    expect($response->json('data.status'))->toBe('approved');
    expect($project->fresh()->updated_at)->not->toBeNull();
    expect($project->fresh()->updated_at >= $before)->toBeTrue();
});

it('authorises a linked procurement request on approval', function () {
    $owner = adOwner('proc');
    $pro = adArchitect('proc');
    $project = adProject($owner, 'proc');
    $requirement = \App\Models\ProjectRequirement::create([
        'project_id' => $project->id,
        'name' => 'Cement', 'quantity_required' => 10, 'unit' => 'sak',
        'estimated_unit_cost' => 50_000, 'quantity_on_site' => 0,
    ]);
    $request = ProjectProcurementRequest::create([
        'project_id' => $project->id,
        'requirement_id' => $requirement->id,
        'requested_by' => $owner->id,
        'quantity_needed' => 5,
        'status' => 'pending_owner',
    ]);
    $addendum = ProjectAddendum::create([
        'project_id' => $project->id, 'type' => 'pm_material', 'role_type' => 'project_manager',
        'user_id' => $pro->id, 'title' => 'Material', 'amount' => 500000,
        'status' => 'pending_approval',
        'procurement_request_id' => $request->id,
    ]);

    $this->actingAs($owner)
        ->postJson(adUri($project, $addendum->id, 'approve'))
        ->assertStatus(200);

    expect($request->fresh()->status)->toBe('authorized');
});

it('rejects with the rejected notification and activity line', function () {
    $owner = adOwner('rej');
    $pro = adArchitect('rej');
    $project = adProject($owner, 'rej');
    $addendum = ProjectAddendum::create([
        'project_id' => $project->id, 'type' => 'extra_fee', 'role_type' => 'arsitek',
        'user_id' => $pro->id, 'title' => 'Extra', 'amount' => 100000,
        'status' => 'pending_approval',
    ]);

    $this->actingAs($owner)
        ->postJson(adUri($project, $addendum->id, 'reject'))
        ->assertStatus(200);

    expect($addendum->fresh()->status)->toBe('rejected');

    $notice = Notification::where('user_id', $pro->id)->where('type', 'addendum_rejected')->sole();
    expect($notice->body)->toBe('Your addendum "Extra" was rejected.');
});
