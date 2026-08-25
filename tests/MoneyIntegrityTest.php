<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\NotarisConsultation;
use App\Models\NotarisProfile;
use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use App\Services\BidCalculationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Money-integrity regression tests
|--------------------------------------------------------------------------
| These lock in the critical fixes from the 2026-08 audit pass:
|   - markPaid idempotency (double-spend guard)
|   - signContract replay protection
|   - cross-project binding checks (IDOR)
|   - payment-proof verification authorization
|   - percentage-fee-without-budget hard-fail
|   - consultation booking (restored endpoint)
|
| SAFETY MODEL: phpunit.xml forces sqlite for the Feature suite, but these
| tests need real MySQL migrations. Each test runs inside an explicit
| transaction that is ALWAYS rolled back in afterEach — nothing persists.
| Only DML is allowed here; never add schema changes to this file.
*/

beforeEach(function () {
    // phpunit.xml pins DB_CONNECTION=sqlite + DB_DATABASE=:memory:; these tests
    // must run on real MySQL, so we recover the original .env values.
    $real = [];
    foreach (file(base_path('.env'), FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        [$k, $v] = array_pad(explode('=', $line, 2), 2, null);
        $real[trim($k)] = trim($v, " \t\"'");
    }

    config([
        'database.default' => 'mysql',
        'database.connections.mysql.database' => $real['DB_DATABASE'] ?? env('DB_DATABASE'),
        'database.connections.mysql.host' => $real['DB_HOST'] ?? '127.0.0.1',
        'database.connections.mysql.port' => $real['DB_PORT'] ?? '3306',
        'database.connections.mysql.username' => $real['DB_USERNAME'] ?? 'root',
        'database.connections.mysql.password' => $real['DB_PASSWORD'] ?? '',
    ]);

    DB::purge('mysql');

    // Hard safety net: refuse to run against anything that looks wrong.
    if (in_array(config('database.connections.mysql.database'), [':memory:', 'null', null], true)) {
        $this->fail('Refusing to run money tests without a real MySQL database configured.');
    }

    DB::beginTransaction();
});

afterEach(function () {
    // Discard EVERYTHING the test did — guaranteed even on assertion failure.
    while (DB::transactionLevel() > 0) {
        try {
            DB::rollBack();
        } catch (\Throwable $e) {
            break;
        }
    }
});

function moneyTestUser(string $suffix): User
{
    return User::create([
        'name' => "Test {$suffix}",
        'username' => 'test_' . $suffix . '_' . uniqid(),
        'email' => 'test_' . $suffix . '_' . uniqid() . '@example.test',
        'password' => Hash::make('password123'),
        'role_type' => 'user',
    ]);
}

it('rejects marking the same bid paid twice and writes only one ledger row', function () {
    $owner = moneyTestUser('owner');
    $proUser = User::create([
        'name' => 'Pro', 'username' => 'pro_' . uniqid(), 'email' => 'pro_' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create(['user_id' => $proUser->id, 'nama' => 'Pro']);
    $project = Project::create(['title' => 'T', 'user_id' => $owner->id, 'budget' => 100_000_000, 'status' => 'open']);

    $bid = BidArsitek::create([
        'project_id' => $project->id,
        'arsitek_id' => $profile->id,
        'price' => 5_000_000,
        'status' => 'active',
    ]);

    $payload = ['type' => 'bid_arsitek', 'id' => $bid->id];

    $first = $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", $payload);
    $first->assertStatus(200);

    $second = $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", $payload);

    // The double-spend guard must refuse the second attempt...
    $second->assertStatus(422);

    // ...and exactly ONE ledger row may exist.
    $this->assertSame(
        1,
        ProjectBudgetTransaction::where('project_id', $project->id)
            ->where('reference_model', 'App\\Models\\BidArsitek')
            ->where('reference_id', $bid->id)
            ->count()
    );
});

it('blocks re-signing a contract once a payment is verifying or paid', function () {
    $owner = moneyTestUser('owner2');
    $proUser = User::create([
        'name' => 'Pro2', 'username' => 'pro2_' . uniqid(), 'email' => 'pro2_' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create(['user_id' => $proUser->id, 'nama' => 'Pro2']);
    $project = Project::create(['title' => 'T2', 'user_id' => $owner->id, 'budget' => 100_000_000, 'status' => 'in_progress']);

    $bid = BidArsitek::create([
        'project_id' => $project->id,
        'arsitek_id' => $profile->id,
        'price' => 5_000_000,
        'status' => 'contract_pending',
    ]);

    ProjectPaymentTermin::create([
        'project_id' => $project->id,
        'label' => 'DP',
        'percentage' => 30,
        'amount' => 1_500_000,
        'status' => 'paid',
        'role_type' => 'arsitek',
        'recipient_id' => $proUser->id,
    ]);

    $res = $this->actingAs($proUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/bids/{$bid->id}/sign-contract", [
            'bid_type' => 'arsitek',
            'termins' => [
                ['label' => 'Full', 'percentage' => 100, 'amount' => 5_000_000],
            ],
            'bank_type' => 'BCA',
            'bank_account_no' => '12345678',
            'bank_account_name' => 'Pro2',
        ]);

    $res->assertStatus(422);

    // The paid termin must still exist — never deleted by a re-sign.
    $this->assertSame(1, ProjectPaymentTermin::where('project_id', $project->id)->count());
});

it('prevents cross-project access to nested payment termins', function () {
    $attacker = moneyTestUser('attacker');
    $victimOwner = moneyTestUser('victim');

    $victimProject = Project::create(['title' => 'V', 'user_id' => $victimOwner->id, 'budget' => 10_000_000, 'status' => 'open']);
    $termin = ProjectPaymentTermin::create([
        'project_id' => $victimProject->id,
        'label' => 'Secret DP',
        'percentage' => 20,
        'amount' => 2_000_000,
        'status' => 'pending',
        'role_type' => 'kontraktor',
    ]);

    $res = $this->actingAs($attacker, 'sanctum')
        ->putJson("/api/projects/{$victimProject->id}/payment-termins/{$termin->id}", [
            'label' => 'Hacked',
            'amount' => 999_999_999,
        ]);

    // Route-model {termin} id is bogus for the attacker's call; regardless of
    // 404/403 shape it must NOT succeed.
    $this->assertContains($res->getStatusCode(), [403, 404]);
});

it('forbids unrelated users from verifying payment proofs', function () {
    $owner = moneyTestUser('own3');
    $stranger = moneyTestUser('stranger');
    $proUser = User::create([
        'name' => 'Pro3', 'username' => 'pro3_' . uniqid(), 'email' => 'pro3_' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);

    $project = Project::create(['title' => 'T3', 'user_id' => $owner->id, 'budget' => 10_000_000, 'status' => 'open']);
    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id,
        'label' => 'DP',
        'percentage' => 50,
        'amount' => 5_000_000,
        'status' => 'verifying',
        'role_type' => 'kontraktor',
        'recipient_id' => $proUser->id,
    ]);

    $res = $this->actingAs($stranger, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payments/termin/{$termin->id}/verify-proof", [
            'action' => 'accept',
        ]);

    $res->assertStatus(403);
});

it('does not treat a percentage fee as raw rupiah when the project has no budget', function () {
    $owner = moneyTestUser('own4');
    // budget stays at its default (0) — the "no budget" case.
    $project = Project::create(['title' => 'T4', 'user_id' => $owner->id, 'status' => 'open']);

    $calc = app(BidCalculationService::class)->calculate([
        'fee_type' => 'percentage',
        'price' => 5, // 5%
    ], $project);

    // BUGFIX: previously returned 5 (five rupiah!) which passed ">0" gates.
    expect($calc['calculated_total'])->toBe(0);
});

it('books notary consultations and rejects duplicate slots', function () {
    $client = moneyTestUser('client');
    $notaryUser = User::create([
        'name' => 'N', 'username' => 'not_' . uniqid(), 'email' => 'not_' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'notaris',
    ]);
    $notary = NotarisProfile::create(['user_id' => $notaryUser->id, 'nama' => 'N']);

    $when = now()->addDays(3)->format('Y-m-d H:i:s');
    $payload = ['notaris_id' => $notary->id, 'schedule_date' => $when, 'notes' => 'SHM'];

    $first = $this->actingAs($client, 'sanctum')->postJson('/api/consultations', $payload);
    $first->assertStatus(201);
    $this->assertSame(1, NotarisConsultation::where('user_id', $client->id)->count());

    $second = $this->actingAs($client, 'sanctum')->postJson('/api/consultations', $payload);
    $second->assertStatus(422);
    $this->assertSame(1, NotarisConsultation::where('user_id', $client->id)->count());
});

// ---------------------------------------------------------------------------
// ROUND 2 (2026-08-25): unique-constraint fallout + detail gate + windows
// ---------------------------------------------------------------------------

it('enforces the one-bid-per-professional unique constraint at the DB level', function () {
    $owner = moneyTestUser('uniq_owner');
    $proUser = User::create([
        'name' => 'U', 'username' => 'uniq_' . uniqid(), 'email' => 'uniq_' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create(['user_id' => $proUser->id, 'nama' => 'U']);
    $project = Project::create(['title' => 'TU', 'user_id' => $owner->id, 'budget' => 10_000_000, 'status' => 'open']);

    BidArsitek::create(['project_id' => $project->id, 'arsitek_id' => $profile->id, 'price' => 1_000_000, 'status' => 'pending']);

    $thrown = false;
    try {
        BidArsitek::create(['project_id' => $project->id, 'arsitek_id' => $profile->id, 'price' => 2_000_000, 'status' => 'pending']);
    } catch (\Illuminate\Database\QueryException $e) {
        $thrown = true;
    }

    expect($thrown)->toBeTrue();
    $this->assertSame(
        1,
        BidArsitek::where('project_id', $project->id)->where('arsitek_id', $profile->id)->count()
    );
});

it('dedupes ledger entries written under the legacy short reference spelling', function () {
    $owner = moneyTestUser('spell_owner');
    $proUser = User::create([
        'name' => 'S', 'username' => 'spell_' . uniqid(), 'email' => 'spell_' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create(['user_id' => $proUser->id, 'nama' => 'S']);
    $project = Project::create(['title' => 'TS', 'user_id' => $owner->id, 'budget' => 50_000_000, 'status' => 'open']);
    $bid = BidArsitek::create(['project_id' => $project->id, 'arsitek_id' => $profile->id, 'price' => 5_000_000, 'status' => 'active']);

    // Historical row written with the SHORT spelling by an old code path.
    ProjectBudgetTransaction::create([
        'project_id' => $project->id,
        'transaction_type' => 'payment',
        'amount' => 5_000_000,
        'title' => 'Professional Fee: S',
        'reference_model' => 'BidArsitek', // legacy short name
        'reference_id' => $bid->id,
        'transaction_date' => now(),
    ]);

    $service = app(\App\Services\ProjectFinancialService::class);
    // deductBudget normalizes to FQCN but must still match the short-named row.
    $result = $service->deductBudget($project, 5_000_000, 'payment', 'Professional Fee: S', 'BidArsitek', $bid->id);

    expect($result)->toBeTrue();
    $this->assertSame(
        1,
        ProjectBudgetTransaction::where('project_id', $project->id)
            ->where('reference_id', $bid->id)
            ->count()
    );
});

it('fails payment verification loudly when the project budget is insufficient', function () {
    $owner = moneyTestUser('poor_owner');
    $proUser = User::create([
        'name' => 'P', 'username' => 'poor_' . uniqid(), 'email' => 'poor_' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create(['user_id' => $proUser->id, 'nama' => 'P']);
    $project = Project::create(['title' => 'TP', 'user_id' => $owner->id, 'budget' => 1_000_000, 'status' => 'open']);
    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 9_999_999, 'payment_status' => 'verifying', 'status' => 'accepted',
    ]);

    // Bid payments are verified by the PRO (payee), per verify-proof authz.
    $res = $this->actingAs($proUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payments/arsitek_bid/{$bid->id}/verify-proof", [
            'action' => 'accept',
        ]);

    $res->assertStatus(422);
    // No partial state: bid must NOT be active/paid.
    $bid->refresh();
    expect($bid->payment_status)->not->toBe('paid');
    expect($bid->status)->toBe('accepted');
});

it('hides project detail from authenticated non-members', function () {
    $owner = moneyTestUser('gate_owner');
    $stranger = moneyTestUser('gate_stranger');
    $project = Project::create(['title' => 'TG', 'user_id' => $owner->id, 'budget' => 10_000_000, 'status' => 'open']);

    $res = $this->actingAs($stranger, 'sanctum')
        ->getJson("/api/projects/{$project->id}");

    $res->assertStatus(403);
});

it('rejects warranty claims filed before the warranty window opens', function () {
    $owner = moneyTestUser('warr_owner');
    $project = Project::create(['title' => 'TW', 'user_id' => $owner->id, 'budget' => 10_000_000, 'status' => 'in_progress']);
    // No warranty_end_at set (project never finalized).

    $res = $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/warranty-claims", [
            'title' => 'Cracked wall',
            'description' => 'Wall cracked after handover.',
        ]);

    $res->assertStatus(422);
});

it('invalidates the cached budget summary when a payment clears', function () {
    $owner = moneyTestUser('cache_owner');
    $proUser = User::create([
        'name' => 'C', 'username' => 'cache_' . uniqid(), 'email' => 'cache_' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    $project = Project::create(['title' => 'TC', 'user_id' => $owner->id, 'budget' => 100_000_000, 'status' => 'in_progress']);

    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id,
        'label' => 'Termin 1',
        'percentage' => 30,
        'amount' => 5_000_000,
        'status' => 'verifying',
        'role_type' => 'kontraktor',
        'recipient_id' => $proUser->id,
    ]);

    // Backdate so second-precision timestamp comparison is deterministic.
    $project->forceFill(['updated_at' => now()->subMinutes(5)])->saveQuietly();
    $beforeKey = "budget_summary_{$project->id}_{$project->updated_at}";
    $before = \Illuminate\Support\Facades\Cache::get($beforeKey);

    $res = $this->actingAs($proUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/payments/termin/{$termin->id}/verify-proof", [
            'action' => 'accept',
        ]);
    $res->assertStatus(200);

    // The old cache entry must be orphaned (updated_at advanced).
    $afterKey = "budget_summary_{$project->id}_{$project->fresh()->updated_at}";
    expect($afterKey)->not->toBe($beforeKey);
});
