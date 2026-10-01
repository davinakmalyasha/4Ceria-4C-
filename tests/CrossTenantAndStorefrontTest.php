<?php

use App\Models\Kontraktor;
use App\Models\Material;
use App\Models\MaterialOrder;
use App\Models\MaterialOrderReview;
use App\Models\Project;
use App\Models\ProjectRequirement;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Cross-tenant writes, a storefront PII leak, and a chat relay
|--------------------------------------------------------------------------
|
| Regression suite for the remaining MEDIUM/LOW findings from audit round 2, all
| of which share one shape: an id from the request is looked up WITHOUT the
| project or tenant it is supposed to belong to.
|
| 1. SPECIALIST BID RESOLVED WITHOUT PROJECT SCOPE  (LOW, money)
#    `BidStructural::find($addendum->recommended_bid_id)` and its `BidMep`
#    equivalent, plus `ProjectEngineeringController`'s generic lookup, resolved by
#    primary key alone. The addendum is authorised against THIS project, so a
#    `recommended_bid_id` pointing at ANOTHER project's bid had its amount
#    debited from this project's escrow and set `structural_id` from the other
#    project's engineer.
|
| 2. CROSS-TENANT BOM WRITE  (MEDIUM, data integrity)
#    `items.*.requirement_id` is validated with a bare `exists:`, so marking an
#    order `delivered` incremented `quantity_on_site` on a requirement belonging
#    to a VICTIM project -- inflating their bill of materials and every stock
#    report derived from it. Reachable because a supplier's quote may carry no
#    `project_id` at all.
|
| 3. A PUBLIC ENDPOINT PUBLISHED EVERY BUYER'S ADDRESS  (MEDIUM)
#    `getBySupplier()` eager-loaded `order.items.material` and hid keys on ONE
#    relation (`$r->user?->makeHidden(...)`). `MaterialOrder` has no `$hidden` at
#    all, so each review carried the buyer's `delivery_address`, `address_detail`,
#    `latitude`, `longitude`, `total_price`, `whatsapp_order_id`,
#    `payment_proof_path`, `notes` and `verification_notes` -- from a PUBLIC
#    storefront endpoint, for every customer the supplier ever had.
#    Same denylist-on-the-wrong-object shape as the directory leak.
|
| 4. CHAT: OPEN RELAY  (MEDIUM, abuse)
#    `POST /conversations` accepted ANY `user_id`, so any authenticated account
#    could open and message an administrator -- notification spam and staff
#    harassment from a freshly registered account. It also had no throttle, while
#    `sendMessage` did.
|
| 5. A DEAD ENUM VALUE DISABLED SUB-CONTRACTOR PROCUREMENT  (LOW)
#    `ProjectSubProfessional` status was filtered on `'hired'`, which is not a
#    member of the enum, so `$isSubContractor` was permanently false and a
#    sub-contractor engaged under the lead could never request procurement.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function xtUser(string $roleType, string $tag): User
{
    $user = User::create([
        'name' => "$roleType $tag", 'username' => "u_$tag" . uniqid(),
        'email' => "e_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $roleType,
    ]);

    if ($roleType === 'kontraktor') {
        Kontraktor::create([
            'user_id' => $user->id, 'nama' => "Kontraktor $tag",
            'verification_status' => 'verified',
        ]);
    }

    return $user;
}

function xtProject(string $tag): array
{
    $owner = xtUser('user', "own_$tag");
    $project = Project::create([
        'title' => "Job $tag", 'user_id' => $owner->id,
        'budget' => 400_000_000, 'status' => 'in_progress',
    ]);

    return [$owner, $project];
}

function xtSupplier(string $tag): array
{
    $user = User::create([
        'name' => "Supplier $tag", 'username' => "sup_$tag" . uniqid(),
        'email' => "sup_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);

    $supplier = Supplier::create([
        'user_id' => $user->id, 'store_name' => "Toko $tag",
        'verification_status' => 'verified',
    ]);

    $supplier->materials()->create([
        'name' => 'Semen 40kg', 'price' => 50_000, 'unit' => 'sak',
        'category' => 'material', 'stock' => 100, 'is_available' => true,
    ]);

    return [$user, $supplier];
}

// ---------------------------------------------------------------------------
// 1. Specialist bid project scope
// ---------------------------------------------------------------------------

it('will not pay a specialist bid that belongs to another project', function () {
    [$ownerA, $projectA] = xtProject('bidA');
    [$ownerB, $projectB] = xtProject('bidB');

    $engineer = xtUser('kontraktor', 'se');
    $seProfile = \App\Models\StructuralEngineer::create([
        'user_id' => $engineer->id, 'nama' => 'SE Co', 'verification_status' => 'verified',
    ]);

    $bid = \App\Models\BidStructural::create([
        'project_id' => $projectB->id,
        'structural_id' => $seProfile->id,
        'price' => 30_000_000, 'calculated_total' => 30_000_000,
        'fee_type' => 'fixed', 'status' => 'pending', 'proposal' => 'Foreign bid',
    ]);

    // The addendum belongs to project A; the bid it points at belongs to B.
    $addendum = \App\Models\ProjectAddendum::create([
        'project_id' => $projectA->id,
        'role_type' => 'structural', 'user_id' => $engineer->id,
        'title' => 'Hire structural', 'amount' => 30_000_000,
        'status' => 'approved_unpaid',
        'recommended_bid_id' => $bid->id,
        'recommended_bid_type' => 'structural',
    ]);

    // `markPaid` is where the bid is resolved and the fee debited.
    $this->actingAs($ownerA)
->postJson("/api/projects/{$projectA->id}/budget/mark-paid", [
        'type' => 'addendum',
        'id' => $addendum->id,
    ]);

    // The addendum belongs to project A and was authorised there, so A IS debited
    // the addendum's own amount -- that part is correct and asserted below.
    //
    // What must NOT happen is the FOREIGN bid being resolved: it must not be
    // marked paid, and its engineer must not be written into project A. Before
    // the fix, `BidStructural::find($id)` returned that bid regardless of project,
    // so the amount debited was the FOREIGN bid's figure and `structural_id` was
    // set from the other project's engineer.
    expect($bid->fresh()->payment_status)->not->toBe('paid')
        ->and($projectA->fresh()->structural_id)->toBeNull();

    // The debit is the addendum's own amount, not the foreign bid's.
    $rows = $projectA->fresh()->budgetTransactions;
    expect($rows)->toHaveCount(1)
        ->and((float) $rows->first()->amount)->toBe(30000000.0);
});

it('still pays a specialist bid that belongs to THIS project', function () {
    [$owner, $project] = xtProject('bidown');

    $engineer = User::create([
        'name' => 'SE', 'username' => 'se' . uniqid(),
        'email' => 'se' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    $seProfile = \App\Models\StructuralEngineer::create([
        'user_id' => $engineer->id, 'nama' => 'SE Co',
        'verification_status' => 'verified',
    ]);

    $bid = \App\Models\BidStructural::create([
        'project_id' => $project->id, 'structural_id' => $seProfile->id,
        'price' => 20_000_000, 'calculated_total' => 20_000_000,
        'fee_type' => 'fixed', 'status' => 'pending', 'proposal' => 'Own bid',
    ]);

    $addendum = \App\Models\ProjectAddendum::create([
        'project_id' => $project->id, 'role_type' => 'structural',
        'user_id' => $engineer->id, 'title' => 'Hire structural',
        'amount' => 20_000_000, 'status' => 'approved_unpaid',
        'recommended_bid_id' => $bid->id, 'recommended_bid_type' => 'structural',
    ]);

    $this->actingAs($owner)
->postJson("/api/projects/{$project->id}/budget/mark-paid", [
        'type' => 'addendum',
        'id' => $addendum->id,
    ]);

    expect($project->fresh()->structural_id)->toBe($seProfile->id)
        ->and($bid->fresh()->payment_status)->toBe('paid');
});

// ---------------------------------------------------------------------------
// 2. Cross-tenant BOM write
// ---------------------------------------------------------------------------

it('does not inflate a VICTIM project\'s on-site stock from a supplier order', function () {
    [, $victimProject] = xtProject('victim');
    [, $attackerProject] = xtProject('attacker');
    [$supplierUser, $supplier] = xtSupplier('bom');

    $victimRequirement = ProjectRequirement::create([
        'project_id' => $victimProject->id,
        'name' => 'Victim cement', 'quantity_required' => 10, 'unit' => 'sak',
        'estimated_unit_cost' => 50_000, 'quantity_on_site' => 0,
    ]);

    $buyer = xtUser('user', 'bombuyer');

    // The order belongs to the ATTACKER's project but names the VICTIM's
    // requirement -- exactly what a bare `exists:` rule permits.
    $order = MaterialOrder::create([
        'user_id' => $buyer->id, 'supplier_id' => $supplier->id,
        'project_id' => $attackerProject->id,
        'total_price' => 500_000, 'status' => 'shipping',
        'whatsapp_order_id' => 'wa-' . uniqid(),
    ]);

    $order->items()->create([
        'material_id' => $supplier->materials()->first()->id,
        'quantity' => 999, 'price_at_order' => 500_000,
        'requirement_id' => $victimRequirement->id,
    ]);

    $this->actingAs($supplierUser)
        ->putJson("/api/material-orders/{$order->id}", ['status' => 'delivered'])
        ->assertStatus(200);

    expect((float) $victimRequirement->fresh()->quantity_on_site)->toBe(0.0);
});

it('still credits on-site stock for a requirement on the SAME project', function () {
    [, $project] = xtProject('stockown');
    [$supplierUser, $supplier] = xtSupplier('stock');

    $requirement = ProjectRequirement::create([
        'project_id' => $project->id,
        'name' => 'Own cement', 'quantity_required' => 10, 'unit' => 'sak',
        'estimated_unit_cost' => 50_000, 'quantity_on_site' => 0,
    ]);

    $buyer = xtUser('user', 'stockbuyer');

    $order = MaterialOrder::create([
        'user_id' => $buyer->id, 'supplier_id' => $supplier->id,
        'project_id' => $project->id,
        'total_price' => 500_000, 'status' => 'shipping',
        'whatsapp_order_id' => 'wa-' . uniqid(),
    ]);

    $order->items()->create([
        'material_id' => $supplier->materials()->first()->id,
        'quantity' => 7, 'price_at_order' => 500_000,
        'requirement_id' => $requirement->id,
    ]);

    $this->actingAs($supplierUser)
        ->putJson("/api/material-orders/{$order->id}", ['status' => 'delivered'])
        ->assertStatus(200);

    expect((float) $requirement->fresh()->quantity_on_site)->toBe(7.0);
});

// ---------------------------------------------------------------------------
// 3. Supplier storefront must not publish buyer addresses
// ---------------------------------------------------------------------------

it('does not publish the buyer\'s address or coordinates through supplier reviews', function () {
    [$supplierUser, $supplier] = xtSupplier('rev');
    [$owner, $project] = xtProject('rev');

    $buyer = User::create([
        'name' => 'Buyer PII', 'username' => 'buy' . uniqid(),
        'email' => 'buyer' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    $order = MaterialOrder::create([
        'user_id' => $buyer->id, 'supplier_id' => $supplier->id,
        'project_id' => $project->id,
        'total_price' => 750_000, 'status' => 'completed',
        'whatsapp_order_id' => 'wa-secret-order',
        'delivery_address' => 'Jl. Rahasia No. 99, Jakarta Selatan',
        'address_detail' => 'Gerija tua, pintu belakang',
        'latitude' => -6.2615, 'longitude' => 106.8106,
        'payment_proof_path' => 'receipts/buyer-bank-slip.png',
        'notes' => 'Buyer private note',
        'verification_notes' => 'Platform internal assessment of the buyer',
        'shipping_cost' => 50_000,
        'delivery_method' => 'Hire Platform Courier',
    ]);

    $order->items()->create([
        'material_id' => $supplier->materials()->first()->id,
        'quantity' => 3, 'price_at_order' => 250_000,
    ]);

    MaterialOrderReview::create([
        'order_id' => $order->id,
        'user_id' => $buyer->id,
        'supplier_id' => $supplier->id,
        'rating' => 5,
        'comment' => 'Fast delivery, good material.',
    ]);

    $body = $this->actingAs(xtUser('kontraktor', 'nosy'))
        ->getJson("/api/suppliers/{$supplier->id}/reviews")
        ->getContent();

    expect($body)->toContain('Fast delivery, good material.')
        ->and($body)->not->toContain('Rahasia')
        ->and($body)->not->toContain('Gerija tua')
        ->and($body)->not->toContain('buyer-bank-slip')
        ->and($body)->not->toContain('wa-secret-order')
        ->and($body)->not->toContain('Platform internal assessment')
        ->and($body)->not->toContain('delivery_address')
        ->and($body)->not->toContain('address_detail')
        ->and($body)->not->toContain('payment_proof_path')
        ->and($body)->not->toContain('verification_notes')
        ->and($body)->not->toContain('latitude');
});

it('still shows what a prospective buyer needs: the items and the price', function () {
    [$supplierUser, $supplier] = xtSupplier('revok');
    [, $project] = xtProject('revok');

    $buyer = User::create([
        'name' => 'Buyer OK', 'username' => 'buy' . uniqid(),
        'email' => 'buy' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    $order = MaterialOrder::create([
        'user_id' => $buyer->id, 'supplier_id' => $supplier->id,
        'project_id' => $project->id,
        'total_price' => 750_000, 'status' => 'completed',
        'whatsapp_order_id' => 'wa-ok',
    ]);

    $order->items()->create([
        'material_id' => $supplier->materials()->first()->id,
        'quantity' => 3, 'price_at_order' => 250_000,
    ]);

    MaterialOrderReview::create([
        'order_id' => $order->id, 'user_id' => $buyer->id,
        'supplier_id' => $supplier->id, 'rating' => 4,
        'comment' => 'Good value.',
    ]);

    $body = $this->actingAs(xtUser('kontraktor', 'nosy'))
        ->getJson("/api/suppliers/{$supplier->id}/reviews")
        ->getContent();

    expect($body)->toContain('Semen 40kg')
        ->and($body)->toContain('750000')
        ->and($body)->toContain('Buyer OK');
});

// ---------------------------------------------------------------------------
// 4. Chat relay
// ---------------------------------------------------------------------------

it('refuses to open a conversation with a staff account', function () {
    $user = xtUser('kontraktor', 'chatter');

    $admin = User::create([
        'name' => 'Platform Admin', 'username' => 'adm' . uniqid(),
        'email' => 'adm' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'admin',
    ]);

    $this->actingAs($user)
        ->postJson('/api/conversations', ['user_id' => $admin->id])
        ->assertStatus(403);
});

it('still allows a conversation between two ordinary accounts', function () {
    $a = xtUser('kontraktor', 'chatA');
    $b = xtUser('arsitek', 'chatB');

    // The shared-context requirement is deliberately NOT imposed here -- that is
    // a product decision recorded as remaining work. Ordinary peer messaging must
    // keep working.
    $this->actingAs($a)
        ->postJson('/api/conversations', ['user_id' => $b->id])
        ->assertStatus(200);
});

it('throttles conversation creation', function () {
    $routes = collect(\Illuminate\Support\Facades\Route::getRoutes())
        ->filter(fn ($r) => $r->uri() === 'api/conversations' && in_array('POST', $r->methods(), true));

    expect($routes)->toHaveCount(1);
    expect(implode('|', app('router')->gatherRouteMiddleware($routes->first())))
        ->toContain('ThrottleRequests:10,1');
});

// ---------------------------------------------------------------------------
// 5. Dead enum value
// ---------------------------------------------------------------------------

it('uses a REAL sub-professional status, so procurement is not permanently disabled', function () {
    // `status = 'hired'` is not a member of the enum, so `$isSubContractor` was
    // permanently false.
    $allowed = \App\Support\Schema\EnumValues::current('project_sub_professionals', 'status');

    expect($allowed)->not->toContain('hired')
        ->and($allowed)->toContain('active');
});

it('lets an ACTIVE sub-contractor request procurement', function () {
    [$owner, $project] = xtProject('subproc');

    $lead = xtUser('kontraktor', 'lead');
    $project->update(['selected_kontraktor_id' => $lead->kontraktor->id]);

    $sub = xtUser('kontraktor', 'sub');
    $subProfile = Kontraktor::where('user_id', $sub->id)->first();

    $requirement = ProjectRequirement::create([
        'project_id' => $project->id,
        'name' => 'Sub cement', 'quantity_required' => 5, 'unit' => 'sak',
        'estimated_unit_cost' => 50_000, 'quantity_on_site' => 0,
    ]);

    \App\Models\ProjectSubProfessional::create([
        'project_id' => $project->id, 'user_id' => $sub->id,
        'parent_role' => 'kontraktor', 'sub_role' => 'structural',
        'assigned_by' => $owner->id, 'status' => 'active',
    ]);

    $this->actingAs($sub)
        ->postJson("/api/projects/{$project->id}/requirements/{$requirement->id}/request-procurement", [
            'quantity_needed' => 5,
            'message' => 'Need this on site for the slab pour.',
        ])
        ->assertStatus(200);
});

it('still refuses an INVITED-ONLY sub-professional', function () {
    // `accepted` is deliberately not enough: being accepted is not being engaged.
    [$owner, $project] = xtProject('subinv');

    $lead = xtUser('kontraktor', 'leadinv');
    $project->update(['selected_kontraktor_id' => $lead->kontraktor->id]);

    $sub = xtUser('kontraktor', 'subinv');

    $requirement = ProjectRequirement::create([
        'project_id' => $project->id,
        'name' => 'Cement', 'quantity_required' => 5, 'unit' => 'sak',
        'estimated_unit_cost' => 50_000, 'quantity_on_site' => 0,
    ]);

    \App\Models\ProjectSubProfessional::create([
        'project_id' => $project->id, 'user_id' => $sub->id,
        'parent_role' => 'kontraktor', 'sub_role' => 'structural',
        'assigned_by' => $owner->id, 'status' => 'invited',
    ]);

    $this->actingAs($sub)
        ->postJson("/api/projects/{$project->id}/requirements/{$requirement->id}/request-procurement", [
            'quantity_needed' => 5,
            'message' => 'Too early for me.',
        ])
        ->assertStatus(403);
});
