<?php

use App\Models\Arsitek;
use App\Models\FirmMember;
use App\Models\Project;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Firm members: search, invite, respond, roster, profile and quick-assign
|--------------------------------------------------------------------------
|
| Two authorisation styles coexist and must not be confused:
|   - `search` and `invite` are FormRequests: a non-owner gets the generic
|     "This action is unauthorized." 403 BEFORE validation;
|   - `roster` answers {"data": []} for a non-owner instead.
|
| `unique_code` is in User::$hidden, so it never appears on search/suggestions
| rows even though the service selects it. Created firm-member payloads are in
| PAYLOAD order with updated_at before created_at and the id last, and columns
| that were never set (accepted_at on an invite) are ABSENT rather than null.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function fmUser(string $tag, string $role, string $name = 'Member'): User
{
    return User::create([
        'name' => "$name $tag", 'username' => "fm_$tag" . uniqid(),
        'email' => "fm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

function fmArchitect(string $tag): array
{
    $user = fmUser($tag, 'arsitek', 'Architect');
    $profile = Arsitek::create([
        'user_id' => $user->id, 'nama' => "Studio $tag", 'pengalaman_tahun' => 8,
        'rate_harga' => 15_000_000,
    ]);

    return [$user, $profile];
}

it('searches only the owner target roles and hides unique_code', function () {
    [$architect, ] = fmArchitect('srch');
    $structural = fmUser('srch', 'structural', 'Structonly');
    $civil = fmUser('srch', 'civil', 'Civilonly');

    $response = $this->actingAs($architect)
        ->postJson('/api/firm-members/search', ['query' => 'Structonly'])
        ->assertStatus(200);

    $ids = array_column($response->json('data'), 'id');
    expect($ids)->toContain($structural->id);
    expect($ids)->not->toContain($civil->id);
    // User::$hidden drops unique_code even though the query selects it.
    expect($response->json('data.0'))->not->toHaveKey('unique_code');

    $this->actingAs($architect)
        ->postJson('/api/firm-members/search', ['query' => 'a'])
        ->assertStatus(422)
        ->assertJsonPath('errors.query', ['The query field must be at least 2 characters.']);

    // FormRequest authorize() 403, not the roster's empty list.
    $plain = fmUser('srchp', 'user');
    $this->actingAs($plain)
        ->postJson('/api/firm-members/search', ['query' => 'Member'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'This action is unauthorized.');
});

it('invites with the created payload order and refuses duplicates', function () {
    [$architect, ] = fmArchitect('inv');
    $structural = fmUser('inv', 'structural', 'Struct');

    $response = $this->actingAs($architect)
        ->postJson('/api/firm-members/invite', [
            'member_user_id' => $structural->id, 'roles_in_firm' => ['structural'],
        ])
        ->assertStatus(201);

    $data = $response->json('data.0');
    expect(array_keys($data))->toBe([
        'firm_owner_id', 'member_user_id', 'role_in_firm', 'status', 'invited_at',
        'updated_at', 'created_at', 'id', 'member',
    ]);
    expect($data['status'])->toBe('invited');
    expect($data['member']['id'])->toBe($structural->id);

    expect(FirmMember::where('firm_owner_id', $architect->id)->count())->toBe(1);

    $this->actingAs($architect)
        ->postJson('/api/firm-members/invite', [
            'member_user_id' => $structural->id, 'roles_in_firm' => ['structural'],
        ])
        ->assertStatus(409)
        ->assertJsonPath('message', 'This professional already holds the selected role(s) in your firm.');

    // A contractor subspecialty slug is not an architect's valid role.
    $invalidRole = $this->actingAs($architect)
        ->postJson('/api/firm-members/invite', [
            'member_user_id' => $structural->id, 'roles_in_firm' => ['roofing'],
        ])
        ->assertStatus(422);
    // The error KEY contains a literal dot, so read the bag as an array.
    expect($invalidRole->json('errors')['roles_in_firm.0'])
        ->toBe(['The selected roles_in_firm.0 is invalid.']);
});

it('responds, cancels and offboards with the two authorisation styles', function () {
    [$architect, ] = fmArchitect('resp');
    $structural = fmUser('resp', 'structural', 'Struct');
    $stranger = fmUser('resp', 'user');

    $member = FirmMember::create([
        'firm_owner_id' => $architect->id, 'member_user_id' => $structural->id,
        'role_in_firm' => 'structural', 'status' => 'invited', 'invited_at' => now(),
    ]);

    $this->actingAs($stranger)
        ->postJson("/api/firm-members/{$member->id}/respond", ['action' => 'accept'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    $this->actingAs($structural)
        ->postJson("/api/firm-members/{$member->id}/respond", ['action' => 'accept'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'You have joined the firm.')
        ->assertJsonPath('data.status', 'active');

    // Offboard: only active members, only by the owner.
    $this->actingAs($structural)
        ->deleteJson("/api/firm-members/{$member->id}")
        ->assertStatus(403);

    $this->actingAs($architect)
        ->deleteJson("/api/firm-members/{$member->id}")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Member offboarded successfully.')
        ->assertJsonPath('data.status', 'removed');

    // Only pending invitations can be cancelled.
    $this->actingAs($architect)
        ->postJson("/api/firm-members/{$member->id}/cancel")
        ->assertStatus(400)
        ->assertJsonPath('message', 'Only pending invitations can be cancelled.');
});

it('lists the roster with privacy-safe member cards', function () {
    [$architect, ] = fmArchitect('rost');
    $structural = fmUser('rost', 'structural', 'Struct');
    StructuralEngineer::create([
        'user_id' => $structural->id, 'nama' => 'Struct Co',
        'no_telp' => '081200000099', 'verification_status' => 'verified',
        'rate_harga' => 5_000_000, 'pengalaman_tahun' => 4,
    ]);
    FirmMember::create([
        'firm_owner_id' => $architect->id, 'member_user_id' => $structural->id,
        'role_in_firm' => 'structural', 'status' => 'active',
    ]);

    $response = $this->actingAs($architect)
        ->getJson('/api/firm-members/roster')
        ->assertStatus(200);

    expect($response->json('data'))->toHaveCount(1);
    $member = $response->json('data.0.member');
    expect($member)->not->toHaveKey('unique_code');
    expect($member['no_telp'])->toBe('081200000099');
    expect($member['verification_status'])->toBe('verified');
    expect($member['rate_harga'])->toBe(5000000);
    expect($member['pengalaman_tahun'])->toBe(4);
    expect($member['structural_engineer'])->not->toBeNull();

    // A non-owner gets the empty list, not a 403.
    $plain = fmUser('rostp', 'user');
    $this->actingAs($plain)
        ->getJson('/api/firm-members/roster')
        ->assertStatus(200)
        ->assertExactJson(['data' => []]);
});

it('serves the firm profile and its invitations and firms', function () {
    [$architect, $profile] = fmArchitect('prof');
    $structural = fmUser('prof', 'structural', 'Struct');
    FirmMember::create([
        'firm_owner_id' => $architect->id, 'member_user_id' => $structural->id,
        'role_in_firm' => 'structural', 'status' => 'invited', 'invited_at' => now(),
    ]);

    $response = $this->actingAs($structural)
        ->getJson("/api/firm-members/profile/{$architect->id}")
        ->assertStatus(200);

    expect($response->json('owner.id'))->toBe($architect->id);
    expect($response->json('owner.unique_code'))->toBeNull();
    expect($response->json('firm_name'))->toBe($architect->name);
    expect($response->json('stats.experience_years'))->toBe(8);
    expect($response->json('stats.base_rate'))->toBe(15000000);
    expect($response->json('stats.active_members_count'))->toBe(0);
    expect($response->json('roster'))->toHaveCount(1);
    expect($response->json('portfolios'))->toBe([]);

    // Eloquent snake-cases relation keys: `firmOwner` serializes as
    // `firm_owner`, with the nested arsitek/kontraktor relations loaded.
    $inv = $this->actingAs($structural)->getJson('/api/firm-members/invitations')->assertStatus(200);
    expect($inv->json('data.0.firm_owner.id'))->toBe($architect->id);
    expect($inv->json('data.0.firm_owner.arsitek.id'))->toBe($profile->id);
    expect($inv->json('data.0.firm_owner.arsitek.no_telp'))->toBeNull();

    $this->actingAs($structural)
        ->getJson('/api/firm-members/my-firms')
        ->assertStatus(200)
        ->assertExactJson(['data' => []]);

    $this->actingAs($structural)
        ->getJson('/api/firm-members/profile/999999999')
        ->assertStatus(404)
        ->assertJsonPath('message', 'Firm not found.');
});

it('browses hiring firms and reports the current membership', function () {
    $viewer = fmUser('browse', 'structural', 'Viewer');
    [$hiring, ] = fmArchitect('browse');
    $hiring->update(['firm_is_hiring' => true, 'firm_name' => 'Hiring Studio']);
    [$quiet, ] = fmArchitect('quiet');

    $response = $this->actingAs($viewer)
        ->getJson('/api/firm-members/browse-owners')
        ->assertStatus(200);

    $ids = array_column($response->json('data'), 'id');
    expect($ids)->toBe([$hiring->id]);
    expect($response->json('data.0.firm_name'))->toBe('Hiring Studio');
    expect($response->json('data.0.firm_is_hiring'))->toBeTrue();
    expect($response->json('data.0.currentUserMembershipStatus'))->toBeNull();

    FirmMember::create([
        'firm_owner_id' => $hiring->id, 'member_user_id' => $viewer->id,
        'role_in_firm' => 'structural', 'status' => 'invited',
    ]);
    $this->actingAs($viewer)
        ->getJson('/api/firm-members/browse-owners')
        ->assertJsonPath('data.0.currentUserMembershipStatus', 'invited');
});

it('lets a specialist request to join once', function () {
    [$architect, ] = fmArchitect('join');
    $specialist = fmUser('join', 'structural', 'Spec');

    $response = $this->actingAs($specialist)
        ->postJson('/api/firm-members/request-join', [
            'firm_owner_id' => $architect->id, 'role_in_firm' => 'structural',
        ])
        ->assertStatus(201);

    expect(array_keys($response->json('data')))->toBe([
        'firm_owner_id', 'member_user_id', 'role_in_firm', 'status', 'requested_at',
        'updated_at', 'created_at', 'id',
    ]);
    expect($response->json('data.status'))->toBe('requested');

    $this->actingAs($specialist)
        ->postJson('/api/firm-members/request-join', [
            'firm_owner_id' => $architect->id, 'role_in_firm' => 'structural',
        ])
        ->assertStatus(409)
        ->assertJsonPath('message', 'You already have a pending connection with this firm.');
});

it('proposes a specialist assignment for an active roster member', function () {
    [$architect, $profile] = fmArchitect('qa');
    $specialist = fmUser('qa', 'structural', 'Spec');
    StructuralEngineer::create(['user_id' => $specialist->id, 'nama' => 'Spec Co']);
    FirmMember::create([
        'firm_owner_id' => $architect->id, 'member_user_id' => $specialist->id,
        'role_in_firm' => 'structural', 'status' => 'active',
    ]);
    $project = Project::create([
        'title' => 'QA Project', 'user_id' => $architect->id,
        'budget' => 100_000_000, 'status' => 'open', 'target_role' => 'both',
        'selected_arsitek_id' => $profile->id,
    ]);

    $payload = [
        'member_user_id' => $specialist->id, 'project_id' => $project->id,
        'sub_role' => 'structural', 'rate' => 1_500_000, 'description' => 'Site lead',
    ];

    // Not a member → 403 before any project check.
    $other = fmUser('qa2', 'structural', 'Other');
    $this->actingAs($architect)
        ->postJson('/api/firm-members/quick-assign', array_merge($payload, [
            'member_user_id' => $other->id,
        ]))
        ->assertStatus(403)
        ->assertJsonPath('message', 'The selected specialist does not hold this active role in your firm roster.');

    $response = $this->actingAs($architect)
        ->postJson('/api/firm-members/quick-assign', $payload)
        ->assertStatus(201);

    expect(array_keys($response->json('data')))->toBe([
        'project_id', 'role_type', 'user_id', 'title', 'amount', 'description',
        'type', 'assigned_user_id', 'specialist_type', 'status',
        'updated_at', 'created_at', 'id',
    ]);
    expect($response->json('data.title'))->toBe('Specialist Assignment: STRUCTURAL');
    expect($response->json('data.amount'))->toBe('1500000.00');
});

it('updates the firm profile and mirrors company_name', function () {
    [$architect, $profile] = fmArchitect('upd');

    $this->actingAs($architect)
        ->postJson('/api/firm-members/update-profile', [
            'firm_name' => 'Giska Firm', 'firm_slogan' => 'Design',
            'firm_description' => 'Boutique studio',
            'base_rate' => 16_000_000, 'experience_years' => 9,
            'firm_is_hiring' => true, 'firm_needed_roles' => ['structural', 'mep'],
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Firm squad profile updated successfully.')
        ->assertJsonPath('user.firm_name', 'Giska Firm')
        ->assertJsonPath('user.firm_needed_roles', ['structural', 'mep'])
        ->assertJsonPath('user.firm_is_hiring', true);

    $fresh = $architect->fresh();
    expect($fresh->firm_name)->toBe('Giska Firm');
    expect($profile->fresh()->rate_harga)->toBe('16000000.00');
    expect($profile->fresh()->pengalaman_tahun)->toBe(9);
    expect($profile->fresh()->company_name)->toBe('Giska Firm');

    // A non-owner is refused with the controller's own sentence.
    $plain = fmUser('updp', 'user');
    $this->actingAs($plain)
        ->postJson('/api/firm-members/update-profile', [])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');
});

it('serialises contractor-owned firm invitations without the strict-mode crash', function () {
    // DEFECT: the invitation/my-firms queries constrained the owner's
    // kontraktor relation to id,user_id,no_telepon — but Kontraktor appends
    // `lokasi`, whose accessor reads `alamat`. Under shouldBeStrict a missing
    // attribute throws, so any contractor-owned firm made the invitations
    // endpoint answer 500. The select must carry `alamat`.
    $owner = fmUser('conown', 'kontraktor', 'Contractor');
    $profile = \App\Models\Kontraktor::create([
        'user_id' => $owner->id,
        'nama' => 'Build Co',
        'alamat' => 'Jl. Kontraktor 1',
    ]);

    $structural = fmUser('coninv', 'structural', 'Struct');
    FirmMember::create([
        'firm_owner_id' => $owner->id, 'member_user_id' => $structural->id,
        'role_in_firm' => 'structural', 'status' => 'invited', 'invited_at' => now(),
    ]);
    FirmMember::create([
        'firm_owner_id' => $owner->id, 'member_user_id' => $structural->id,
        'role_in_firm' => 'mep', 'status' => 'active', 'accepted_at' => now(),
    ]);

    $inv = $this->actingAs($structural)
        ->getJson('/api/firm-members/invitations')
        ->assertStatus(200);
    expect($inv->json('data.0.firm_owner.kontraktor.id'))->toBe($profile->id);
    expect($inv->json('data.0.firm_owner.kontraktor.lokasi'))->toBe('Jl. Kontraktor 1');

    $this->actingAs($structural)
        ->getJson('/api/firm-members/my-firms')
        ->assertStatus(200)
        ->assertJsonPath('data.0.firm_owner.kontraktor.lokasi', 'Jl. Kontraktor 1');
});
