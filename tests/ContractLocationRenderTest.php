<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\Project;
use App\Models\User;
use App\Services\ProjectContractService;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| The contract must render for every project, including one with no location
|--------------------------------------------------------------------------
|
| Regression suite for a drift bug found while closing audit finding H4.
|
| `projects` has no `location_address` column. Reading it throws
| MissingAttributeException under `Model::shouldBeStrict(!isProduction())`, so it
| is a 500 locally and a silent null in production.
|
| The reference was fixed once in `generateSPKDraft` and left in place in the
| counter-signature snapshot builder -- which is the one that runs on the OWNER'S
| COUNTER-SIGNATURE. Because `lokasi` is nullable, that half-fix meant signing
| worked for a project with an address and 500'd for one without. A third call
| site has since been added, so this suite pins ALL of them at once rather than
| leaving the next reader to grep.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function contractProject(?string $lokasi): array
{
    $owner = User::create([
        'name' => 'Owner', 'username' => 'o' . uniqid(),
        'email' => 'o' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    $arUser = User::create([
        'name' => 'Arsitek', 'username' => 'a' . uniqid(),
        'email' => 'a' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $arsitek = Arsitek::create([
        'user_id' => $arUser->id, 'nama' => 'Studio',
        'verification_status' => 'verified',
    ]);

    $project = Project::create([
        'title' => 'Rumah Renovasi', 'user_id' => $owner->id,
        'budget' => 350_000_000, 'status' => 'in_progress',
        'selected_arsitek_id' => $arsitek->id,
        'lokasi' => $lokasi,
    ]);

    $bid = BidArsitek::create([
        'project_id' => $project->id,
        'arsitek_id' => $arsitek->id,
        'price' => 35_000_000,
        'calculated_total' => 35_000_000,
        'fee_type' => 'fixed',
        'status' => 'accepted',
    ]);

    return [$owner, $arUser, $project, $arsitek, $bid];
}

it('resolves the location from `lokasi`', function () {
    [$owner, $pro, $project, $arsitek, $bid] = contractProject('Jl. Merdeka No. 1, Jakarta');

    expect(ProjectContractService::projectLocation($project))
        ->toBe('Jl. Merdeka No. 1, Jakarta');
});

it('falls back to a readable placeholder rather than throwing when lokasi is NULL', function () {
    // The reachable state the half-fix left behind: `lokasi` is nullable.
    [$owner, $pro, $project, $arsitek, $bid] = contractProject(null);

    $location = ProjectContractService::projectLocation($project);

    expect($location)->toBeString()->not->toBeEmpty();
});

it('renders the counter-signature snapshot for a project with NO location', function () {
    [$owner, $pro, $project, $arsitek, $bid] = contractProject(null);

    // This is the builder that previously 500'd on the owner's counter-signature.
    $snapshot = app(ProjectContractService::class)
        ->storeContractSnapshot($project, $bid, 'arsitek');

    expect($snapshot)->not->toBeNull();
});

it('renders the counter-signature snapshot for a project WITH a location', function () {
    [$owner, $pro, $project, $arsitek, $bid] = contractProject('Jl. Merdeka No. 1, Jakarta');

    $snapshot = app(ProjectContractService::class)
        ->storeContractSnapshot($project, $bid, 'arsitek');

    expect($snapshot)->not->toBeNull();
});

it('renders the SPKD draft for a project with NO location', function () {
    [$owner, $pro, $project, $arsitek, $bid] = contractProject(null);

    // `generateSPKDraft` records `uploader_id` from the authenticated actor, so this
// path only exists for a signed-in caller.
$this->actingAs($owner);

    $draft = app(ProjectContractService::class)->generateSPKDraft($project, $bid, 'arsitek');

    expect($draft)->not->toBeNull();
});

it('embeds the resolved location in PASAL 1 for both cases', function () {
    foreach ([null, 'Jl. Merdeka No. 1, Jakarta'] as $lokasi) {
        [$owner, $pro, $project, $arsitek, $bid] = contractProject($lokasi);

        // `storeContractSnapshot` returns the ProjectDocument row; the article
        // text is what it wrote to the private disk as JSON.
        $document = app(ProjectContractService::class)
            ->storeContractSnapshot($project, $bid, 'arsitek');

        expect($document)->not->toBeNull();

        $stored = json_decode(
            \Illuminate\Support\Facades\Storage::disk(\App\Support\Vault::disk())
                ->get($document->file_path),
            true
        );

        $articles = $stored['articles'] ?? [];

        $pasal1 = collect($articles)
            ->first(fn ($a) => str_contains((string) ($a['title'] ?? ''), 'PASAL 1'));

        expect($pasal1)->not->toBeNull()
            ->and($pasal1['content'])
            ->toContain(ProjectContractService::projectLocation($project))
            // Never an empty gap in a binding clause.
            ->not->toContain('berletak di  dengan');
    }
});

it('records the resolved location on the snapshot header too', function () {
    [$owner, $pro, $project, $arsitek, $bid] = contractProject('Jl. Merdeka No. 1, Jakarta');

    $document = app(ProjectContractService::class)
        ->storeContractSnapshot($project, $bid, 'arsitek');

    $stored = json_decode(
        \Illuminate\Support\Facades\Storage::disk(\App\Support\Vault::disk())
            ->get($document->file_path),
        true
    );

    expect($stored['project']['location'] ?? null)
        ->toBe(ProjectContractService::projectLocation($project));
});

it('writes the contract to the CONFIGURED vault disk, not a hardcoded one', function () {
    // The reason the first version of this suite could not run at all.
    [$owner, $pro, $project, $arsitek, $bid] = contractProject('Jl. Merdeka No. 1');

    $document = app(ProjectContractService::class)
        ->storeContractSnapshot($project, $bid, 'arsitek');

    expect(\App\Support\Vault::disk())
        ->toBe(config('filesystems.vault_disk', 'railway'));

    expect(\Illuminate\Support\Facades\Storage::disk(\App\Support\Vault::disk())
        ->exists($document->file_path))->toBeTrue();
});