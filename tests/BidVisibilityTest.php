<?php

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| A professional may not read a RIVAL's bid on the discovery board
|--------------------------------------------------------------------------
|
| Regression suite for a CRITICAL audit finding.
|
| THE VECTOR
| ----------
| ProjectController::index() scopes ONE bid relation to the viewer -- the one for
| the viewer's own role:
|
|     if ($role === 'arsitek' && $user->arsitek) {
|         $relations['bidsArsitek'] = fn ($q) => $q->where('arsitek_id', $user->arsitek->id);
|     } elseif ($role === 'kontraktor' && $user->kontraktor) { ... }
|
| The other SIX relation keys are simply absent. And `?with_bids=true` then runs,
| BEFORE any feed scoping:
|
|     $query->with([
|         'bidsArsitek.arsitek.user.phoneNumber',
|         'bidsKontraktor.kontraktor.user.phoneNumber',
|         'bidsNotaris.notaris.user.phoneNumber',
#         ...all seven...
#     ]);
|
| So for an architect on the board, `bids_kontraktor`, `bids_notaris`,
| `bids_interior`, `bids_project_manager`, `bids_structural` and `bids_mep` are
| loaded with EVERY professional's bid on every project they can see. Per bid:
#
#   price / calculated_total    the rival's fee
#   proposal                    their full pitch
#   negotiation_logs            the OWNER's private fee-negotiation notes with
#                               the rival, including `changes_detected`
#   payment_proof_path          a presigned URL for the rival's BANK TRANSFER
#                               RECEIPT
#   verification_notes          the owner's internal assessment
#   proposed_termins / _milestones / _team   their commercial schedule and team
#   pro_signature_url / client_signature_url   both parties' signatures
#   bidder.phone                their phone number
#
# None of those blocks was gated; `isPrivilegedViewer()` guarded `email` and sat
# right beside the unguarded commercial fields.
|
# THE RULE
#   owner / assigned PM / admin  -> every bid (they must, to shortlist)
#   the bidder themselves        -> only their own bid, in their own role
#   anyone else                  -> none
#
# Bid COUNTS stay visible via the existing withCount calls, because "3
# architects have bid" is exactly what a professional needs from a board.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function bidBoardUser(string $roleType, string $tag): User
{
    $user = User::create([
        'name' => ucfirst($roleType) . " $tag", 'username' => "u_$tag" . uniqid(),
        'email' => "e_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $roleType,
    ]);

    match ($roleType) {
        'arsitek' => Arsitek::create([
            'user_id' => $user->id, 'nama' => "Studio $tag",
            'no_telp' => '08120000' . substr(md5($tag), 0, 5),
            'verification_status' => 'verified',
        ]),
        // `kontraktors` has no `no_telp` column at all; the Resource reads the
        // contact from the `phone_user` relation via `user.phoneNumber`, which is
        // also what `with_bids` eager-loads.
        'kontraktor' => Kontraktor::create([
            'user_id' => $user->id, 'nama' => "Kontraktor $tag",
            'verification_status' => 'verified',
        ]),
    };

    // The contact ProjectResource renders as `bidder.phone`.
    \App\Models\PhoneNumber::create([
        'id_user' => $user->id,
        'contact' => '08130000' . substr(md5($tag), 0, 5),
    ]);

    return $user;
}

function bidBoardOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "own_$tag" . uniqid(),
        'email' => "own_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

/**
 * A project an architect can see on the board: it needs an architect, and the
 * architect must NOT have bid on it (the board hides those).
 */
function boardProject(string $tag): array
{
    $owner = bidBoardOwner($tag);

    $project = Project::create([
        'title' => "Board $tag", 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'open',
        'target_role' => 'both',
        'published_bidding_roles' => ['arsitek', 'kontraktor'],
    ]);

    return [$owner, $project];
}

function feedRow(User $viewer, Project $project): array
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

    // Guard against a vacuous pass: the tests below assert on ABSENCE, which
    // would also hold if the project were simply missing from the response.
    expect($row ?? null)->toBeArray();
    expect($rows)->toContain(fn ($r) => (int) ($r['id'] ?? 0) === (int) $project->id);

    return [];
}

function contractorBid(Project $project, User $kontraktor, float $price, string $marker): \App\Models\BidKontraktor
{
    $bid = \App\Models\BidKontraktor::create([
        'project_id' => $project->id,
        'kontraktor_id' => $kontraktor->kontraktor->id,
        'price' => $price,
        'calculated_total' => $price,
        'fee_type' => 'fixed',
        'status' => 'pending',
        'proposal' => "MARKER {$marker}: my full pitch",
    ]);

    // `negotiationLogs` is a morphMany onto BidNegotiationLog keyed by
    // (`bid_id`, `bid_type`), so the log is written directly rather than through
    // the relation.
    \App\Models\BidNegotiationLog::create([
        'bid_id' => $bid->id,
        'bid_type' => 'kontraktor',
        'user_id' => $project->user_id,
        'round_number' => 1,
        'snapshot' => ['price' => 45],
        'note' => "MARKER {$marker}-OWNERNOTE: we think 30 is too low",
        'changes_detected' => ['price' => ['from' => 45, 'to' => 30]],
    ]);

    $bid->forceFill([
        'payment_proof_path' => "receipts/{$marker}-bank-transfer.png",
        'verification_notes' => "MARKER {$marker}-ASSESSMENT",
    ])->save();

    return $bid->refresh();
}

it('hides a rival CONTRACTOR bid from an architect on the discovery board', function () {
    [$owner, $project] = boardProject('b1');

    $rival = bidBoardUser('kontraktor', 'rivalK');
    $architect = bidBoardUser('arsitek', 'viewerA');

    contractorBid($project, $rival, 41_000_000, 'RIVAL');

    $row = feedRow($architect, $project);

    expect($row['bids_kontraktor'] ?? [])->toHaveCount(0);
});

it('does not leak a rival\'s fee, pitch, owner notes or bank receipt', function () {
    [$owner, $project] = boardProject('b2');

    $rival = bidBoardUser('kontraktor', 'rivalL');
    $architect = bidBoardUser('arsitek', 'viewerB');

    contractorBid($project, $rival, 55_000_000, 'SECRET');

    $encoded = json_encode(feedRow($architect, $project));

    expect($encoded)->not->toContain('SECRET')
        ->and($encoded)->not->toContain('55000000')
        ->and($encoded)->not->toContain('bank-transfer')
        ->and($encoded)->not->toContain('OWNERNOTE')
        ->and($encoded)->not->toContain('ASSESSMENT');
});

it('does not leak a rival contractor\'s phone number', function () {
    [$owner, $project] = boardProject('b3');

    $rival = bidBoardUser('kontraktor', 'rivalM');
    $architect = bidBoardUser('arsitek', 'viewerC');

    contractorBid($project, $rival, 60_000_000, 'PHONE');

    $encoded = json_encode(feedRow($architect, $project));

    expect($encoded)->not->toContain('08130000' . substr(md5('rivalM'), 0, 5));
});

it('shows the OWNER every bid, since they must shortlist', function () {
    // Not through `feed=true` -- the board deliberately excludes the viewer's
    // OWN projects (`where('user_id', '!=', $user->id)`). The owner shortlists on
    // their own project list.
    [$owner, $project] = boardProject('b4');

    $a = bidBoardUser('kontraktor', 'bidA');
    $b = bidBoardUser('kontraktor', 'bidB');

    contractorBid($project, $a, 70_000_000, 'FIRST');
    contractorBid($project, $b, 71_000_000, 'SECOND');

    $rows = test()->actingAs($owner)
        ->getJson('/api/projects?with_bids=true')
        ->assertStatus(200)
        ->json('data') ?? [];

    $row = collect($rows)->firstWhere('id', $project->id);

    expect($row)->not->toBeNull();

    $encoded = json_encode($row);

    expect($encoded)->toContain('FIRST')
        ->and($encoded)->toContain('SECOND')
        ->and($row['bids_kontraktor'] ?? [])->toHaveCount(2);
});

it('shows an architect no bids at all in a role they do not hold', function () {
    [$owner, $project] = boardProject('b5');

    $rival = bidBoardUser('kontraktor', 'rivalN');
    $architect = bidBoardUser('arsitek', 'viewerD');

    contractorBid($project, $rival, 80_000_000, 'OTHERROLE');

    expect(feedRow($architect, $project)['bids_kontraktor'] ?? [])->toHaveCount(0);
});

it('shows a contractor their OWN bid on the board', function () {
    // The positive half of the rule: the gate must not become a blanket denial.
    // The board hides projects you have bid on, so this asserts on the project
    // payload the contractor already has access to instead.
    [$owner, $project] = boardProject('b6');

    $mine = bidBoardUser('kontraktor', 'mineP');
    $rival = bidBoardUser('kontraktor', 'rivalO');

    contractorBid($project, $mine, 90_000_000, 'MINE');
    contractorBid($project, $rival, 91_000_000, 'RIVAL');

    $row = test()->actingAs($mine)
        ->getJson("/api/projects/{$project->id}")
        ->assertStatus(200)
        ->json('data');

    $encoded = json_encode($row['bids_kontraktor'] ?? []);

    expect($row['bids_kontraktor'] ?? [])->toHaveCount(1)
        ->and($encoded)->toContain('MINE')
        ->and($encoded)->not->toContain('RIVAL');
});

it('still publishes the bid COUNT to a professional', function () {
    // "2 contractors have bid" is what a discovery board legitimately shows.
    // Only the CONTENT is sensitive.
    [$owner, $project] = boardProject('b7');

    $a = bidBoardUser('kontraktor', 'cntA');
    $b = bidBoardUser('kontraktor', 'cntB');

    contractorBid($project, $a, 95_000_000, 'ONE');
    contractorBid($project, $b, 96_000_000, 'TWO');

    $row = feedRow(bidBoardUser('arsitek', 'cntC'), $project);

    expect((int) ($row['bids_kontraktor_count'] ?? 0))->toBe(2)
        ->and($row['bids_kontraktor'] ?? [])->toHaveCount(0);
});