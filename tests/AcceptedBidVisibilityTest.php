<?php

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

/*
|--------------------------------------------------------------------------
| The accepted bid obeys the same visibility rule as every other bid
|--------------------------------------------------------------------------
|
| Regression suite for the audit finding that the seven `accepted_*_bid`
| blocks bypassed `visibleBids()`.
|
| THE VECTOR
| ----------
| `ProjectResource` has two ways of showing a bid:
|
|   1. the `bids_arsitek` / `bids_kontraktor` / ... blocks, which go through
|      `visibleBids()` — the gate that says "owner / assigned PM / admin sees
|      every bid; the bidder sees their own; anyone else sees none";
|
|   2. the seven `accepted_*_bid` blocks, which read the relation DIRECTLY:
|
|          $this->bidsKontraktor->first(fn ($b) => in_array($b->status, [...]))
|
| The two disagreed, and the direct read won. `GET /api/projects?feed=true
| &with_bids=true` eager-loads ALL SEVEN bid relations, so ANY authenticated
| user could read the hired professional's negotiated terms:
|
|   price / calculated_total   the fee
|   proposal                   the full pitch
|   scopes / deliverables      the scope of work
|   proposed_team              THE CONTRACTOR'S OWN STAFF, BY NAME
|
| and, for a notary, the hired notary's service catalogue.
|
| That is a competitor's commercial terms and a third party's personal data,
| served to anyone who asked for it — a direct regression of the CRITICAL that
| `visibleBids()` was written to close, in the same resource, three hundred
| lines away.
|
| THE RULE NOW
|   The accepted bid is not a separate door. It is the same bid, selected out
|   of the same visible set.
|
*/

uses(Tests\TestCase::class);

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function acceptedBidUser(string $roleType, string $tag): User
{
    $user = User::create([
        'name' => ucfirst($roleType)." {$tag}",
        'username' => "u_{$tag}".uniqid(),
        'email' => "e_{$tag}".uniqid().'@example.test',
        'password' => Hash::make('password123'),
        'role_type' => $roleType,
    ]);

    match ($roleType) {
        'arsitek' => Arsitek::create([
            'user_id' => $user->id,
            'nama' => "Studio {$tag}",
            'verification_status' => 'verified',
        ]),
        'kontraktor' => Kontraktor::create([
            'user_id' => $user->id,
            'nama' => "Kontraktor {$tag}",
            'nama_perusahaan' => "PT {$tag}",
            'verification_status' => 'verified',
        ]),
    };

    return $user;
}

function acceptedBidOwner(string $tag): User
{
    return User::create([
        'name' => "Owner {$tag}",
        'username' => "own_{$tag}".uniqid(),
        'email' => "own_{$tag}".uniqid().'@example.test',
        'password' => Hash::make('password123'),
        'role_type' => 'user',
    ]);
}

/**
 * A project with a CONTRACTED contractor, and nobody else hired.
 *
 * `selected_kontraktor_id` is set, because that is what a contracted project
 * looks like — and because it is how the hired contractor finds the project in
 * the default listing (`ProjectController::index()` scopes a contractor's list
 * to `selected_kontraktor_id = <their profile id>`).
 */
function contractedProject(string $tag, User $hired): array
{
    $owner = acceptedBidOwner($tag);

    $project = Project::create([
        'title' => "Contracted {$tag}",
        'user_id' => $owner->id,
        'budget' => 500_000_000,
        'status' => 'in_progress',
        'target_role' => 'both',
        'published_bidding_roles' => ['arsitek', 'kontraktor'],
        'selected_kontraktor_id' => $hired->kontraktor->id,
    ]);

    return [$owner, $project];
}

function placeContractorBid(Project $project, User $kontraktor, string $marker): void
{
    \App\Models\BidKontraktor::create([
        'project_id' => $project->id,
        'kontraktor_id' => $kontraktor->kontraktor->id,
        'price' => 77_000_000,
        'calculated_total' => 77_000_000,
        'fee_type' => 'fixed',
        'status' => 'accepted',
        'proposal' => "MARKER {$marker}: the contractor's full pitch",
        'scopes' => ["MARKER {$marker}-SCOPE: the scope of work"],
        'deliverables' => ["MARKER {$marker}-DELIVERABLE: the deliverables"],
        'proposed_team' => [
            ['name' => "MARKER {$marker}-STAFF: the contractor's own site manager"],
        ],
    ]);
}

/**
 * The row for `$project` as `$viewer` sees it on the discovery board.
 */
function acceptedBidRow(User $viewer, Project $project): array
{
    $rows = test()->actingAs($viewer)
        ->getJson('/api/projects?feed=true&with_bids=true')
        ->assertStatus(200)
        ->json('data') ?? [];

    foreach ($rows as $row) {
        if ((int) ($row['id'] ?? 0) === (int) $project->id) {
            return $row;
        }
    }

    // Guard against a vacuous pass: the assertions below are about ABSENCE,
    // which would also hold if the project were simply missing.
    expect($rows)->toContain(fn ($r) => (int) ($r['id'] ?? 0) === (int) $project->id);

    return [];
}

it('does not hand a rival the accepted bid\'s commercial terms', function () {
    $hired = acceptedBidUser('kontraktor', 'acc1');
    [, $project] = contractedProject('acc1', $hired);
    $rival = acceptedBidUser('arsitek', 'acc1');

    placeContractorBid($project, $hired, 'RIVAL');

    $row = acceptedBidRow($rival, $project);

    // The rival is an architect. The accepted bid is a CONTRACTOR's.
    expect($row['accepted_kontraktor_bid'] ?? null)->toBeNull();
});

it('does not leak the accepted bid\'s fee, pitch, scope or team to a rival', function () {
    $hired = acceptedBidUser('kontraktor', 'acc2');
    [, $project] = contractedProject('acc2', $hired);
    $rival = acceptedBidUser('arsitek', 'acc2');

    placeContractorBid($project, $hired, 'RIVAL');

    $encoded = json_encode(acceptedBidRow($rival, $project));

    expect($encoded)->not->toContain('MARKER RIVAL')
        ->and($encoded)->not->toContain('77000000')
        ->and($encoded)->not->toContain('MARKER RIVAL-STAFF');
});

it('shows the OWNER the accepted bid, because they are the one paying it', function () {
    $hired = acceptedBidUser('kontraktor', 'acc3');
    [$owner, $project] = contractedProject('acc3', $hired);

    placeContractorBid($project, $hired, 'OWNER');

    $rows = test()->actingAs($owner)
        ->getJson('/api/projects?with_bids=true')
        ->assertStatus(200)
        ->json('data') ?? [];

    $row = null;

    foreach ($rows as $candidate) {
        if ((int) ($candidate['id'] ?? 0) === (int) $project->id) {
            $row = $candidate;
        }
    }

    expect($row)->toBeArray()
        ->and($row['accepted_kontraktor_bid']['price'] ?? null)->toBe('77000000.00')
        ->and($row['accepted_kontraktor_bid']['proposal'] ?? null)->toContain('MARKER OWNER');
});

it('shows the HIRED professional their own accepted bid', function () {
    $hired = acceptedBidUser('kontraktor', 'acc4');
    [, $project] = contractedProject('acc4', $hired);

    placeContractorBid($project, $hired, 'SELF');

    $rows = test()->actingAs($hired)
        ->getJson('/api/projects?with_bids=true')
        ->assertStatus(200)
        ->json('data') ?? [];

    $row = null;

    foreach ($rows as $candidate) {
        if ((int) ($candidate['id'] ?? 0) === (int) $project->id) {
            $row = $candidate;
        }
    }

    expect($row)->toBeArray()
        ->and($row['accepted_kontraktor_bid']['proposal'] ?? null)->toContain('MARKER SELF');
});
