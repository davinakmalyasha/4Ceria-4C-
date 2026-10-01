<?php

use App\Models\Kontraktor;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Registration may never mint a pre-verified marketplace identity
|--------------------------------------------------------------------------
|
| Regression suite for a CRITICAL audit finding.
|
| `register()` creates every professional profile with
| `verification_status => 'pending'`, so an anonymous `POST /api/register` cannot
| inject an identity into the public directories or the bidding board. That fix
| had corrected seven role branches -- and missed the eighth:
|
|     } elseif (in_array($request->role_type,
|             ['civil','mechanical','electrical','plumbing','roofing','finishing'])) {
|         Kontraktor::create([
|             ...,
|             'verification_status' => 'verified',   // <-- never fixed
|         ]);
|     }
|
| Six role names -- the entire sub-contractor segment -- each still produced a
| `verified` Kontraktor. `PublicProfessionalController::directory()` filters
| `verification_status = 'verified'`, so the profile was returned by
| `GET /api/kontraktor` immediately. And because
| Admin\VerificationController only lists `pending` rows, it was never queued
| for review either: it was simultaneously publicly listable AND invisible to the
| only admin screen that could reject it.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/** Every role_type /register accepts that produces a Kontraktor. */
function subContractorRoles(): array
{
    return ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'];
}

function registerAs(string $roleType): array
{
    $suffix = $roleType . uniqid();

    $response = test()
        ->postJson('/api/register', [
            'name' => "New $roleType",
            'username' => "u_$suffix",
            'email' => strtolower("e_$suffix@example.test"),
            'password' => 'password123',
            'role_type' => $roleType,
        ]);

    return [$response, $suffix];
}

it('creates a PENDING contractor for every sub-contractor role_type', function (string $roleType) {
    registerAs($roleType);

    $profile = Kontraktor::orderByDesc('id')->first();

    expect($profile)->not->toBeNull()
        ->and($profile->verification_status)->toBe('pending')
        ->and($profile->jenis)->toBe('Sub-Contractor');
})->with(subContractorRoles());

it('creates PENDING profiles for the seven licensed roles too', function (string $roleType) {
    // Guards the branch the original fix DID cover, so it cannot silently
    // regress while the eighth branch is being maintained.
    registerAs($roleType);

    $user = User::where('username', 'LIKE', "u_{$roleType}%")->orderByDesc('id')->first();

    expect($user)->not->toBeNull();

    $profile = $user->{match ($roleType) {
        'arsitek' => 'arsitek',
        'kontraktor' => 'kontraktor',
        'notaris' => 'notaris_profile',
        'interior' => 'interior_profile',
        'structural' => 'structural_engineer',
        'mep' => 'mep_engineer',
        'project_manager' => 'project_manager',
    }};

    expect($profile)->not->toBeNull()
        ->and($profile->verification_status)->toBe('pending');
})->with(['arsitek', 'kontraktor', 'notaris', 'interior', 'structural', 'mep', 'project_manager']);

it('does NOT publish a freshly registered sub-contractor in the public directory', function () {
    // The end-to-end consequence: previously the profile was `verified`, so
    // this listing returned it.
    registerAs('civil');

    $body = $this->getJson('/api/kontraktor')->assertStatus(200)->getContent();

    $suffix = User::orderByDesc('id')->value('username');
    $name = User::orderByDesc('id')->value('name');

    expect($body)->not->toContain('New civil')
        ->and($body)->not->toContain($suffix);
});

it('leaves an ordinary client registration without a professional profile', function () {
    registerAs('user');

    expect(Kontraktor::count())->toBe(0);
});