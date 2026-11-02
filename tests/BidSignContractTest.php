<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\Project;
use App\Models\ProjectDocument;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Signing binds the plan and returns the bare bid
|--------------------------------------------------------------------------
|
| Regression suite for the shape of the S2 contract-signing endpoints:
|
| 1. `signContract` answers the FLAT bid (33 legacy columns, no message
|    wrapper, no nested relations) — its tail reads
|    `return response()->json(['message' => ..., 'bid' => $bid])`, but the
|    method opens with `return DB::transaction(...)`, so the wrapper and
|    the SPK-draft call below it are dead code that never runs. The port
|    matches the live oracle, not the dead text; this test pins the live
|    shape so a future restart that changes it fails loudly instead of
|    silently diverging the Go handler.
| 2. Signing mints termins with the model-hook retention split (5% held,
|    net exact), links milestones to the role profile, and stores the
|    signature bytes at the deterministic bid-timestamp path.
| 3. `clientSignContract` answers message+bid, flips both rows to
|    awaiting_payment, and writes the immutable snapshot (file + verified
|    documents row).
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function signOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "sown_$tag" . uniqid(),
        'email' => "sown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function signArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "sa_$tag" . uniqid(),
        'email' => "sa_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    Arsitek::create([
        'user_id' => $user->id, 'nama' => "Studio $tag",
        'verification_status' => 'verified',
    ]);

    return $user;
}

function signProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "Sign Job $tag", 'user_id' => $owner->id,
        'budget' => 400_000_000, 'status' => 'open',
        'target_role' => 'both',
    ]);
}

function signBid(Project $project, User $pro): BidArsitek
{
    return BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $pro->arsitek->id,
        'price' => 10_000_000, 'proposal' => 'Draw it.',
        'status' => 'contract_pending', 'offered_by_id' => $pro->id,
        'fee_agreed_at' => now(),
    ]);
}

function signBody(array $extra = []): array
{
    return array_merge([
        'bid_type' => 'arsitek',
        'termins' => [
            ['label' => 'DP', 'percentage' => 60, 'amount' => 6_000_000],
            ['label' => 'Pelunasan', 'percentage' => 40, 'amount' => 4_000_000],
        ],
        'bank_type' => 'BCA',
        'bank_account_no' => '12345678',
        'bank_account_name' => 'Studio',
    ], $extra);
}

it('signs a contract with the flat bid envelope and a retention split', function () {
    $owner = signOwner('flat');
    $pro = signArchitect('flat');
    $project = signProject($owner, 'flat');
    $bid = signBid($project, $pro);

    $response = $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/bids/{$bid->id}/sign-contract", signBody())
        ->assertStatus(200);

    // Flat bid: no message wrapper, no nested relations.
    expect($response->json())->not->toHaveKey('message');
    expect($response->json())->not->toHaveKey('bid');
    expect($response->json('status'))->toBe('contract_pending');

    $termins = $project->fresh()->paymentTermins()->where('role_type', 'arsitek')->orderBy('id')->get();
    expect($termins)->toHaveCount(2);
    expect((float) $termins[0]->retention_amount)->toBe(300000.0);
    expect((float) $termins[0]->net_amount)->toBe(5700000.0);
    expect($termins[0]->recipient_id)->toBe($pro->id);

    // No SPK draft row: the draft call is dead code below the
    // transaction's return, and the live oracle creates nothing.
    expect(
        ProjectDocument::where('project_id', $project->id)->where('category', 'spk')->exists()
    )->toBeFalse();

    // Bank details land on the signer's own user row.
    expect(User::find($pro->id)->bank_account_number)->toBe('12345678');
});

it('counter-signs with message plus bid and a snapshot', function () {
    $owner = signOwner('cs');
    $pro = signArchitect('cs');
    $project = signProject($owner, 'cs');
    $bid = signBid($project, $pro);

    $sig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/bids/{$bid->id}/sign-contract", signBody(['signature' => $sig]))
        ->assertStatus(200);

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/bids/{$bid->id}/client-sign-contract", [
            'bid_type' => 'arsitek', 'signature' => $sig,
        ])
        ->assertStatus(200);

    expect($response->json('message'))->toBe('Contract signed successfully! Awaiting payment verification.');
    expect($response->json('bid.status'))->toBe('awaiting_payment');
    expect($response->json('bid'))->toHaveKey('arsitek');
    expect($project->fresh()->status)->toBe('awaiting_payment');

    $doc = ProjectDocument::where('project_id', $project->id)->where('category', 'spk')->first();
    expect($doc)->not->toBeNull();
    expect($doc->status)->toBe('verified');
    expect(Storage::disk(\App\Support\Vault::disk())->exists($doc->file_path))->toBeTrue();

    // Vault files are test artifacts: remove them, the DB rolls back.
    Storage::disk(\App\Support\Vault::disk())->delete($doc->file_path);
    $ts = $bid->fresh()->created_at->timestamp;
    Storage::disk(\App\Support\Vault::disk())->delete("contracts/project_{$project->id}/signatures/signature_arsitek_{$bid->id}_{$ts}.png");
    Storage::disk(\App\Support\Vault::disk())->delete("contracts/project_{$project->id}/signatures/signature_arsitek_{$bid->id}_{$ts}_client.png");
});
