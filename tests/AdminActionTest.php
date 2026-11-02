<?php

use App\Models\Arsitek;
use App\Models\House;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Admin writes: suspend, role, listing suspend and professional status
|--------------------------------------------------------------------------
|
| - suspending a user revokes every token they hold (without it a suspended
|   account keeps working with the bearer token it already has) and cannot
|   target the caller;
| - changing a role syncs the Spatie assignment AND role_type;
| - the listing answer renders the JUST-ASSIGNED `is_suspended` as a boolean
|   (a reload would render MySQL's tinyint), and the professional answer is
|   the profile model with its appends plus `user`;
| - professional approval/rejection writes the dashboard notification.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function actAdmin(string $tag): User
{
    return User::create([
        'name' => "Admin $tag", 'username' => "actadm_$tag" . uniqid(),
        'email' => "actadm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'admin',
    ]);
}

function actTarget(string $tag): User
{
    return User::create([
        'name' => "Target $tag", 'username' => "acttarget_$tag" . uniqid(),
        'email' => "acttarget_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

it('suspends a user and revokes their tokens, but never the caller', function () {
    $admin = actAdmin('sus');
    $target = actTarget('sus');
    $target->createToken('device');

    expect(DB::table('personal_access_tokens')->where('tokenable_id', $target->id)->count())->toBe(1);

    $this->actingAs($admin)
        ->patchJson("/api/admin/users/{$target->id}/suspend")
        ->assertStatus(200)
        ->assertJsonPath('message', 'User account suspended successfully. All active sessions were revoked.')
        ->assertJsonPath('user.is_suspended', true);

    expect($target->fresh()->is_suspended)->toBeTrue();
    expect(DB::table('personal_access_tokens')->where('tokenable_id', $target->id)->count())->toBe(0);

    // Re-activating keeps the account unlocked and says so.
    $this->actingAs($admin)
        ->patchJson("/api/admin/users/{$target->id}/suspend")
        ->assertStatus(200)
        ->assertJsonPath('message', 'User account activated successfully.')
        ->assertJsonPath('user.is_suspended', false);

    $this->actingAs($admin)
        ->patchJson("/api/admin/users/{$admin->id}/suspend")
        ->assertStatus(400)
        ->assertJsonPath('message', 'You cannot suspend your own account.');

    expect($admin->fresh()->is_suspended)->toBeFalse();
});

it('changes a role and syncs the Spatie assignment', function () {
    $admin = actAdmin('role');
    $target = actTarget('role');

    $response = $this->actingAs($admin)
        ->patchJson("/api/admin/users/{$target->id}/role", ['role_type' => 'arsitek'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'User role updated successfully.');

    expect($target->fresh()->role_type)->toBe('arsitek');
    expect($response->json('user.role_type'))->toBe('arsitek');
    expect($response->json('user.roles.0.name'))->toBe('arsitek');
    expect($response->json('user.roles.0.pivot.model_id'))->toBe($target->id);

    $this->actingAs($admin)
        ->patchJson("/api/admin/users/{$admin->id}/role", ['role_type' => 'user'])
        ->assertStatus(400)
        ->assertJsonPath('message', 'You cannot change your own role.');

    $this->actingAs($admin)
        ->patchJson("/api/admin/users/{$target->id}/role", ['role_type' => 'chef'])
        ->assertStatus(422)
        ->assertJsonPath('errors.role_type', ['The selected role type is invalid.']);

    expect($target->fresh()->role_type)->toBe('arsitek');
});

it('assigns the roles that were missing from the Spatie catalogue', function () {
    // DEFECT: `role_type` accepts supplier and logistics, but the seeded
    // Spatie catalogue had no rows for them, so syncRoles() threw
    // "There is no role named `supplier` for guard `web`" and the admin
    // dropdown answered 500 for two of its own options.
    $admin = actAdmin('missing');
    $target = actTarget('missing');

    foreach (['supplier', 'logistics'] as $role) {
        $this->actingAs($admin)
            ->patchJson("/api/admin/users/{$target->id}/role", ['role_type' => $role])
            ->assertStatus(200)
            ->assertJsonPath('user.role_type', $role)
            ->assertJsonPath('user.roles.0.name', $role);

        expect($target->fresh()->role_type)->toBe($role);
        expect(DB::table('roles')->where('name', $role)->where('guard_name', 'web')->exists())->toBeTrue();
    }

    app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();
});

it('suspends and activates a listing with a boolean flag', function () {
    $admin = actAdmin('hs');
    $owner = actTarget('hs');
    $house = House::create([
        'name' => 'Villa Suspend', 'price' => 900_000_000, 'house_desc' => 'x',
        'id_user' => $owner->id, 'is_suspended' => false,
    ]);

    $response = $this->actingAs($admin)
        ->patchJson("/api/admin/houses/{$house->id}/suspend")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Listing suspended successfully.')
        ->assertJsonPath('house.is_suspended', true);

    // The in-memory boolean, not the raw tinyint.
    expect($response->json('house.is_suspended'))->toBeTrue();
    expect($response->json('house.user.id'))->toBe($owner->id);
    expect((int) $house->fresh()->is_suspended)->toBe(1);

    $this->actingAs($admin)
        ->patchJson("/api/admin/houses/{$house->id}/suspend")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Listing activated successfully.')
        ->assertJsonPath('house.is_suspended', false);

    $this->actingAs($admin)
        ->patchJson('/api/admin/houses/999999999/suspend')
        ->assertStatus(404);
});

it('approves and rejects a professional and writes the notification', function () {
    $admin = actAdmin('pro');
    $professional = actTarget('pro');
    $profile = Arsitek::create([
        'user_id' => $professional->id, 'nama' => 'Status Studio',
        'foto' => 'kyc/p.png', 'verification_status' => 'pending',
    ]);

    $response = $this->actingAs($admin)
        ->patchJson("/api/admin/professionals/arsitek/{$profile->id}/status", ['status' => 'verified'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Professional status updated to verified');

    expect($response->json('professional.verification_status'))->toBe('verified');
    expect($response->json('professional.user.id'))->toBe($professional->id);
    expect($response->json('professional.average_rating'))->toBe(0);

    $verified = Notification::where('user_id', $professional->id)->where('type', 'verification')->latest('id')->first();
    expect($verified->title)->toBe('Account Verification Approved');
    expect($verified->body)->toBe('Your request to join as a Arsitek has been approved! You can now access professional features.');
    expect($verified->data['status'])->toBe('verified');

    $this->actingAs($admin)
        ->patchJson("/api/admin/professionals/arsitek/{$profile->id}/status", [
            'status' => 'rejected', 'reason' => 'blurry document',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Professional status updated to rejected');

    expect($profile->fresh()->verification_status)->toBe('rejected');
    expect($profile->fresh()->rejection_reason)->toBe('blurry document');

    $rejected = Notification::where('user_id', $professional->id)->where('type', 'verification')->latest('id')->first();
    expect($rejected->title)->toBe('Account Verification Rejected');
    expect($rejected->data['reason'])->toBe('blurry document');

    $this->actingAs($admin)
        ->patchJson('/api/admin/professionals/chef/1/status', ['status' => 'verified'])
        ->assertStatus(400)
        ->assertJsonPath('message', 'Invalid professional type');

    $this->actingAs($admin)
        ->patchJson("/api/admin/professionals/arsitek/{$profile->id}/status", ['status' => 'nope'])
        ->assertStatus(422)
        ->assertJsonPath('errors.status', ['The selected status is invalid.']);
});
