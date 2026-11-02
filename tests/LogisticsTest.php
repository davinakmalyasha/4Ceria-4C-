<?php

use App\Models\MaterialQuote;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Logistics / courier jobs
|--------------------------------------------------------------------------
|
| Five routes over `delivery_jobs`, all gated on `role_type === 'logistics'`
| (403 "Unauthorized"). The reads go through the QUERY BUILDER, so rows are
| RAW: timestamps are `Y-m-d H:i:s`, decimals are strings, JSON photo columns
| are text. `logistics_id` stores the COURIER'S USER id.
|
| - available-jobs joins pending jobs to their quote;
| - accept is an atomic claim: the second courier gets 404, and the quote only
|   moves forward from an earlier stage;
| - dashboard-stats answers four counters plus the five most recent jobs;
| - my-jobs joins the quote and supplier for drop-off/pick-up facts;
| - status is forward-only and photos land on the PUBLIC disk.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
    Storage::fake('public');
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * @return array{0: User, 1: User, 2: Supplier, 3: MaterialQuote}
 */
function logiScenario(string $tag): array
{
    $courier = User::create([
        'name' => "C $tag", 'username' => "c_$tag" . uniqid(),
        'email' => "c_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'logistics',
    ]);
    $buyer = User::create([
        'name' => "B $tag", 'username' => "b_$tag" . uniqid(),
        'email' => "b_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $supplierUser = User::create([
        'name' => "S $tag", 'username' => "s_$tag" . uniqid(),
        'email' => "s_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $supplier = Supplier::create([
        'user_id' => $supplierUser->id, 'store_name' => "Store $tag",
        'address' => 'Jl. Supplier', 'detail_location' => 'Blok A',
        'latitude' => -6.2, 'longitude' => 106.8,
    ]);

    $quote = MaterialQuote::create([
        'user_id' => $buyer->id, 'supplier_id' => $supplier->id,
        'items' => [['material_id' => 272, 'name' => 'Sofa', 'price_at_quote' => '100', 'qty' => 1, 'unit' => 'pcs']],
        'delivery_address' => 'Jl. Buyer 1', 'address_detail' => 'Unit B',
        'total_amount' => 1_000_000, 'shipping_cost' => 50_000,
        'status' => 'awaiting_payment', 'delivery_method' => 'Hire Platform Courier',
        'latitude' => -6.21, 'longitude' => 106.81, 'total_weight' => 10,
    ]);

    return [$courier, $buyer, $supplier, $quote];
}

function logiJob(MaterialQuote $quote, array $overrides = []): int
{
    return DB::table('delivery_jobs')->insertGetId(array_merge([
        'quote_id' => $quote->id,
        'pickup_address' => 'Store — Jl. Supplier (Blok A)',
        'dropoff_address' => 'Jl. Buyer 1',
        'status' => 'pending',
        'agreed_fee' => 50_000,
        'estimated_weight' => '10',
        'created_at' => now()->subHour(),
        'updated_at' => now()->subHour(),
    ], $overrides));
}

it('refuses every route to a non-logistics account', function () {
    [$courier, $buyer, $supplier, $quote] = logiScenario('gate');
    $job = logiJob($quote);

    foreach ([
        ['get', '/api/logistics/available-jobs'],
        ['get', '/api/logistics/dashboard-stats'],
        ['get', '/api/logistics/my-jobs'],
    ] as [$method, $uri]) {
        $this->actingAs($buyer)->{$method . 'Json'}($uri)
            ->assertStatus(403)
            ->assertJsonPath('message', 'Unauthorized');
    }

    $this->actingAs($buyer)->postJson("/api/logistics/jobs/{$job}/accept")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');

    $this->actingAs($buyer)->postJson("/api/logistics/jobs/{$job}/status", ['status' => 'accepted'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');
});

it('lists available jobs joined to their quote', function () {
    [$courier, , , $quote] = logiScenario('avail');
    $job = logiJob($quote);
    // An accepted job is not available.
    $other = logiJob($quote, ['status' => 'accepted', 'logistics_id' => $courier->id]);

    $response = $this->actingAs($courier)
        ->getJson('/api/logistics/available-jobs')
        ->assertStatus(200);

    expect($response->json('data'))->toHaveCount(1);
    $row = $response->json('data.0');
    expect(array_keys($row))->toBe([
        'id', 'quote_id', 'order_id', 'logistics_id', 'pickup_address',
        'dropoff_address', 'status', 'agreed_fee', 'estimated_weight',
        'created_at', 'updated_at', 'pickup_photos', 'delivery_photos',
        'delivery_address', 'total_amount', 'total_weight', 'note',
    ]);
    expect($row['id'])->toBe($job);
    expect($row['status'])->toBe('pending');
    // Query-builder decimals and timestamps are raw strings.
    expect($row['agreed_fee'])->toBe('50000.00');
    expect($row['total_amount'])->toBe('1000000.00');
    expect($row['created_at'])->toMatch('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/');
    expect($row['delivery_address'])->toBe('Jl. Buyer 1');
});

it('accepts a job atomically and moves the quote forward once', function () {
    [$courier, $buyer, , $quote] = logiScenario('accept');
    $job = logiJob($quote);
    $quote->update(['status' => 'pending']);

    $this->actingAs($courier)
        ->postJson("/api/logistics/jobs/{$job}/accept")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Job accepted successfully.');

    $row = DB::table('delivery_jobs')->where('id', $job)->first();
    expect($row->status)->toBe('accepted');
    // The USER id, not a courier profile id.
    expect((int) $row->logistics_id)->toBe($courier->id);
    expect($quote->fresh()->status)->toBe('awaiting_payment');

    // A second claim loses the race.
    $this->actingAs($courier)
        ->postJson("/api/logistics/jobs/{$job}/accept")
        ->assertStatus(404)
        ->assertJsonPath('message', 'Job no longer available or not found.');

    // A quote already past the earlier stages is not dragged backwards.
    $accepted = logiJob($quote, ['status' => 'pending']);
    $quote->update(['status' => 'approved']);
    $this->actingAs($courier)
        ->postJson("/api/logistics/jobs/{$accepted}/accept")
        ->assertStatus(200);
    expect($quote->fresh()->status)->toBe('approved');
});

it('answers dashboard stats and recent jobs', function () {
    [$courier, , , $quote] = logiScenario('stats');
    logiJob($quote);
    logiJob($quote, ['status' => 'accepted', 'logistics_id' => $courier->id]);
    logiJob($quote, ['status' => 'delivered', 'logistics_id' => $courier->id, 'agreed_fee' => 75_000]);

    $response = $this->actingAs($courier)
        ->getJson('/api/logistics/dashboard-stats')
        ->assertStatus(200);

    expect(array_keys($response->json()))->toBe(['success', 'stats', 'recentJobs']);
    expect($response->json('stats.available'))->toBe(1);
    expect($response->json('stats.accepted'))->toBe(1);
    expect($response->json('stats.completed'))->toBe(1);
    expect((float) $response->json('stats.totalEarnings'))->toBe(75000.0);
    expect($response->json('recentJobs'))->toHaveCount(3);
});

it('lists my jobs with the quote and supplier coordinates', function () {
    [$courier, , $supplier, $quote] = logiScenario('mine');
    $mine = logiJob($quote, ['status' => 'accepted', 'logistics_id' => $courier->id]);
    logiJob($quote);

    $response = $this->actingAs($courier)
        ->getJson('/api/logistics/my-jobs')
        ->assertStatus(200);

    expect($response->json('data'))->toHaveCount(1);
    $row = $response->json('data.0');
    expect($row['id'])->toBe($mine);
    expect(array_slice(array_keys($row), -7))->toBe([
        'delivery_address', 'dropoff_lat', 'dropoff_lng', 'dropoff_detail',
        'pickup_lat', 'pickup_lng', 'pickup_detail',
    ]);
    expect($row['dropoff_lat'])->toBe('-6.2100000');
    expect($row['pickup_lat'])->toBe('-6.2000000');
    expect($row['pickup_detail'])->toBe('Blok A');
});

it('walks the forward-only status machine and stores photos', function () {
    [$courier, , , $quote] = logiScenario('flow');
    $job = logiJob($quote, ['logistics_id' => $courier->id]);

    // pending -> delivered is refused.
    $this->actingAs($courier)
        ->postJson("/api/logistics/jobs/{$job}/status", ['status' => 'delivered'])
        ->assertStatus(422)
        ->assertJsonPath('message', "Invalid status transition from 'pending' to 'delivered'.");

    $first = $this->actingAs($courier)
        ->postJson("/api/logistics/jobs/{$job}/status", ['status' => 'accepted'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Job status updated to accepted');
    expect($first->json('photos'))->toBe([]);

    $first = $this->actingAs($courier)
        ->post("/api/logistics/jobs/{$job}/status", [
            'status' => 'picked_up',
            'photos' => [UploadedFile::fake()->image('pickup.jpg')],
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Job status updated to picked_up');

    expect($first->json('photos'))->toHaveCount(1);
    expect($first->json('photos.0'))->toStartWith('deliveries/pickup/');

    $row = DB::table('delivery_jobs')->where('id', $job)->first();
    expect($row->status)->toBe('picked_up');
    expect(json_decode($row->pickup_photos))->toHaveCount(1);

    $second = $this->actingAs($courier)
        ->postJson("/api/logistics/jobs/{$job}/status", ['status' => 'delivered'])
        ->assertStatus(200);
    expect($second->json('photos'))->toBe([]);

    // A job assigned to someone else is 404.
    $this->actingAs($courier)
        ->postJson('/api/logistics/jobs/999999999/status', ['status' => 'accepted'])
        ->assertStatus(404)
        ->assertJsonPath('message', 'Job not found or not assigned to you.');

    // Validation: too many photos.
    $this->actingAs($courier)
        ->post("/api/logistics/jobs/{$job}/status", [
            'status' => 'delivered',
            'photos' => [
                UploadedFile::fake()->image('1.jpg'),
                UploadedFile::fake()->image('2.jpg'),
                UploadedFile::fake()->image('3.jpg'),
                UploadedFile::fake()->image('4.jpg'),
            ],
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.photos', ['The photos field must not have more than 3 items.']);
});
