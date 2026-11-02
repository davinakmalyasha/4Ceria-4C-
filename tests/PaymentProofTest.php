<?php

use App\Models\Project;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Payment proof upload validates, gates and settles exactly once
|--------------------------------------------------------------------------
|
| Regression suite for the S2 payment-verification write:
| - FormRequest validation (required, file+mimes, max) answers the
|   standard 422 bag — including the non-file double error.
| - The endpoint gate admits only the owner or the assigned PM, with the
|   legacy error envelope ({status: error}).
| - Unknown types 400, missing rows 404, settled states (paid, refunded,
|   void) and the lifecycle check 422 with the oracle's exact sentences.
| - The previous-stage ordering guard refuses a later termin while an
|   earlier one of the same role is neither paid nor verifying.
| - Success flips the row to verifying and stores the receipt on the
|   vault, replacing any previous proof file.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function proofOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "pfown_$tag" . uniqid(),
        'email' => "pfown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function proofProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "Proof Job $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open',
        'target_role' => 'both',
    ]);
}

function proofTermin(Project $project, string $label, float $amount, string $status = 'locked'): ProjectPaymentTermin
{
    return ProjectPaymentTermin::create([
        'project_id' => $project->id,
        'role_type' => 'arsitek',
        'label' => $label,
        'percentage' => 50,
        'amount' => $amount,
        'status' => $status,
    ]);
}

function proofUri(Project $project, string $type, int $id): string
{
    return "/api/projects/{$project->id}/payments/{$type}/{$id}/upload-proof";
}

it('validates the proof file before touching any row', function () {
    Storage::fake('public');
    $owner = proofOwner('val');
    $project = proofProject($owner, 'val');
    $termin = proofTermin($project, 'DP', 1000000);

    $this->actingAs($owner)
        ->postJson(proofUri($project, 'termin', $termin->id), [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['proof'])
        ->assertJsonPath('errors.proof', ['The proof field is required.']);

    $this->actingAs($owner)
        ->postJson(proofUri($project, 'termin', $termin->id), ['proof' => 'abc'])
        ->assertStatus(422)
        ->assertJsonPath('errors.proof', [
            'The proof field must be a file.',
            'The proof field must be a file of type: jpeg, png, jpg, pdf.',
        ]);

    $file = UploadedFile::fake()->create('notes.txt', 100, 'text/plain');
    $this->actingAs($owner)
        ->post(proofUri($project, 'termin', $termin->id), ['proof' => $file])
        ->assertStatus(422)
        ->assertJsonPath('errors.proof', ['The proof field must be a file of type: jpeg, png, jpg, pdf.']);

    expect($termin->fresh()->status)->not->toBe('verifying');
});

it('rejects unknown types, missing rows and strangers with the legacy envelope', function () {
    Storage::fake('public');
    $owner = proofOwner('gate');
    $stranger = proofOwner('stranger');
    $project = proofProject($owner, 'gate');
    $termin = proofTermin($project, 'DP', 1000000);
    $file = fn () => UploadedFile::fake()->image('receipt.png', 100, 100);

    $this->actingAs($owner)
        ->post(proofUri($project, 'wire', $termin->id), ['proof' => $file()])
        ->assertStatus(400)
        ->assertJsonPath('status', 'error')
        ->assertJsonPath('message', 'Invalid payment type: wire');

    $this->actingAs($owner)
        ->post(proofUri($project, 'termin', $termin->id + 99999), ['proof' => $file()])
        ->assertStatus(404)
        ->assertJsonPath('status', 'error')
        ->assertJsonPath('message', 'Payment record not found.');

    $this->actingAs($stranger)
        ->post(proofUri($project, 'termin', $termin->id), ['proof' => $file()])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only the Project Owner or assigned Project Manager can upload payment proofs.');
});

it('refuses settled payments and enforces the stage order', function () {
    Storage::fake('public');
    $owner = proofOwner('set');
    $project = proofProject($owner, 'set');
    $file = fn () => UploadedFile::fake()->image('receipt.png', 100, 100);

    foreach (['paid' => 'This payment is already marked as paid and cannot be modified.', 'refunded' => 'This payment was refunded through dispute arbitration and cannot be re-charged.', 'void' => 'This payment stage was voided (contract terminated or re-signed) and is no longer payable.'] as $status => $expected) {
        // One project per state: an earlier non-paid/verifying stage of
        // the same role would trip the ordering guard first.
        $solo = proofProject($owner, 'solo-' . $status);
        $termin = proofTermin($solo, "Stage $status", 1000000, $status);
        $this->actingAs($owner)
            ->post(proofUri($solo, 'termin', $termin->id), ['proof' => $file()])
            ->assertStatus(422)
            ->assertJsonPath('message', $expected);
    }

    $first = proofTermin($project, 'DP', 1000000, 'locked');
    $second = proofTermin($project, 'Final', 1000000, 'locked');
    $this->actingAs($owner)
        ->post(proofUri($project, 'termin', $second->id), ['proof' => $file()])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Please complete the previous payment milestones (e.g. Down Payment) before paying for this one.');
    expect($second->fresh()->status)->toBe('locked');
    expect($first->fresh()->status)->toBe('locked');
});

it('stores the receipt, replaces the previous proof and flips to verifying', function () {
    Storage::fake('public');
    $owner = proofOwner('ok');
    $project = proofProject($owner, 'ok');
    $termin = proofTermin($project, 'DP', 1000000);

    $first = UploadedFile::fake()->image('first.png', 100, 100);
    $response = $this->actingAs($owner)
        ->post(proofUri($project, 'termin', $termin->id), ['proof' => $first])
        ->assertStatus(200);

    expect($response->json('status'))->toBe('success');
    expect($response->json('message'))->toBe('Proof of transfer uploaded successfully.');
    $path = $response->json('data.payment_proof_path');
    expect($path)->toStartWith('receipts/');
    expect($response->json('data.status'))->toBe('verifying');
    Storage::disk('public')->assertExists($path);

    $second = UploadedFile::fake()->image('second.png', 100, 100);
    $replaced = $this->actingAs($owner)
        ->post(proofUri($project, 'termin', $termin->id), ['proof' => $second])
        ->assertStatus(200);

    expect($replaced->json('data.payment_proof_path'))->not->toBe($path);
    Storage::disk('public')->assertMissing($path);
    Storage::disk('public')->assertExists($replaced->json('data.payment_proof_path'));
});
