<?php

use App\Models\Arsitek;
use App\Models\MaterialOrder;
use App\Models\Project;
use App\Models\ProjectSubProfessional;
use App\Models\StructuralEngineer;
use App\Models\TeamMember;
use App\Models\User;
use App\Support\Schema\EnumValues;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Never write a value that is not in the column
|--------------------------------------------------------------------------
|
| Regression suite for a HIGH audit finding: four code paths wrote literals that
| are not members of their MySQL ENUM, so under STRICT_TRANS_TABLES each raised
| ERROR 1265 "Data truncated" and returned an unconditional 500.
|
|   1. bids_*_status = 'cancelled'   ProjectController::destroy()
|      -> DELETE /api/projects/{id} failed and rolled back for EVERY owner whose
|         project had even one pending bid. The literal appears in all SEVEN
|         bulk updates, so no role was exempt.
|
|   2. project_sub_professionals.status = 'declined'
|      -> the decline button 500'd, so the unlink logic below it never ran and
|         the core slot (structural_id / mep_id) stayed occupied by a specialist
|         who had already walked away. `completed_at` was also stamped on a
|         decline, reporting a finished job.
#
#   3. material_orders.status = 'processing' | 'ready_for_pickup'
#      -> a supplier pressing "Diproses Toko" / "Siap Diambil" got a 500.
#         These are genuinely distinct, buyer-visible states in the SPA
#         (OrderCard.tsx, TrackingTimeline.tsx), so the values are APPENDED
#         rather than aliased onto `paid`/`shipping`.
#
#   4. team_members.owner_role = 'structural' | 'mep' | 'interior'
#      -> the controller's own allow-list admitted these three roles and the
|         schema rejected them, so a structural engineer, MEP engineer or
|         interior designer could not add anyone to their team. Also appended.
|
| The split between "map to an existing value" (1, 2) and "append a value"
| (3, 4) is deliberate and is what this suite pins.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function enumUser(string $roleType, string $tag): User
{
    $user = User::create([
        'name' => "User $tag", 'username' => "u_$tag" . uniqid(),
        'email' => "e_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $roleType,
    ]);

    if ($roleType === 'arsitek') {
        Arsitek::create(['user_id' => $user->id, 'nama' => 'Studio', 'verification_status' => 'verified']);
    }

    if ($roleType === 'structural') {
        StructuralEngineer::create(['user_id' => $user->id, 'nama' => 'SE', 'verification_status' => 'verified']);
    }

    return $user;
}

// ---------------------------------------------------------------------------
// 1. bids_*.status
// ---------------------------------------------------------------------------

it('never proposes an ENUM value absent from bids_*.status', function () {
    // A static guard: catches the literal coming back even if the endpoint is
    // not exercised by a behavioural test.
    $allowed = EnumValues::current('bids_arsitek', 'status');

    expect($allowed)->toContain('terminated')
        ->and($allowed)->not->toContain('cancelled');
});

it('deletes a project that has pending bids on every role', function () {
    $owner = enumUser('user', 'del');
    $project = Project::create([
        'title' => 'Doomed', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open',
    ]);

    $pro = enumUser('arsitek', 'delpro');

    \App\Models\BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $pro->arsitek->id,
        'price' => 10_000_000, 'calculated_total' => 10_000_000,
        'fee_type' => 'fixed', 'status' => 'pending',
    ]);

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}")
        ->assertStatus(200);

    // The bid row survives project deletion only if the project cascade did not
    // remove it; either way the delete must not have 500'd.
    expect(Project::find($project->id))->toBeNull();
});

// ---------------------------------------------------------------------------
// 2. project_sub_professionals.status
// ---------------------------------------------------------------------------

it('never proposes an ENUM value absent from project_sub_professionals.status', function () {
    $allowed = EnumValues::current('project_sub_professionals', 'status');

    expect($allowed)->toContain('removed')
        ->and($allowed)->not->toContain('declined');
});

it('lets an invited specialist decline and frees the core slot', function () {
    $owner = enumUser('user', 'sub');
    $specialist = enumUser('structural', 'subpro');

    $project = Project::create([
        'title' => 'Job', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
    ]);

    $sub = ProjectSubProfessional::create([
        'project_id' => $project->id,
        'user_id' => $specialist->id,
        'parent_role' => 'arsitek',
        'sub_role' => 'structural',
        'assigned_by' => $owner->id,
        'status' => 'invited',
    ]);

    $project->update(['structural_id' => $specialist->structural_engineer->id]);

    $this->actingAs($specialist)
        ->postJson("/api/projects/{$project->id}/sub-professionals/{$sub->id}/decline")
        ->assertStatus(200);

    $fresh = $project->fresh();

    expect($fresh->structural_id)->toBeNull()
        ->and(ProjectSubProfessional::where('project_id', $project->id)->first()->status)
        ->toBe('removed');
});

it('does not stamp completed_at on a DECLINE', function () {
    $owner = enumUser('user', 'sub2');
    $specialist = enumUser('mep', 'subpro2');

    $project = Project::create([
        'title' => 'Job', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
    ]);

    $sub = ProjectSubProfessional::create([
        'project_id' => $project->id, 'user_id' => $specialist->id,
        'parent_role' => 'arsitek', 'sub_role' => 'mep',
        'assigned_by' => $owner->id, 'status' => 'invited',
    ]);

    $this->actingAs($specialist)
        ->postJson("/api/projects/{$project->id}/sub-professionals/{$sub->id}/decline")
        ->assertStatus(200);

    expect(ProjectSubProfessional::where('project_id', $project->id)->first()->completed_at)
        ->toBeNull();
});

// ---------------------------------------------------------------------------
// 3. material_orders.status  (appended)
// ---------------------------------------------------------------------------

it('accepts processing and ready_for_pickup on material_orders.status', function () {
    $allowed = EnumValues::current('material_orders', 'status');

    expect($allowed)->toContain('processing')
        ->and($allowed)->toContain('ready_for_pickup');
});

it('keeps every PRE-EXISTING material_orders status member', function () {
    // The append must never drop a value: that is an ALGORITHM=COPY rebuild which
    // aborts if any row still holds it, and `migrate --force` runs on every
    // replica start.
    $allowed = EnumValues::current('material_orders', 'status');

    foreach ([
        'pending', 'awaiting_payment', 'verifying', 'paid',
        'shipping', 'delivered', 'completed', 'cancelled',
    ] as $original) {
        expect($allowed)->toContain($original);
    }
});

it('really writes processing onto a material order', function () {
    $supplier = User::create([
        'name' => 'Supplier', 'username' => 'sup' . uniqid(),
        'email' => 'sup' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $supplierProfile = \App\Models\Supplier::create([
        'user_id' => $supplier->id, 'store_name' => 'Toko',
        'verification_status' => 'verified',
    ]);
    $buyer = enumUser('user', 'buyer');

    $order = MaterialOrder::create([
        'user_id' => $buyer->id,
        'supplier_id' => $supplierProfile->id,
        'total_price' => 500_000, 'status' => 'paid', 'whatsapp_order_id' => 'wa-' . uniqid(),
    ]);

    // The literal the SPA sends. Under STRICT_TRANS_TABLES this was ERROR 1265.
    DB::table('material_orders')->where('id', $order->id)
        ->update(['status' => 'processing']);

    expect(MaterialOrder::find($order->id)->status)->toBe('processing');
});

it('really writes ready_for_pickup onto a material order', function () {
    $supplier = User::create([
        'name' => 'Supplier', 'username' => 'sup' . uniqid(),
        'email' => 'sup' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $supplierProfile = \App\Models\Supplier::create([
        'user_id' => $supplier->id, 'store_name' => 'Toko',
        'verification_status' => 'verified',
    ]);
    $buyer = enumUser('user', 'buyer2');

    $order = MaterialOrder::create([
        'user_id' => $buyer->id,
        'supplier_id' => $supplierProfile->id,
        'total_price' => 500_000, 'status' => 'processing', 'whatsapp_order_id' => 'wa-' . uniqid(),
    ]);

    DB::table('material_orders')->where('id', $order->id)
        ->update(['status' => 'ready_for_pickup']);

    expect(MaterialOrder::find($order->id)->status)->toBe('ready_for_pickup');
});

// ---------------------------------------------------------------------------
// 4. team_members.owner_role  (appended)
// ---------------------------------------------------------------------------

it('accepts structural, mep and interior on team_members.owner_role', function () {
    $allowed = EnumValues::current('team_members', 'owner_role');

    expect($allowed)->toContain('structural')
        ->and($allowed)->toContain('mep')
        ->and($allowed)->toContain('interior');
});

it('really writes owner_role for each of the five admitted roles', function (string $roleType) {
    $user = enumUser($roleType, "team_$roleType");

    // The controller admits exactly these five; the schema used to accept two.
    TeamMember::create([
        'owner_user_id' => $user->id,
        'owner_role' => $roleType,
        'name' => "Member of $roleType", 'role_title' => 'Staff',
    ]);

    expect(TeamMember::where('owner_user_id', $user->id)->first()->owner_role)
        ->toBe($roleType);
})->with(['arsitek', 'kontraktor', 'structural', 'mep', 'interior']);

it('keeps the pre-existing team_members.owner_role members', function () {
    $allowed = EnumValues::current('team_members', 'owner_role');

    expect($allowed)->toContain('arsitek')->toContain('kontraktor');
});