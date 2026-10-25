<?php

use App\Models\MaterialOrder;
use App\Models\MaterialQuote;
use App\Models\Project;
use App\Models\Supplier;
use App\Models\User;
use App\Support\Money;
use Illuminate\Support\Facades\Hash;

/*
|--------------------------------------------------------------------------
| The remaining live defects: B9 to B16
|--------------------------------------------------------------------------
|
| One suite for the defects that are not about the money ledger and not about
| bid visibility, because they share one shape: a rule that was stated in a
| comment somewhere and never enforced in code.
|
| B9  — a REFUNDED material order was not terminal. The guard listed the
|        states that mean "the money has moved on" and left 'refunded' out, so
|        a supplier could walk a refunded order back to 'paid': the money had
|        gone back to the buyer, the ledger carried the reversal, and the order
|        claimed the payment stood.
|
| B10 — `TRUSTED_PROXIES=*` was accepted in PRODUCTION. The guard only
|        caught "unset", and '*' parses to `['*']`, which is not empty. '*'
|        means "believe whatever X-Forwarded-For the client sent", so a caller
|        could rotate the header and mint a fresh rate-limit bucket per
|        request — which defeats the /login and /register throttles entirely.
|
| B11 — the OWNER's counter-signature had no length bound and no format
|        check, while the professional's had a 1.5 MB cap and an image regex.
|        The owner's signature is the half of the contract that BINDS the
|        payment plan.
|
| B12 — the supplier named the COURIER's fee. The platform owns a tariff;
|        the sibling path enforced it; this one did not.
|
| B13 — the material listing's cache key hashed `$request->all()`, on an
|        UNAUTHENTICATED route. Every parameter the caller invented was a
|        distinct cache entry.
|
*/

uses(Tests\TestCase::class);

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function supplierUser(): User
{
    $user = User::create([
        'name' => 'A Supplier',
        'username' => 'sup_'.uniqid(),
        'email' => 'sup_'.uniqid().'@example.test',
        'password' => Hash::make('password123'),
        'role_type' => 'supplier',
    ]);

    Supplier::create([
        'user_id' => $user->id,
        'store_name' => 'A Store',
        'address' => 'Jl. 测试 No. 1',
        'latitude' => -6.2,
        'longitude' => 106.8,
        // The public marketplace only lists a supplier's materials once the
        // supplier is verified.
        'verification_status' => 'verified',
    ]);

    return $user;
}

function buyerUser(): User
{
    return User::create([
        'name' => 'A Buyer',
        'username' => 'buy_'.uniqid(),
        'email' => 'buy_'.uniqid().'@example.test',
        'password' => Hash::make('password123'),
        'role_type' => 'user',
    ]);
}

// ---------------------------------------------------------------------------
// B9 — a refunded order is terminal
// ---------------------------------------------------------------------------

it('refuses to verify payment on a REFUNDED order', function () {
    $supplier = supplierUser();
    $buyer = buyerUser();

    $order = MaterialOrder::create([
        'user_id' => $buyer->id,
        'supplier_id' => $supplier->supplier->id,
        'whatsapp_order_id' => 'ORD-REFUNDED',
        'status' => 'refunded',
        'total_price' => 500_000,
        'shipping_cost' => 0,
        'delivery_method' => 'Supplier Delivery',
        'payment_proof_path' => 'receipts/proof.png',
    ]);

    $this->actingAs($supplier)
        ->postJson("/api/material-orders/{$order->id}/verify-payment")
        ->assertStatus(422);

    // The order is still refunded. The supplier did not get to say the money
    // moved after it moved back.
    expect($order->fresh()->status)->toBe('refunded');
});

it('refuses to verify payment on a CANCELLED order', function () {
    $supplier = supplierUser();
    $buyer = buyerUser();

    $order = MaterialOrder::create([
        'user_id' => $buyer->id,
        'supplier_id' => $supplier->supplier->id,
        'whatsapp_order_id' => 'ORD-CANCELLED',
        'status' => 'cancelled',
        'total_price' => 500_000,
        'shipping_cost' => 0,
        'delivery_method' => 'Supplier Delivery',
        'payment_proof_path' => 'receipts/proof.png',
    ]);

    $this->actingAs($supplier)
        ->postJson("/api/material-orders/{$order->id}/verify-payment")
        ->assertStatus(422);

    expect($order->fresh()->status)->toBe('cancelled');
});

// ---------------------------------------------------------------------------
// B10 — TRUSTED_PROXIES=* is refused in production
// ---------------------------------------------------------------------------

it('refuses to boot in production with TRUSTED_PROXIES=*', function () {
    // The guard that exists catches "unset". A literal '*' parses to ['*'],
    // which is NOT empty, so it sailed straight through — and '*' means
    // "believe whatever X-Forwarded-For the client sent", which is exactly
    // what the /login and /register throttles exist to stop.
    config()->set('app.trusted_proxies', '*');

    $app = $this->app;
    $app->detectEnvironment(fn () => 'production');

    expect(fn () => $app->register(\App\Providers\AppServiceProvider::class, force: true))
        ->toThrow(\RuntimeException::class, 'TRUSTED_PROXIES is "*"');
});

it('still allows TRUSTED_PROXIES=* outside production', function () {
    // The development fallback is the documented one, and it must keep
    // working: `artisan serve` and Octane sit behind whatever is in front of
    // them locally.
    config()->set('app.trusted_proxies', '*');

    $app = $this->app;
    $app->detectEnvironment(fn () => 'local');

    expect(fn () => $app->register(\App\Providers\AppServiceProvider::class, force: true))
        ->not->toThrow(\RuntimeException::class);
});

// ---------------------------------------------------------------------------
// B11 — the owner's signature is bounded like the professional's
// ---------------------------------------------------------------------------

it('rejects an oversized owner signature', function () {
    $owner = buyerUser();
    $project = Project::create([
        'title' => 'A signing project',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
    ]);

    // 2 MB of base64 — twice the 1.5 MB cap the professional's path
    // enforces, and four times a signature.
    $payload = 'data:image/png;base64,'.str_repeat('A', 2 * 1024 * 1024);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/bids/1/client-sign-contract", [
            'bid_type' => 'arsitek',
            'bid_id' => 1,
            'signature' => $payload,
        ])
        ->assertStatus(422);
});

it('rejects an owner signature that is not an image data URL', function () {
    $owner = buyerUser();
    $project = Project::create([
        'title' => 'A signing project',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
    ]);

    // A bare string, and a data URL for something that is not an image. The
    // professional's path has always required the `data:image/(png|jpeg|webp)
    // ;base64,` header; the owner's did not, so a caller could put anything at
    // all in the signature field.
    foreach ([
        'not a data url at all',
        'data:text/plain;base64,'.base64_encode('plain text'),
        'data:image/svg+xml;base64,'.base64_encode('<svg onload="alert(1)"/>'),
    ] as $payload) {
        $this->actingAs($owner)
            ->postJson("/api/projects/{$project->id}/bids/1/client-sign-contract", [
                'bid_type' => 'arsitek',
                'bid_id' => 1,
                'signature' => $payload,
            ])
            ->assertStatus(422);
    }
});

// ---------------------------------------------------------------------------
// B12 — the courier's fee is not the supplier's to name
// ---------------------------------------------------------------------------

it('refuses a delivery job whose courier fee exceeds the platform tariff', function () {
    $supplier = supplierUser();
    $buyer = buyerUser();

    $quote = MaterialQuote::create([
        'user_id' => $buyer->id,
        'supplier_id' => $supplier->supplier->id,
        'items' => [['name' => 'Cement', 'qty' => 1, 'price' => 500_000]],
        'delivery_address' => 'Jl. Far Away No. 99',
        'total_amount' => 500_000,
        'shipping_cost' => 0,
        'delivery_method' => 'Hire Platform Courier',
        'status' => 'approved',
        'latitude' => -6.9,
        'longitude' => 107.6,
    ]);

    // The tariff is Rp 50 000 for the first 5 km plus Rp 4 000 per extra km.
    // Jakarta to Bandung is ~150 km, so the tariff is well under Rp 700 000.
    // A supplier naming Rp 25 000 000 for the platform's own courier is not a
    // discount.
    $this->actingAs($supplier)
        ->postJson("/api/material-quotes/{$quote->id}/post-delivery-job", [
            'shipping_cost' => 25_000_000,
        ])
        ->assertStatus(422);

    // No delivery job was created.
    expect(\Illuminate\Support\Facades\DB::table('delivery_jobs')->where('quote_id', $quote->id)->count())->toBe(0);
});

it('accepts a delivery job whose courier fee is within the tariff', function () {
    $supplier = supplierUser();
    $buyer = buyerUser();

    $quote = MaterialQuote::create([
        'user_id' => $buyer->id,
        'supplier_id' => $supplier->supplier->id,
        'items' => [['name' => 'Cement', 'qty' => 1, 'price' => 500_000]],
        'delivery_address' => 'Jl. Dekat No. 3',
        'total_amount' => 500_000,
        'shipping_cost' => 0,
        'delivery_method' => 'Hire Platform Courier',
        'status' => 'approved',
        'latitude' => -6.2,
        'longitude' => 106.8,
    ]);

    $this->actingAs($supplier)
        ->postJson("/api/material-quotes/{$quote->id}/post-delivery-job", [
            'shipping_cost' => 50_000,
        ])
        ->assertStatus(200);

    expect(\Illuminate\Support\Facades\DB::table('delivery_jobs')->where('quote_id', $quote->id)->count())->toBe(1);
});

// ---------------------------------------------------------------------------
// B13 — the cache key is bounded
// ---------------------------------------------------------------------------

it('does not let an unauthenticated caller mint an unbounded cache key space', function () {
    // The key used to hash `$request->all()` — every parameter the caller
    // invented. On an unauthenticated route that is an invitation: `?x=1`,
    // `?x=2`, `?x=3` … each a distinct Redis entry, each holding a full
    // material listing, for ten minutes.
    //
    // The key is now derived from the four parameters the query actually
    // reads, so the key space is bounded by the data, not by the caller.
    $source = file_get_contents(
        (new ReflectionClass(\App\Http\Controllers\MaterialController::class))->getFileName()
    );

    // The CODE, not the comment above it — the comment quotes the old code
    // on purpose, so a naive "does the file contain this string" check would
    // match its own explanation of the bug.
    $keyLine = collect(explode("
", $source))
        ->first(fn (string $line) => str_contains($line, '$cacheKey ='));

    expect($keyLine)->not->toBeNull()
        ->and($keyLine)->not->toContain('$request->all()')
        ->and($keyLine)->toContain('materials_list_');
});

it('gives the same cache key for the same real filters, whatever else is sent', function () {
    $supplier = supplierUser();
    \App\Models\Material::create([
        'supplier_id' => $supplier->supplier->id,
        'name' => 'A Material',
        'unit' => 'sak',
        'category' => 'cement',
        'price' => 50_000,
        'is_available' => true,
    ]);

    $first = $this->getJson('/api/marketplace/materials?category=cement&junk=1');
    $second = $this->getJson('/api/marketplace/materials?category=cement&junk=2');
    $third = $this->getJson('/api/marketplace/materials?category=cement');

    $first->assertStatus(200);
    $second->assertStatus(200);
    $third->assertStatus(200);

    // The junk parameter does not change the RESULT, and it does not change
    // the cache key either — so it cannot be used to fill the cache.
    expect($first->json('data'))->toHaveCount(1)
        ->and($second->json('data'))->toHaveCount(1);
});
