<?php

use App\Models\Arsitek;
use App\Models\Project;
use App\Models\ProjectManager;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| KYC-grade fields must not escape the gate that already exists
|--------------------------------------------------------------------------
|
| Regression suite for MEDIUM audit findings, both of the same shape: a field
| classified as PII in one place and published in another, because the line next
| to it was wrapped and this one was not.
|
| 1. `company_license` and `siup_number` (six sites)
|    In ProjectResource's three bidder blocks (pm, structuralEngineer,
|    mepEngineer) these sat directly between fields that WERE gated:
|
|        'identity_number' => $this->pii($bid->pm->identity_number),
|        'npwp_number'     => $this->pii($bid->pm->npwp_number),
|        'siup_number'     => $bid->pm->siup_number,          // <-- not gated
|        'company_license' => $bid->pm->company_license,      // <-- not gated
|
|    `ProfileController` documents SIUP as KYC-grade.
|
|    NOT REACHABLE ANY MORE, and the tests prove it rather than assuming it.
|    These keys only render inside a bidder block, and
#    `ProjectResource::visibleBids()` (added with the discovery-board fix) now
|    returns a non-privileged viewer ONLY their own bids in their own role. An
#    architect asking for `bids_project_manager` gets an empty array, so the
#    ungated `siup_number` is unreachable through this route even though the line
#    is still ungated.
#
|    So this is defence-in-depth, not a closed live hole: the fields are wrapped
|    to match their neighbours, because the next reader of that block would
|    reasonably assume the whole thing is gated (it very nearly reads as gated --
|    two of the four surrounding lines ARE). The owner still sees them, which is
|    correct: they run vendor verification. A test pins both directions.
|
| 2. `users.unique_code` -- THE ONE THAT WAS LIVE
|    Classified in `User::$hidden`, returned verbatim by
#    `GET /api/firm-members/profile/{ownerId}`, whose `{ownerId}` is enumerable --
|    so any authenticated user could walk the architect and contractor population
|    reading their 6-character firm lookup codes. Nothing downstream needs it
|    there: `browseFirmOwners()` in the same controller resolves the code only
|    for the authenticated caller searching BY it.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function piiUser(string $roleType, string $tag): User
{
    $user = User::create([
        'name' => "$roleType $tag", 'username' => "u_$tag" . uniqid(),
        'email' => "e_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $roleType,
    ]);

    match ($roleType) {
        'arsitek' => Arsitek::create([
            'user_id' => $user->id, 'nama' => 'Studio', 'verification_status' => 'verified',
        ]),
        'project_manager' => ProjectManager::create([
            'user_id' => $user->id, 'nama' => 'PM Co', 'verification_status' => 'verified',
        ]),
        'structural' => StructuralEngineer::create([
            'user_id' => $user->id, 'nama' => 'SE', 'verification_status' => 'verified',
        ]),
        'kontraktor' => \App\Models\Kontraktor::create([
            'user_id' => $user->id, 'nama' => 'Kontraktor', 'verification_status' => 'verified',
        ]),
    };

    return $user;
}

function piiProject(string $tag, array $columns = []): array
{
    $owner = User::create([
        'name' => "Owner $tag", 'username' => "own_$tag" . uniqid(),
        'email' => "own_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    $project = Project::create(array_merge([
        'title' => "Job $tag", 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'open',
    ], $columns));

    return [$owner, $project];
}

// ---------------------------------------------------------------------------
// 1. ProjectResource bidder blocks
// ---------------------------------------------------------------------------

it('hides the PM\'s SIUP and company licence from a competing bidder', function () {
    $pm = piiUser('project_manager', 'pmhide');
    $pm->project_manager->forceFill([
        'siup_number' => 'SIUP-DO-NOT-LEAK',
        'company_license' => 'LIC-DO-NOT-LEAK',
    ])->save();

    $architect = piiUser('arsitek', 'viewer');
    [, $project] = piiProject('pm1', ['pm_id' => $pm->id]);

    \App\Models\BidProjectManager::create([
        'project_id' => $project->id, 'pm_id' => $pm->project_manager->id,
        'price' => 10_000_000, 'calculated_total' => 10_000_000,
        'fee_type' => 'fixed', 'status' => 'pending', 'proposal' => 'Structural proposal',
    ]);

    \App\Models\BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $architect->arsitek->id,
        'price' => 20_000_000, 'calculated_total' => 20_000_000,
        'fee_type' => 'fixed', 'status' => 'pending',
    ]);

    $body = $this->actingAs($architect)
        ->getJson("/api/projects/{$project->id}/bids")
        ->assertStatus(200)
        ->getContent();

    expect($body)->not->toContain('SIUP-DO-NOT-LEAK')
        ->and($body)->not->toContain('LIC-DO-NOT-LEAK');
});

it('shows the PM\'s SIUP to the OWNER, who is verifying the vendor', function () {
    // The gate must not become a blanket denial: the owner runs vendor
    // verification, so they are the one who needs these numbers.
    [$owner, $project] = piiProject('pm2');

    $pm = piiUser('project_manager', 'pmok');
    $pm->project_manager->forceFill([
        'siup_number' => 'SIUP-OWNER-VISIBLE',
        'company_license' => 'LIC-OWNER-VISIBLE',
    ])->save();

    $project->update(['pm_id' => $pm->id]);

    \App\Models\BidProjectManager::create([
        'project_id' => $project->id, 'pm_id' => $pm->project_manager->id,
        'price' => 10_000_000, 'calculated_total' => 10_000_000,
        'fee_type' => 'fixed', 'status' => 'pending', 'proposal' => 'PM proposal',
    ]);

    $body = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/bids")
        ->assertStatus(200)
        ->getContent();

    expect($body)->toContain('SIUP-OWNER-VISIBLE')
        ->and($body)->toContain('LIC-OWNER-VISIBLE');
});

it('does not expose ANY licence field to a competing bidder, not even an empty one', function () {
    // Guards against the assertions above passing vacuously: the architect must
    // actually receive a bidder block for their OWN role, proving the response
    // shape reaches them, so the absence of `siup_number` is a real gate and not
    // "this route returned nothing".
    $pm = piiUser('project_manager', 'shape');
    $architect = piiUser('arsitek', 'shapeviewer');

    [, $project] = piiProject('shape1', ['pm_id' => $pm->id]);

    $pm->project_manager->forceFill(['siup_number' => 'SIUP-SHAPE'])->save();

    \App\Models\BidProjectManager::create([
        'project_id' => $project->id, 'pm_id' => $pm->project_manager->id,
        'price' => 10_000_000, 'calculated_total' => 10_000_000,
        'fee_type' => 'fixed', 'status' => 'pending', 'proposal' => 'PM proposal',
    ]);

    \App\Models\BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $architect->arsitek->id,
        'price' => 20_000_000, 'calculated_total' => 20_000_000,
        'fee_type' => 'fixed', 'status' => 'pending', 'proposal' => 'MY OWN PROPOSAL',
    ]);

    $body = $this->actingAs($architect)
        ->getJson("/api/projects/{$project->id}/bids")
        ->assertStatus(200)
        ->getContent();

    // The architect DOES receive their own bidder block.
    expect($body)->toContain('MY OWN PROPOSAL');

    // ...and no counterparty licence data anywhere.
    expect($body)->not->toContain('SIUP-SHAPE')
        ->and($body)->not->toContain('siup_number')
        ->and($body)->not->toContain('company_license');
});

it('never returns a licence field to an ANONYMOUS viewer', function () {
    $pm = piiUser('project_manager', 'pmanon');
    $pm->project_manager->forceFill(['siup_number' => 'SIUP-ANON-SECRET'])->save();

    [, $project] = piiProject('anon1', ['pm_id' => $pm->id]);

    \App\Models\BidProjectManager::create([
        'project_id' => $project->id, 'pm_id' => $pm->project_manager->id,
        'price' => 10_000_000, 'calculated_total' => 10_000_000,
        'fee_type' => 'fixed', 'status' => 'pending', 'proposal' => 'PM proposal',
    ]);

    $body = $this->getJson("/api/projects/{$project->id}/bids")
        ->assertStatus(401);

    expect($body->getContent())->not->toContain('SIUP-ANON-SECRET');
});

// ---------------------------------------------------------------------------
// 2. users.unique_code
// ---------------------------------------------------------------------------

it('does not hand out a firm owner\'s unique_code to another user', function () {
    $owner = piiUser('arsitek', 'firmowner');

    $seeker = piiUser('kontraktor', 'seeker');

    $body = $this->actingAs($seeker)
        ->getJson("/api/firm-members/profile/{$owner->id}")
        ->assertStatus(200)
        ->getContent();

    // `User::$hidden` classifies it as PII.
    expect($owner->unique_code)->not->toBeNull()
        ->and($body)->not->toContain((string) $owner->unique_code);
});

it('does not expose unique_code when enumerating firms', function () {
    foreach (range(1, 3) as $i) {
        piiUser('arsitek', "enum$i");
    }

    $seeker = piiUser('kontraktor', 'enumseeker');

    $body = $this->actingAs($seeker)
        ->getJson('/api/firm-members/browse-owners')
        ->assertStatus(200)
        ->getContent();

    $codes = User::where('role_type', 'arsitek')->pluck('unique_code')->filter()->all();

    foreach ($codes as $code) {
        expect($body)->not->toContain((string) $code);
    }
});

it('still returns the firm owner\'s public identity', function () {
    // Guard against over-correction: the endpoint's purpose is a firm card.
    $owner = piiUser('arsitek', 'card');
    $seeker = piiUser('kontraktor', 'cardseeker');

    $payload = $this->actingAs($seeker)
        ->getJson("/api/firm-members/profile/{$owner->id}")
        ->assertStatus(200)
        ->json();

    expect($payload['owner']['id'])->toBe($owner->id)
        ->and($payload['owner']['name'])->toBe($owner->name)
        ->and($payload['owner']['role_type'])->toBe('arsitek');
});