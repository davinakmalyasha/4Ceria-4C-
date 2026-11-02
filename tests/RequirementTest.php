<?php

use App\Models\Project;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Requirement image uploads actually persist
|--------------------------------------------------------------------------
|
| Regression suite for a defect found while porting the S2 requirements
| write to Go: `store()` (and `update()`) passed the validated payload —
| which carries the UploadedFile object under `image` — straight into
| `create()`/`update()`. `image` is neither fillable nor a column, so
| EVERY image upload raised MassAssignmentException: a 500 in strict
| mode and in production alike, i.e. the upload path was simply dead.
| (The flat-file probes that never attach an image passed all along,
| which is how it hid.) The fix unsets the file object; the stored
| path travels under `image_path` instead.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function requirementOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "rqown_$tag" . uniqid(),
        'email' => "rqown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function requirementProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "Req Job $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open',
        'target_role' => 'both',
    ]);
}

it('stores a requirement image instead of 500ing on mass assignment', function () {
    Storage::fake('public');

    $owner = requirementOwner('img');
    $project = requirementProject($owner, 'img');

    $file = UploadedFile::fake()->image('cement.png', 100, 100);

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements", [
            'name' => 'Semen',
            'quantity_required' => 10,
            'unit' => 'sak',
            'bom_type' => 'raw',
            'image' => $file,
        ])
        ->assertStatus(200);

    $path = $response->json('data.image_path');
    expect($path)->toStartWith('requirements/');
    expect($response->json('data.image_url'))->toContain($path);
    expect($response->json('data'))->not->toHaveKey('folder');
    Storage::disk('public')->assertExists($path);
});

it('rejects a non-image upload with both the image and mimes errors', function () {
    $owner = requirementOwner('bad');
    $project = requirementProject($owner, 'bad');

    $file = UploadedFile::fake()->create('notes.txt', 100, 'text/plain');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements", [
            'name' => 'Semen',
            'quantity_required' => 10,
            'unit' => 'sak',
            'bom_type' => 'raw',
            'image' => $file,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['image'])
        ->assertJsonPath('errors.image', [
            'The image field must be an image.',
            'The image field must be a file of type: jpeg, png, jpg, webp.',
        ]);
});

it('lists requirements with the image url and requester', function () {
    $owner = requirementOwner('lst');
    $project = requirementProject($owner, 'lst');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements", [
            'name' => 'Semen',
            'quantity_required' => 10,
            'unit' => 'sak',
            'bom_type' => 'raw',
        ])
        ->assertStatus(200);

    $response = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/requirements")
        ->assertStatus(200);

    expect($response->json('data'))->toHaveCount(1);
    expect($response->json('data.0.image_url'))->toBeNull();
    expect($response->json('data.0.user.id'))->toBe($owner->id);
    expect($response->json('data.0'))->toHaveKey('folder');
});

it('updates a requirement without touching untouched columns', function () {
    $owner = requirementOwner('upd');
    $project = requirementProject($owner, 'upd');

    $id = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements", [
            'name' => 'Semen',
            'quantity_required' => 10,
            'unit' => 'sak',
            'bom_type' => 'raw',
        ])
        ->assertStatus(200)
        ->json('data.id');

    $response = $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/requirements/{$id}", [
            'name' => 'Semen Updated',
            'quantity_required' => 20,
        ])
        ->assertStatus(200);

    // Same shape as store minus create order: table columns, image_url,
    // the requester, and notably no folder key.
    expect($response->json('data.name'))->toBe('Semen Updated');
    expect($response->json('data.quantity_required'))->toBe('20.00');
    expect($response->json('data.unit'))->toBe('sak');
    expect($response->json('data'))->not->toHaveKey('folder');
    expect($response->json('data.user.id'))->toBe($owner->id);
});

it('rejects a requirement of another project with a plain 404', function () {
    $owner = requirementOwner('bind');
    $project = requirementProject($owner, 'bind');
    $other = requirementProject($owner, 'bind2');

    $id = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements", [
            'name' => 'Semen',
            'quantity_required' => 10,
            'unit' => 'sak',
            'bom_type' => 'raw',
        ])
        ->assertStatus(200)
        ->json('data.id');

    $this->actingAs($owner)
        ->putJson("/api/projects/{$other->id}/requirements/{$id}", ['name' => 'X'])
        ->assertStatus(404)
        ->assertJsonPath('message', 'Not found.');

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$other->id}/requirements/{$id}")
        ->assertStatus(404)
        ->assertJsonPath('message', 'Not found.');
});

it('logs folder and tab moves with the oracle naming quirks', function () {
    $owner = requirementOwner('mv');
    $project = requirementProject($owner, 'mv');

    $folder = \App\Models\ProjectMaterialFolder::create([
        'project_id' => $project->id, 'name' => 'Gudang',
        'bom_type' => 'raw', 'created_by' => $owner->id,
    ]);

    $id = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements", [
            'name' => 'Semen',
            'quantity_required' => 10,
            'unit' => 'sak',
            'bom_type' => 'raw',
        ])
        ->assertStatus(200)
        ->json('data.id');

    // Unassigning (null) writes no history — the `&&`/`??` precedence
    // quirk. Moving to a folder logs, even the same folder twice.
    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/requirements/{$id}", ['folder_id' => null])
        ->assertStatus(200);
    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/requirements/{$id}", ['folder_id' => $folder->id])
        ->assertStatus(200);
    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/requirements/{$id}", ['folder_id' => $folder->id])
        ->assertStatus(200);

    // The new tab name is always 'Bahan Baku' — the `??`/`?:`
    // precedence quirk — while the old name follows the actual value.
    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/requirements/{$id}", ['bom_type' => 'finishing'])
        ->assertStatus(200);

    $notes = \App\Models\ProjectRequirementHistory::where('project_requirement_id', $id)
        ->orderBy('id')->pluck('notes')->all();

    expect($notes)->toBe([
        'Material requirement created',
        "Moved from 'Unassigned' to 'Gudang'",
        "Moved from 'Gudang' to 'Gudang'",
        "Moved from 'Bahan Baku' to 'Bahan Baku'",
    ]);
});

it('deletes a requirement with its histories and logs the removal', function () {
    $owner = requirementOwner('del');
    $project = requirementProject($owner, 'del');

    $id = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements", [
            'name' => 'Semen',
            'quantity_required' => 10,
            'unit' => 'sak',
            'bom_type' => 'raw',
        ])
        ->assertStatus(200)
        ->json('data.id');

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/requirements/{$id}")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Deleted');

    expect(\App\Models\ProjectRequirement::find($id))->toBeNull();
    expect(\App\Models\ProjectRequirementHistory::where('project_requirement_id', $id)->count())->toBe(0);
    expect(\App\Models\ProjectActivityLog::where('project_id', $project->id)->where('action', 'requirement_deleted')->count())->toBe(1);
});

it('reads the project history newest-first with actor and requirement', function () {
    $owner = requirementOwner('hst');
    $project = requirementProject($owner, 'hst');

    $id = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements", [
            'name' => 'Semen',
            'quantity_required' => 10,
            'unit' => 'sak',
            'bom_type' => 'raw',
        ])
        ->assertStatus(200)
        ->json('data.id');

    $response = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/requirements-history")
        ->assertStatus(200);

    expect($response->json('data'))->toHaveCount(1);
    expect($response->json('data.0.project_requirement_id'))->toBe($id);
    expect($response->json('data.0.quantity'))->toBe('0.00');
    expect($response->json('data.0.user.id'))->toBe($owner->id);
    // The nested requirement is columns plus image_url — no user, no folder.
    expect($response->json('data.0.requirement.id'))->toBe($id);
    expect($response->json('data.0.requirement'))->not->toHaveKey('user');
    expect($response->json('data.0.requirement'))->not->toHaveKey('folder');
    expect($response->json('data.0.requirement.image_url'))->toBeNull();
});

it('scopes the per-requirement history to its own project', function () {
    $owner = requirementOwner('hst1');
    $project = requirementProject($owner, 'hst1');
    $other = requirementProject($owner, 'hst2');

    $id = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements", [
            'name' => 'Semen',
            'quantity_required' => 10,
            'unit' => 'sak',
            'bom_type' => 'raw',
        ])
        ->assertStatus(200)
        ->json('data.id');

    $response = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/requirements/{$id}/history")
        ->assertStatus(200);

    expect($response->json('data'))->toHaveCount(1);
    expect($response->json('data.0'))->not->toHaveKey('requirement');

    $this->actingAs($owner)
        ->getJson("/api/projects/{$other->id}/requirements/{$id}/history")
        ->assertStatus(404)
        ->assertJsonPath('message', 'Not found.');
});

it('restocks and consumes with exact decimals and activity lines', function () {
    $owner = requirementOwner('stk');
    $project = requirementProject($owner, 'stk');

    $id = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements", [
            'name' => 'Semen',
            'quantity_required' => 10,
            'unit' => 'sak',
            'bom_type' => 'raw',
        ])
        ->assertStatus(200)
        ->json('data.id');

    // Below-minimum and non-numeric quantities fail before any write.
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements/{$id}/restock", ['quantity' => 0.009])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['quantity']);
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements/{$id}/use", ['quantity' => 1])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Insufficient stock on site.');

    $restocked = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements/{$id}/restock", ['quantity' => 5.5])
        ->assertStatus(200);

    expect($restocked->json('message'))->toBe('Material successfully restocked.');
    expect($restocked->json('requirement.quantity_on_site'))->toBe('5.50');
    expect($restocked->json('history.quantity'))->toBe('5.50');
    expect($restocked->json('history.notes'))->toBe('Manual stock addition.');
    expect($restocked->json('history'))->not->toHaveKey('requirement');

    $used = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements/{$id}/use", ['quantity' => 2])
        ->assertStatus(200);

    expect($used->json('message'))->toBe('Material usage logged.');
    expect($used->json('requirement.quantity_on_site'))->toBe('3.50');
    expect($used->json('requirement.quantity_used'))->toBe('2.00');

    $consumed = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements/{$id}/usage", ['quantity' => 1])
        ->assertStatus(200);

    expect($consumed->json('data.quantity_on_site'))->toBe('2.50');
    expect($consumed->json('data.quantity_used'))->toBe('3.00');
    expect($consumed->json('data'))->not->toHaveKey('user');

    $actions = \App\Models\ProjectActivityLog::where('project_id', $project->id)
        ->orderBy('id')->pluck('details')->all();
    expect($actions)->toBe([
        'Added material: Semen',
        'Restocked 5.5 sak of Semen',
        'Used 2 sak of Semen',
        'Used 1 sak of Semen',
    ]);
});

it('requests procurement with addendum and owner notification', function () {
    $owner = requirementOwner('prq');
    $project = requirementProject($owner, 'prq');

    $id = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements", [
            'name' => 'Semen',
            'quantity_required' => 10,
            'unit' => 'sak',
            'bom_type' => 'raw',
        ])
        ->assertStatus(200)
        ->json('data.id');

    // Below-minimum and non-numeric quantities fail before any write.
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements/{$id}/request-procurement", ['quantity_needed' => 0.009])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['quantity_needed']);
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements/{$id}/request-procurement", ['quantity_needed' => 1, 'offer_to_buy' => 'yes'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['offer_to_buy']);

    // No PM on the project: pending_owner plus a pm_material addendum
    // and a budget authorization notification for the owner.
    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/requirements/{$id}/request-procurement", [
            'quantity_needed' => 2,
            'estimated_unit_cost' => 1500.5,
            'message' => 'Need fast',
            'offer_to_buy' => true,
        ])
        ->assertStatus(200);

    $data = $response->json('data');
    expect($data['status'])->toBe('pending_owner');
    expect($data['quantity_needed'])->toBe('2.00');
    expect($data['estimated_unit_cost'])->toBe('1500.50');
    expect($data['estimated_cost'])->toBe('3001.00');
    expect($data['offer_to_buy'])->toBeTrue();

    $addendum = \App\Models\ProjectAddendum::where('procurement_request_id', $data['id'])->first();
    expect($addendum)->not->toBeNull();
    expect($addendum->role_type)->toBe('pm_material');
    expect($addendum->status)->toBe('pending_approval');

    $notification = \App\Models\Notification::where('user_id', $owner->id)
        ->where('type', 'budget_approval_needed')->latest('id')->first();
    expect($notification)->not->toBeNull();
});

it('verifies and rejects procurement through the assigned PM only', function () {
    $owner = requirementOwner('pmd');
    $project = requirementProject($owner, 'pmd');
    $pmUser = \App\Models\User::create([
        'name' => 'PM Decider', 'username' => 'pmdec_' . uniqid(),
        'email' => 'pmdec_' . uniqid() . '@example.test',
        'password' => \Illuminate\Support\Facades\Hash::make('password123'), 'role_type' => 'project_manager',
    ]);
    $pm = \App\Models\ProjectManager::create([
        'user_id' => $pmUser->id, 'nama' => 'PM Decider',
        'verification_status' => 'verified',
    ]);
    $project->update(['pm_id' => $pm->id]);

    $requirement = function () use ($owner, $project) {
        return $this->actingAs($owner)
            ->postJson("/api/projects/{$project->id}/requirements", [
                'name' => 'Semen',
                'quantity_required' => 10,
                'unit' => 'sak',
                'bom_type' => 'raw',
            ])
            ->assertStatus(200)
            ->json('data.id');
    };

    $request = function ($requirementId, $qty = 2) use ($owner, $project) {
        return $this->actingAs($owner)
            ->postJson("/api/projects/{$project->id}/requirements/{$requirementId}/request-procurement", [
                'quantity_needed' => $qty,
            ])
            ->assertStatus(200)
            ->json('data.id');
    };

    // A non-PM gets the long verify 403 and the bare reject 403.
    $id = $request($requirement());
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/procurement-requests/{$id}/verify", ['estimated_cost' => 100])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only the assigned PM can verify procurement requests.');
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/procurement-requests/{$id}/reject", ['pm_note' => 'x'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');

    // Below-minimum costs fail before the state check.
    $this->actingAs($pmUser)
        ->postJson("/api/projects/{$project->id}/procurement-requests/{$id}/verify", ['estimated_cost' => -5])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['estimated_cost']);

    // Verify moves pending_pm to pending_owner with an addendum and an
    // owner notification, answering message plus the row with its
    // requirement and no requester.
    $verified = $this->actingAs($pmUser)
        ->postJson("/api/projects/{$project->id}/procurement-requests/{$id}/verify", [
            'estimated_cost' => 120000,
            'pm_note' => 'Looks good',
        ])
        ->assertStatus(200);

    expect($verified->json('message'))->toBe('Request forwarded to Owner for budget approval.');
    expect($verified->json('data.status'))->toBe('pending_owner');
    expect($verified->json('data.estimated_cost'))->toBe('120000.00');
    expect($verified->json('data'))->toHaveKey('requirement');
    expect($verified->json('data'))->not->toHaveKey('requester');
    expect(\App\Models\ProjectAddendum::where('procurement_request_id', $id)->count())->toBe(1);

    // A second verify refuses: the request is no longer pending_pm.
    $this->actingAs($pmUser)
        ->postJson("/api/projects/{$project->id}/procurement-requests/{$id}/verify", ['estimated_cost' => 5])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Request is not in a verifiable state');

    // Reject flips any state, notifies the requester, and answers the
    // row with its requirement (lazy-loaded by the notification line)
    // but no requester.
    $requirementId = $requirement();
    $id2 = $request($requirementId);
    $rejected = $this->actingAs($pmUser)
        ->postJson("/api/projects/{$project->id}/procurement-requests/{$id2}/reject", ['pm_note' => 'Too expensive'])
        ->assertStatus(200);

    expect($rejected->json('data.status'))->toBe('rejected');
    expect($rejected->json('data.requirement.id'))->toBe($requirementId);
    expect($rejected->json('data'))->not->toHaveKey('requester');
    expect(\App\Models\Notification::where('user_id', $owner->id)->where('type', 'procurement_rejected')->count())->toBe(1);
});
