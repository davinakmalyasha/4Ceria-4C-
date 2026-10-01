<?php

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\TeamMember;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| The public directory must publish only what it can defend
|--------------------------------------------------------------------------
|
| Regression suite for the second CRITICAL finding of the final security audit.
|
| THE LEAK
| --------
| `GET /api/arsitek` (and six siblings) are UNAUTHENTICATED. They serialised the
| raw Eloquent models through a DENYLIST sanitiser that hid identity numbers,
| NPWP/SIUP document paths and bank details — on the professional and on the
| nested user.
|
| A denylist cannot protect a RELATION, and two relations were eager-loaded and
| therefore never touched by it:
|
|   `projects`      a FULL `Project` row per job the professional holds. `Project`
|                   has no `$hidden`, so this published, to any anonymous caller:
|                     budget               the owner's escrow ceiling
|                     payment_instructions "Bank: … | No. Rekening: … | A/N: …"
|                     share_token          a live unauthenticated
|                                           /api/brief/{token} link — which makes
|                                           the owner's whole construction
|                                           brief, document checklist and Q&A
|                                           readable
|                     legal_requirements   SHM / AJB / KTP / credit checklist
|                     construction_details the RAB cost estimate, which
|                                           getPublicBrief() strips deliberately
|                     negotiated_fee, user_id, pm_id, selected_*_id
|
|   `teamMembers`   `TeamMember` has no `$hidden` and its fillable list includes
|                   name, phone and email, so every architect's and
|                   contractor's THIRD-PARTY STAFF were published.
|
| THE SECOND HALF OF AN EARLIER FIX
| ----------------------------------
| `AuthController` was fixed so registration creates profiles with
| `verification_status => 'pending'`. But the LISTINGS never filtered on it, so
| anyone could still register, become publicly listable and be shortlisted. Both
| halves are required; only one had been done.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();

    // The controller caches directory listings for 600s. A warm cache would make
    // every assertion below meaningless.
    Cache::flush();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
    Cache::flush();
});

function publicOwner(string $tag): User
{
    return User::create([
        'name' => "Owner {$tag}", 'username' => "own_$tag" . uniqid(),
        'email' => "own_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function verifiedArsitek(string $tag): array
{
    $owner = publicOwner($tag);

    $user = User::create([
        'name' => "Arsitek {$tag}", 'username' => "ar_$tag" . uniqid(),
        'email' => "ar_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    // Contact lives on `phone_user` via the `phoneNumber` hasMany relation —
    // there is NO `users.phone` column. A directory listing is legitimate on
    // exactly this field: being able to reach a professional is the product.
    \App\Models\PhoneNumber::create([
        'id_user' => $user->id, 'contact' => '081200000001',
    ]);

    $profile = Arsitek::create([
        'user_id' => $user->id, 'nama' => "Studio {$tag}",
        // `arsiteks` has `company_name`; only `kontraktors` also has
        // `nama_perusahaan`. The resource maps either onto both output keys so
        // the SPA's field name does not have to know which table it came from.
        'company_name' => "Studio {$tag} PT",
        'spesialisasi' => 'Arsitek Rumah',
        'lokasi' => 'Jakarta Selatan',
        'rate_harga' => 750_000, 'pengalaman_tahun' => 8,
        'no_telp' => '081200000001',
        'verification_status' => 'verified',
        'identity_number' => '3171010101900001',
        'npwp' => 'npwp/private/path.pdf',
        'file_portofolio' => 'kyc/ktp-scan.pdf',
    ]);

    // A project the architect is hired on, carrying everything that must not leak.
    $project = Project::create([
        'title' => "Confidential Job {$tag}",
        'user_id' => $owner->id,
        'budget' => 850_000_000,
        'status' => 'in_progress',
        'selected_arsitek_id' => $profile->id,
        'payment_instructions' => 'Bank: BCA | No. Rekening: 1234567890 | A/N: John Doe',
        'negotiated_fee' => 45_000_000,
        // Opt-in via POST /api/projects/{id}/share, not set on create — so the
        // fixture has to mint one, otherwise this test would pass vacuously
        // against a NULL column.
        'share_token' => bin2hex(random_bytes(12)),
        'legal_requirements' => ['shm_shgb', 'ajb_deed', 'ktp', 'credit_agreement'],
        'construction_details' => ['rab' => ['foundation' => 320_000_000]],
    ]);

    // Third-party staff, which must not be published either.
    TeamMember::create([
        'owner_user_id' => $user->id, 'owner_role' => 'arsitek',
        'name' => "Assistant {$tag}", 'phone' => '081299999999',
        'email' => "assistant_$tag@example.test", 'role_title' => 'Draftsperson',
    ]);

    return [$owner, $user, $profile, $project];
}

it('does not leak the escrow ceiling to an anonymous caller', function () {
    [, , , $project] = verifiedArsitek('p1');

    $res = $this->getJson('/api/arsitek')->assertStatus(200);

    $body = $res->getContent();

    expect($body)->not->toContain((string) $project->budget)
        ->and($body)->not->toContain('budget');
});

it('does not leak the payment instructions', function () {
    verifiedArsitek('p2');

    $body = $this->getJson('/api/arsitek')->assertStatus(200)->getContent();

    expect($body)->not->toContain('payment_instructions')
        ->and($body)->not->toContain('1234567890');
});

it('does not leak the share token, which is a live unauthenticated brief link', function () {
    [, , , $project] = verifiedArsitek('p3');

    $token = $project->share_token;

    // Guard: the fixture must actually have a token for this to mean anything.
    expect($token)->not->toBeNull();

    $body = $this->getJson('/api/arsitek')->assertStatus(200)->getContent();

    expect($body)->not->toContain($token)
        ->and($body)->not->toContain('share_token');
});

it('does not leak the property and financing posture', function () {
    verifiedArsitek('p4');

    $body = $this->getJson('/api/arsitek')->assertStatus(200)->getContent();

    expect($body)->not->toContain('legal_requirements')
        ->and($body)->not->toContain('shm_shgb')
        ->and($body)->not->toContain('credit_agreement');
});

it('does not leak the RAB cost estimate from construction_details', function () {
    verifiedArsitek('p5');

    $body = $this->getJson('/api/arsitek')->assertStatus(200)->getContent();

    expect($body)->not->toContain('construction_details')
        ->and($body)->not->toContain('foundation');
});

it('does not leak the negotiated fee or the owner relationship', function () {
    verifiedArsitek('p6');

    $body = $this->getJson('/api/arsitek')->assertStatus(200)->getContent();

    expect($body)->not->toContain('negotiated_fee')
        ->and($body)->not->toContain('selected_arsitek_id');
});

it('does not leak third-party staff, whose names and phones are not the listing\'s business', function () {
    verifiedArsitek('p7');

    $body = $this->getJson('/api/arsitek')->assertStatus(200)->getContent();

    expect($body)->not->toContain('081299999999')
        ->and($body)->not->toContain('team_members')
        ->and($body)->not->toContain('Draftsperson');
});

it('does not leak KYC document paths or government identity numbers', function () {
    verifiedArsitek('p8');

    $body = $this->getJson('/api/arsitek')->assertStatus(200)->getContent();

    expect($body)->not->toContain('3171010101900001')
        ->and($body)->not->toContain('kyc/ktp-scan.pdf')
        ->and($body)->not->toContain('npwp/private/path.pdf');
});

it('does not leak the user email or any bank detail', function () {
    [, $user] = verifiedArsitek('p9');

    $body = $this->getJson('/api/arsitek')->assertStatus(200)->getContent();

    expect($body)->not->toContain($user->email)
        ->and($body)->not->toContain('bank_account_number');
});

it('still publishes what a client needs in order to choose and contact', function () {
    [, , $profile] = verifiedArsitek('p10');

    $res = $this->getJson('/api/arsitek')->assertStatus(200);

    $first = collect($res->json('data'))->firstWhere('id', $profile->id);

    expect($first)->not->toBeNull()
        ->and($first['nama'])->toBe('Studio p10')
        ->and($first['spesialisasi'])->toBe('Arsitek Rumah')
        ->and($first['lokasi'])->toBe('Jakarta Selatan')
        ->and((float) $first['rate_harga'])->toBe(750_000.0)
        ->and($first['is_verified'])->toBeTrue()
        // Contact is the point of a directory, published deliberately.
        ->and($first['no_telp'])->toBe('081200000001')
        ->and($first['user']['phoneNumber'][0]['contact'])->toBe('081200000001');
});

it('publishes a project COUNT rather than the projects themselves', function () {
    verifiedArsitek('p11');

    $body = $this->getJson('/api/arsitek')->assertStatus(200)->getContent();

    // withCount gives a number; a number cannot leak a column.
    expect($body)->toContain('projects_count');
});

it('excludes an UNVERIFIED profile from the directory', function () {
    // The second half of the AuthController fix: profiles are created `pending`,
    // but the listing never filtered, so anyone could register and appear.
    $user = User::create([
        'name' => 'Pending Person', 'username' => 'pend' . uniqid(),
        'email' => 'pend' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create([
        'user_id' => $user->id, 'nama' => 'Pending Studio',
        'verification_status' => 'pending',
    ]);

    $ids = collect($this->getJson('/api/arsitek')->assertStatus(200)->json('data'))
        ->pluck('id');

    expect($ids)->not->toContain($profile->id);
});

it('applies the same filter to every directory', function () {
    $user = User::create([
        'name' => 'Pending Kontraktor', 'username' => 'pk' . uniqid(),
        'email' => 'pk' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    $kontraktor = Kontraktor::create([
        'user_id' => $user->id, 'nama' => 'Pending Kontraktor',
        'verification_status' => 'pending',
    ]);

    $ids = collect($this->getJson('/api/kontraktor')->assertStatus(200)->json('data'))
        ->pluck('id');

    expect($ids)->not->toContain($kontraktor->id);
});

it('requires no authentication, because the directory is public', function () {
    // Guards against the fix over-correcting into requiring a session, which
    // would break the browse-before-signup funnel.
    verifiedArsitek('p12');

    $this->getJson('/api/arsitek')->assertStatus(200);
});