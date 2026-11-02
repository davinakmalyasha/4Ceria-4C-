<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Payment verify-proof validates, gates and rejects exactly
|--------------------------------------------------------------------------
|
| Regression suite for the S2 payment-verification decision:
| - FormRequest validation (action required/string/in, notes string/max)
|   answers the standard 422 bag with the legacy sentences.
| - The endpoint gate admits only the payee (or the assigned PM), with
|   the legacy error envelope ({status: error}).
| - Unknown types 400, missing rows 404, settled states and the
|   proof-on-file gates 422 with the oracle's exact sentences.
| - Reject resets the settlement state (termins to pending, addendums to
|   approved_unpaid, bids to pending), stamps the notes, and notifies the
|   owner with the label (or the "a payment stage" fallback for bids).
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function verifyOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "vown_$tag" . uniqid(),
        'email' => "vown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function verifyArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "va_$tag" . uniqid(),
        'email' => "va_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    Arsitek::create([
        'user_id' => $user->id, 'nama' => "Studio $tag",
        'verification_status' => 'verified',
    ]);

    return $user;
}

function verifyProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "Verify Job $tag", 'user_id' => $owner->id,
        'budget' => 400_000_000, 'status' => 'open',
        'target_role' => 'both',
    ]);
}

function verifyTermin(Project $project, User $recipient, string $status = 'locked'): ProjectPaymentTermin
{
    return ProjectPaymentTermin::create([
        'project_id' => $project->id,
        'role_type' => 'arsitek',
        'recipient_id' => $recipient->id,
        'label' => 'DP',
        'percentage' => 50,
        'amount' => 1000000,
        'status' => $status,
    ]);
}

function verifyUri(Project $project, string $type, int $id): string
{
    return "/api/projects/{$project->id}/payments/{$type}/{$id}/verify-proof";
}

function verifyUpload($test, User $owner, Project $project, string $type, int $id): void
{
    Storage::fake('public');
    $file = UploadedFile::fake()->image('receipt.png', 100, 100);

    $upload = str_replace('/verify-proof', '/upload-proof', verifyUri($project, $type, $id));

    // The termin ordering guard trips when an earlier stage of the same
    // role is neither paid nor verifying: the suites below mint exactly
    // one stage per project, so the upload always lands.
    $test->actingAs($owner)->post($upload, ['proof' => $file])->assertStatus(200);
}

it('validates the decision before touching any row', function () {
    $owner = verifyOwner('val');
    $pro = verifyArchitect('val');
    $project = verifyProject($owner, 'val');
    $termin = verifyTermin($project, $pro);

    $this->actingAs($owner)
        ->postJson(verifyUri($project, 'termin', $termin->id), [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['action'])
        ->assertJsonPath('errors.action', ['The action field is required.']);

    $this->actingAs($owner)
        ->postJson(verifyUri($project, 'termin', $termin->id), ['action' => 'maybe'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'The action must be either accept or reject.');

    $this->actingAs($owner)
        ->postJson(verifyUri($project, 'termin', $termin->id), ['action' => 5])
        ->assertStatus(422)
        ->assertJsonPath('errors.action', [
            'The action field must be a string.',
            'The action must be either accept or reject.',
        ]);

    $this->actingAs($owner)
        ->postJson(verifyUri($project, 'termin', $termin->id), ['action' => 'reject', 'notes' => 5])
        ->assertStatus(422)
        ->assertJsonPath('errors.notes', ['The notes field must be a string.']);

    $this->actingAs($owner)
        ->postJson(verifyUri($project, 'termin', $termin->id), ['action' => 'reject', 'notes' => str_repeat('x', 1001)])
        ->assertStatus(422)
        ->assertJsonPath('errors.notes', ['The notes field must not be greater than 1000 characters.']);

    expect($termin->fresh()->status)->toBe('locked');
});

it('rejects strangers, unknown types and missing rows with the legacy envelope', function () {
    $owner = verifyOwner('gate');
    $stranger = verifyOwner('stranger');
    $pro = verifyArchitect('gate');
    $project = verifyProject($owner, 'gate');
    $termin = verifyTermin($project, $pro);

    $this->actingAs($owner)
        ->postJson(verifyUri($project, 'wire', $termin->id), ['action' => 'reject'])
        ->assertStatus(400)
        ->assertJsonPath('status', 'error')
        ->assertJsonPath('message', 'Invalid payment type: wire');

    $this->actingAs($owner)
        ->postJson(verifyUri($project, 'termin', $termin->id + 99999), ['action' => 'reject'])
        ->assertStatus(404)
        ->assertJsonPath('status', 'error')
        ->assertJsonPath('message', 'Payment record not found.');

    // The owner paid; only the payee may verify.
    $this->actingAs($owner)
        ->postJson(verifyUri($project, 'termin', $termin->id), ['action' => 'reject'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. You do not have permission to verify this payment.');

    $this->actingAs($stranger)
        ->postJson(verifyUri($project, 'termin', $termin->id), ['action' => 'reject'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. You do not have permission to verify this payment.');
});

it('refuses settled payments and demands a proof on file', function () {
    $owner = verifyOwner('set');
    $pro = verifyArchitect('set');

    $paid = verifyProject($owner, 'paid');
    $paidTermin = verifyTermin($paid, $pro, 'paid');
    $this->actingAs($pro)
        ->postJson(verifyUri($paid, 'termin', $paidTermin->id), ['action' => 'reject'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'This payment is already marked as paid and cannot be modified.');

    // Verifying without a proof on file cannot happen through the API
    // (the upload always stores one), so the row is staged directly.
    $bare = verifyProject($owner, 'bare');
    $bareTermin = verifyTermin($bare, $pro, 'verifying');
    $this->actingAs($pro)
        ->postJson(verifyUri($bare, 'termin', $bareTermin->id), ['action' => 'reject'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'No transfer proof on file. The payer must upload a payment proof before this payment can be verified.');

    $idle = verifyProject($owner, 'idle');
    $idleTermin = verifyTermin($idle, $pro, 'pending');
    $idleTermin->forceFill(['payment_proof_path' => 'receipts/stale.pdf'])->save();
    $this->actingAs($pro)
        ->postJson(verifyUri($idle, 'termin', $idleTermin->id), ['action' => 'reject'])
        ->assertStatus(422)
        ->assertJsonPath('message', "This payment is not awaiting verification. Expected status 'verifying' (proof uploaded by the payer), found 'pending'.");
});

it('rejects a termin back to pending and notifies the owner', function () {
    $owner = verifyOwner('ok');
    $pro = verifyArchitect('ok');
    $project = verifyProject($owner, 'ok');
    $termin = verifyTermin($project, $pro);
    verifyUpload($this, $owner, $project, 'termin', $termin->id);

    expect($termin->fresh()->status)->toBe('verifying');

    $response = $this->actingAs($pro)
        ->postJson(verifyUri($project, 'termin', $termin->id), ['action' => 'reject', 'notes' => 'blurry scan'])
        ->assertStatus(200);

    expect($response->json('status'))->toBe('success');
    expect($response->json('message'))->toBe('Payment proof rejected. The owner will be notified.');
    expect($response->json('data.status'))->toBe('pending');
    expect($response->json('data.verification_notes'))->toBe('blurry scan');
    expect($response->json('data'))->not->toHaveKey('milestone');

    $notice = Notification::where('user_id', $owner->id)->where('type', 'payment_rejected')->latest('id')->first();
    expect($notice)->not->toBeNull();
    expect($notice->title)->toBe('Payment Proof Rejected');
    expect($notice->body)->toContain('DP');
});

it('rejects an addendum back to approved_unpaid', function () {
    $owner = verifyOwner('add');
    $pro = verifyArchitect('add');
    $project = verifyProject($owner, 'add');
    // Standard addendums verify through any hired professional: hire
    // the architect on the project first.
    $project->update(['selected_arsitek_id' => $pro->arsitek->id]);
    $addendum = ProjectAddendum::create([
        'project_id' => $project->id, 'type' => 'extra_fee',
        'role_type' => 'arsitek', 'user_id' => $owner->id,
        'title' => 'Extra scope', 'description' => 'scratch',
        'amount' => 250000, 'status' => 'approved_unpaid',
    ]);
    verifyUpload($this, $owner, $project, 'addendum', $addendum->id);

    $response = $this->actingAs($pro)
        ->postJson(verifyUri($project, 'addendum', $addendum->id), ['action' => 'reject'])
        ->assertStatus(200);

    expect($response->json('data.status'))->toBe('approved_unpaid');
    expect($addendum->fresh()->status)->toBe('approved_unpaid');
});

it('rejects a bid back to pending with the stage fallback label', function () {
    $owner = verifyOwner('bid');
    $pro = verifyArchitect('bid');
    $project = verifyProject($owner, 'bid');
    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $pro->arsitek->id,
        'price' => 10_000_000, 'proposal' => 'Bid.',
        'status' => 'pending', 'offered_by_id' => $pro->id,
    ]);
    verifyUpload($this, $owner, $project, 'arsitek_bid', $bid->id);

    expect($bid->fresh()->payment_status)->toBe('verifying');

    $response = $this->actingAs($pro)
        ->postJson(verifyUri($project, 'arsitek_bid', $bid->id), ['action' => 'reject', 'notes' => 'recheck'])
        ->assertStatus(200);

    expect($response->json('data.payment_status'))->toBe('pending');
    expect($response->json('data.verification_notes'))->toBe('recheck');

    $notice = Notification::where('user_id', $owner->id)->where('type', 'payment_rejected')->latest('id')->first();
    expect($notice->body)->toContain('a payment stage');
});
