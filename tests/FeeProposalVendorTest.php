<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\BidNegotiationLog;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectExternalVendor;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Fee proposals and external-vendor imports
|--------------------------------------------------------------------------
|
| propose-fee recomputes the total, snapshots the round, moves the bid to
| `negotiating`, and returns the just-updated model (request key order). The
| vendor import commits the agreed fee to the ledger as `adjustment_down`
| with the vendor as its reference, and rolls back when the escrow is short.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function feeUser(string $tag, string $role = 'user'): User
{
    return User::create([
        'name' => "FP $tag", 'username' => "fp_$tag" . uniqid(),
        'email' => "fp_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

function fpProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "FP Project $tag", 'user_id' => $owner->id,
        'budget' => 100000000, 'status' => 'open', 'target_role' => 'both',
    ]);
}

it('proposes a counter-offer and snapshots the negotiation round', function () {
    $owner = feeUser('own');
    $project = fpProject($owner, 'own');
    $architect = feeUser('arch', 'arsitek');
    $profile = Arsitek::create(['user_id' => $architect->id, 'nama' => 'Arch']);
    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 68000000, 'fee_type' => 'fixed', 'proposal' => 'x',
        'status' => 'shortlisted', 'negotiation_count' => 0,
    ]);

    $this->actingAs(feeUser('str'))
        ->postJson("/api/projects/{$project->id}/propose-fee", [
            'bid_id' => $bid->id, 'bid_type' => 'arsitek', 'price' => 60000000,
            'proposed_termins' => [['percentage' => 100, 'trigger_description' => 'Done']],
        ])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized. You do not have permission to counter this bid.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/propose-fee", [
            'bid_id' => $bid->id, 'bid_type' => 'arsitek', 'price' => 5000000,
            'proposed_termins' => [['percentage' => 50, 'trigger_description' => 'Done']],
        ])
        ->assertStatus(422)
        ->assertExactJson(['message' => 'The total percentage of payment termins must equal exactly 100%.']);

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/propose-fee", [
            'bid_id' => $bid->id, 'bid_type' => 'arsitek', 'price' => 60000000,
            'fee_type' => 'fixed', 'note' => 'Round 2',
            'proposed_termins' => [
                ['percentage' => 40, 'trigger_description' => 'Kickoff'],
                ['percentage' => 60, 'trigger_description' => 'Handover'],
            ],
            'proposed_milestones' => [['title' => 'Design', 'description' => 'Concept']],
            'proposed_team' => [[
                'name' => 'Drafter', 'role_title' => 'Drafter', 'role' => 'drafter',
                'fee' => 10, 'fee_type' => 'percentage',
            ]],
            'project_length' => 10, 'project_width' => 20,
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Fee and phases proposed successfully');

    expect($response->json('data.price'))->toBe('60000000.00');
    expect($response->json('data.calculated_total'))->toBe('66000000.00');
    expect($response->json('data.status'))->toBe('negotiating');
    expect($response->json('data.negotiation_count'))->toBe(1);
    expect($response->json('data.proposed_team.0.name'))->toBe('Drafter');

    expect(BidNegotiationLog::where('bid_id', $bid->id)->count())->toBe(1);
    expect(ProjectActivityLog::where('project_id', $project->id)
        ->where('action', 'fee_proposed')->count())->toBe(1);
    expect($project->fresh()->project_dimensions)->toMatchArray([
        'building_length' => 10, 'building_width' => 20, 'building_size' => 200,
    ]);

    // A pending bid is not negotiable yet.
    $pending = BidArsitek::create([
        'project_id' => $project->id,
        'arsitek_id' => Arsitek::create(['user_id' => feeUser('a2', 'arsitek')->id, 'nama' => 'A2'])->id,
        'price' => 1000, 'proposal' => 'y', 'status' => 'pending',
    ]);
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/propose-fee", [
            'bid_id' => $pending->id, 'bid_type' => 'arsitek', 'price' => 5000000,
            'proposed_termins' => [['percentage' => 100, 'trigger_description' => 'Done']],
        ])
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Proposals can only be made during the shortlisting/negotiation phase.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/propose-fee", [
            'bid_id' => 999999999, 'bid_type' => 'arsitek', 'price' => 5000000,
            'proposed_termins' => [['percentage' => 100, 'trigger_description' => 'Done']],
        ])
        ->assertStatus(404)
        ->assertExactJson(['message' => 'Bid not found.']);
});

it('imports an external vendor and commits the fee to escrow', function () {
    $owner = feeUser('ven');
    $project = fpProject($owner, 'ven');

    $this->actingAs(feeUser('vens'))
        ->postJson("/api/projects/{$project->id}/import-external-vendor", [
            'phase_role' => 'arsitek', 'contact_person' => 'X', 'phone_number' => '08123',
        ])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/import-external-vendor", [
            'phase_role' => 'bogus', 'contact_person' => 'X', 'phone_number' => '08123',
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.phase_role', ['The selected phase role is invalid.']);

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/import-external-vendor", [
            'phase_role' => 'arsitek', 'company_name' => 'Studio X',
            'contact_person' => 'Vendor X', 'phone_number' => '0812345678',
            'email' => 'vendor@example.test', 'agreed_fee' => 2500000,
            'notes' => 'External design partner',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'External professional imported successfully.');

    expect($response->json('vendor.agreed_fee'))->toBe('2500000.00');
    $vendor = ProjectExternalVendor::sole();
    expect($vendor->phase_role)->toBe('arsitek');
    expect($project->fresh()->budget)->toBe('97500000.00');
    $ledger = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('reference_model', ProjectExternalVendor::class)->sole();
    expect($ledger->transaction_type)->toBe('adjustment_down');
    expect($ledger->amount)->toBe('2500000.00');
    expect(ProjectActivityLog::where('project_id', $project->id)
        ->where('action', 'external_vendor_imported')->count())->toBe(1);

    // The escrow gate rolls the import COMPLETELY back.
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/import-external-vendor", [
            'phase_role' => 'arsitek', 'contact_person' => 'Too Expensive',
            'phone_number' => '08123', 'agreed_fee' => 99999999999999,
        ])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Insufficient project budget to allocate the agreed fee of Rp 99.999.999.999.999 to Too Expensive. Reduce the fee, or raise the project budget first.');
    expect(ProjectExternalVendor::where('contact_person', 'Too Expensive')->count())->toBe(0);
});
