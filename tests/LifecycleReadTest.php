<?php

use App\Models\Arsitek;
use App\Models\BidNotaris;
use App\Models\NotarisProfile;
use App\Models\Project;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Lifecycle reads: BAST certificate and the legal/financial summary
|--------------------------------------------------------------------------
|
| Regression suite for the two S2 reads:
| - BAST is participant-gated and compiles the certificate off the
|   project, the hired rows and the configured warranty window.
| - legal-financials admits only the owner, the hired notary and the
|   assigned PM, and answers the escrow figures from the ledger sums
|   (paid/committed) plus the notary schedule without the milestone key.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function lifeOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "lown_$tag" . uniqid(),
        'email' => "lown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function lifeNotary(string $tag): User
{
    $user = User::create([
        'name' => "Notaris $tag", 'username' => "ln_$tag" . uniqid(),
        'email' => "ln_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'notaris',
    ]);

    NotarisProfile::create(['user_id' => $user->id, 'nama' => "Notaris $tag"]);

    return $user;
}

function lifeProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "Life Job $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open', 'target_role' => 'both',
        'lokasi' => 'Bekasi, Jawa Barat',
    ]);
}

it('compiles the BAST certificate for participants only', function () {
    $owner = lifeOwner('bast');
    $stranger = lifeOwner('outsider');
    $project = lifeProject($owner, 'bast');

    $this->actingAs($stranger)
        ->getJson("/api/projects/{$project->id}/bast")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    $response = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/bast")
        ->assertStatus(200);

    $data = $response->json('data');
    expect($data['document_number'])->toMatch('#^BAST/\d{1,}/\d{4}/\d{2}/\d{2}$#');
    expect($data['project']['title'])->toBe('Life Job bast');
    expect($data['project']['location'])->toBe('Bekasi, Jawa Barat');
    expect($data['parties']['owner']['name'])->toBe($owner->name);
    expect($data['parties']['contractor']['name'])->toBe('N/A');
    expect($data['parties']['pm']['name'])->toBe('N/A');
    expect($data['milestones']['completion_date'])->toBe('N/A');
    expect($data['milestones']['warranty_expiry'])->toBe('N/A');
    expect($data['legal_clauses'])->toHaveCount(3);
    expect($data['legal_clauses'][1])->toContain('180 hari (6 bulan)');
});

it('summarises the ledger for the owner and the hired notary only', function () {
    $owner = lifeOwner('fin');
    $notary = lifeNotary('fin');
    $otherPro = Arsitek::create([
        'user_id' => lifeNotary('other')->id, 'nama' => 'Other Studio',
    ]);
    $project = lifeProject($owner, 'fin');
    $project->update(['selected_notaris_id' => $notary->notaris_profile->id]);

    BidNotaris::create([
        'project_id' => $project->id, 'notaris_id' => $notary->notaris_profile->id,
        'price' => 5_000_000, 'tax_estimate' => 500_000,
        'status' => 'accepted', 'offered_by_id' => $owner->id,
    ]);

    $response = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/legal-financials")
        ->assertStatus(200);

    expect($response->json('allocated_tax'))->toEqual(500000);
    expect($response->json('total_spent'))->toEqual(0);
    expect($response->json('total_spent_cents'))->toBe(0);
    expect($response->json('pending_approval'))->toEqual(0);
    expect($response->json('disbursements'))->toBe([]);

    // The hired notary passes the same gate.
    $this->actingAs($notary)
        ->getJson("/api/projects/{$project->id}/legal-financials")
        ->assertStatus(200);

    // Any other professional does not.
    $this->actingAs(User::find($otherPro->user_id))
        ->getJson("/api/projects/{$project->id}/legal-financials")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');
});

it('lists the notary schedule without the milestone key', function () {
    $owner = lifeOwner('term');
    $notary = lifeNotary('term');
    $project = lifeProject($owner, 'term');
    $project->update(['selected_notaris_id' => $notary->notaris_profile->id]);

    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris',
        'label' => 'DP', 'percentage' => 25, 'amount' => 4_000_000,
        'status' => 'locked',
    ]);

    $response = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/legal-financials")
        ->assertStatus(200);

    $rows = $response->json('disbursements');
    expect($rows)->toHaveCount(1);
    expect($rows[0]['label'])->toBe('DP');
    // The service never eager-loads the milestone here, so the key is
    // absent — unlike GET payment-termins, which always carries it.
    expect($rows[0])->not->toHaveKey('milestone');

    // The committed figure counts the unlocked stage.
    expect($response->json('pending_approval'))->toEqual(4000000);
});
