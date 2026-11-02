<?php

use App\Models\Arsitek;
use App\Models\CourierProfile;
use App\Models\House;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Admin reads: verification queue, history, houses, users and projects
|--------------------------------------------------------------------------
|
| Every one of these is `latest()->paginate(n)` on the oracle side, so the
| port must reproduce THREE things exactly:
|
| - the raw 13-key paginator envelope, with page URLs that carry ONLY
|   `?page=` (none of the controllers call withQueryString());
| - `ORDER BY created_at DESC` WITH MySQL's implicit id-ascending tie-break,
|   otherwise equal `created_at` rows shuffle between engines;
| - model serialization: users carry Spatie `roles` with their pivot, the
|   project row is the raw 98-column model with `user`/`arsitek`/`kontraktor`
|   relations (and the profile relations have NO nested `user`), and the
|   history's `audited_at` is Carbon's ISO-8601 with a `+00:00` offset.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function admAdmin(string $tag): User
{
    return User::create([
        'name' => "Admin $tag", 'username' => "adm_$tag" . uniqid(),
        'email' => "adm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'admin',
    ]);
}

it('lists the verification queue with the pending and documented profiles', function () {
    $admin = admAdmin('pf');

    // A pending arsitek WITHOUT documents is filtered out.
    $bare = User::create([
        'name' => 'Bare', 'username' => 'bare' . uniqid(),
        'email' => 'bare' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    Arsitek::create(['user_id' => $bare->id, 'nama' => 'Bare Studio']);

    $documented = User::create([
        'name' => 'Documented', 'username' => 'doc' . uniqid(),
        'email' => 'doc' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    Arsitek::create([
        'user_id' => $documented->id, 'nama' => 'Doc Studio',
        'foto' => 'kyc/doc.png', 'verification_status' => 'pending',
    ]);

    $response = $this->actingAs($admin)
        ->getJson('/api/admin/professionals')
        ->assertStatus(200);

    expect(array_keys($response->json()))->toBe([
        'arsiteks', 'kontraktors', 'civil_contractors', 'mechanical_contractors',
        'electrical_contractors', 'plumbing_contractors', 'roofing_contractors',
        'finishing_contractors', 'project_managers', 'structural_engineers',
        'mep_engineers', 'notaries', 'interiors', 'suppliers', 'logistics',
    ]);
    expect($response->json('arsiteks'))->toHaveCount(1);
    expect($response->json('arsiteks.0.nama'))->toBe('Doc Studio');
    expect($response->json('arsiteks.0.user.id'))->toBe($documented->id);
    // The two appends close the attribute list, before the relation.
    $keys = array_keys($response->json('arsiteks.0'));
    expect(array_slice($keys, -3))->toBe(['average_rating', 'review_count', 'user']);
    expect($response->json('arsiteks.0.user.id'))->toBe($documented->id);
});

it('lists houses with the owner and the tinyint suspension flag', function () {
    $admin = admAdmin('hs');
    $owner = User::create([
        'name' => 'Owner House', 'username' => 'houseown' . uniqid(),
        'email' => 'houseown' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    House::create([
        'name' => 'Villa Ubud', 'price' => 1_500_000_000, 'house_desc' => 'nice',
        'id_user' => $owner->id, 'is_suspended' => false,
    ]);

    $response = $this->actingAs($admin)
        ->getJson('/api/admin/houses')
        ->assertStatus(200);

    expect($response->json('total'))->toBe(1);
    expect($response->json('per_page'))->toBe(15);
    expect($response->json('path'))->toBe(url('/api/admin/houses'));
    expect($response->json('data.0.name'))->toBe('Villa Ubud');
    // decimal:2 cast renders a string.
    expect($response->json('data.0.price'))->toBe('1500000000.00');
    // No cast on the model: MySQL's tinyint is 0, not false.
    expect($response->json('data.0.is_suspended'))->toBe(0);
    expect($response->json('data.0.user.id'))->toBe($owner->id);

    $search = $this->actingAs($admin)
        ->getJson('/api/admin/houses?search=Villa')
        ->assertStatus(200);
    expect($search->json('total'))->toBe(1);
    // The paginator does NOT preserve the filter in its URLs.
    expect($search->json('first_page_url'))->toBe(url('/api/admin/houses') . '?page=1');
});

it('lists users with roles, filters and the tie-break order', function () {
    $admin = admAdmin('us');
    $admin->assignRole('admin');

    $disabled = User::create([
        'name' => 'Suspended One', 'username' => 'susp' . uniqid(),
        'email' => 'susp' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
        'is_suspended' => true,
    ]);

    $this->actingAs($admin)
        ->getJson('/api/admin/users?status=suspended')
        ->assertStatus(200)
        ->assertJsonPath('total', 1)
        ->assertJsonPath('data.0.id', $disabled->id)
        ->assertJsonPath('data.0.is_suspended', true);

    $filtered = $this->actingAs($admin)
        ->getJson('/api/admin/users?role=admin')
        ->assertStatus(200);
    expect($filtered->json('data.0.roles.0.name'))->toBe('admin');
    expect($filtered->json('data.0.roles.0.pivot.model_id'))->toBe($filtered->json('data.0.id'));

    // Two users sharing created_at must come back id-ascending.
    $first = User::create([
        'name' => 'Tie One', 'username' => 'tie1' . uniqid(),
        'email' => 'tie1' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $second = User::create([
        'name' => 'Tie Two', 'username' => 'tie2' . uniqid(),
        'email' => 'tie2' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $stamp = now()->subYear();
    User::whereIn('id', [$first->id, $second->id])->update(['created_at' => $stamp]);

    $ties = $this->actingAs($admin)
        ->getJson('/api/admin/users?role=supplier')
        ->assertStatus(200);
    expect(array_column($ties->json('data'), 'id'))->toBe([$first->id, $second->id]);
});

it('lists projects with the raw model and the relation trees', function () {
    $admin = admAdmin('pr');
    $owner = User::create([
        'name' => 'Owner Project', 'username' => 'projown' . uniqid(),
        'email' => 'projown' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $architect = User::create([
        'name' => 'Arch Project', 'username' => 'proja' . uniqid(),
        'email' => 'proja' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create(['user_id' => $architect->id, 'nama' => 'Arch Studio']);

    Project::create([
        'title' => 'Admin List Project', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open', 'target_role' => 'both',
        'selected_arsitek_id' => $profile->id,
    ]);

    $response = $this->actingAs($admin)
        ->getJson('/api/admin/projects?search=Admin List Project')
        ->assertStatus(200);

    expect($response->json('total'))->toBe(1);
    expect($response->json('data.0.title'))->toBe('Admin List Project');
    // The raw model: 98 columns plus THREE relations.
    expect($response->json('data.0'))->toHaveCount(101);
    expect(array_slice(array_keys($response->json('data.0')), -3))->toBe(['user', 'arsitek', 'kontraktor']);
    expect($response->json('data.0.user.id'))->toBe($owner->id);
    expect($response->json('data.0.arsitek.id'))->toBe($profile->id);
    // The profile relation was loaded WITHOUT its user.
    expect($response->json('data.0.arsitek'))->not->toHaveKey('user');
    expect($response->json('data.0.kontraktor'))->toBeNull();
});

it('builds the verification history with ISO dates and derived contractor types', function () {
    $admin = admAdmin('ph');

    $architect = User::create([
        'name' => 'Hist Architect', 'username' => 'hista' . uniqid(),
        'email' => 'hista' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    Arsitek::create([
        'user_id' => $architect->id, 'nama' => 'Hist Studio',
        'verification_status' => 'verified',
    ]);

    $civil = User::create([
        'name' => 'Hist Civil', 'username' => 'histc' . uniqid(),
        'email' => 'histc' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'civil',
    ]);
    Kontraktor::create([
        'user_id' => $civil->id, 'nama' => 'PT Hist Civil', 'nama_perusahaan' => 'PT Hist Civil',
        'verification_status' => 'rejected', 'rejection_reason' => 'incomplete',
    ]);

    $response = $this->actingAs($admin)
        ->getJson('/api/admin/professionals/history')
        ->assertStatus(200);

    // 15 fixture professionals plus the two created here.
    expect($response->json('total'))->toBe(17);
    $types = array_column($response->json('data'), 'type');
    expect($types)->toContain('arsitek');
    expect($types)->toContain('civil');

    $row = collect($response->json('data'))->firstWhere('type', 'civil');
    expect($row['role_label'])->toBe('Civil Contractor');
    expect($row['name'])->toBe('PT Hist Civil');
    expect($row['rejection_reason'])->toBe('incomplete');
    expect($row['audited_at'])->toMatch('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/');

    // Non-admins are stopped by the admin middleware before the controller.
    $owner = User::create([
        'name' => 'Not Admin', 'username' => 'notadm' . uniqid(),
        'email' => 'notadm' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $this->actingAs($owner)
        ->getJson('/api/admin/professionals/history')
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized access.');
});
