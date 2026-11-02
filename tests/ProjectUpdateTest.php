<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectMilestone;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Update project
|--------------------------------------------------------------------------
|
| Both `PUT/PATCH /projects/{id}` and `POST /projects/{id}/update` share one
| method: owner, selected professional or assigned PM; the escrow ceiling is
| NEVER written here; a non-owner's commercial fields are stripped; structured
| details merge; and a payment plan rewrite runs through TerminPlanService.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function upUser(string $tag, string $role = 'user'): User
{
    return User::create([
        'name' => "UP $tag", 'username' => "up_$tag" . uniqid(),
        'email' => "up_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

function upProject(User $owner, string $tag, array $extra = []): Project
{
    return Project::create(array_merge([
        'title' => "UP Project $tag", 'user_id' => $owner->id,
        'budget' => 10000000, 'status' => 'open', 'target_role' => 'both',
    ], $extra));
}

it('updates the description and merges structured details', function () {
    $owner = upUser('own');
    $project = upProject($owner, 'own');

    $this->actingAs(upUser('str'))
        ->putJson("/api/projects/{$project->id}", ['title' => 'X'])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized. Must be project owner, hired professional, or PM.']);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}", ['budget' => 100])
        ->assertStatus(422)
        ->assertJsonPath('message', 'The project budget cannot be edited directly. Use POST /projects/{$project->id}/budget/transactions with transaction_type "deposit" (to add funds) or "adjustment_down" (to reduce), so the change is recorded in the ledger.');

    $response = $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}", [
            'description' => 'Parity update proof',
            'design_details' => ['foo' => 'bar'],
        ])
        ->assertStatus(200)
        ->assertJsonPath('data.description', 'Parity update proof')
        ->assertJsonPath('data.design_details.foo', 'bar');

    expect($project->fresh()->description)->toBe('Parity update proof');
    expect($project->fresh()->design_details)->toBe(['foo' => 'bar']);
    expect(array_keys($response->json('data.design_details')))->toBe(['foo']);
});

it('lets a hired professional edit the project but not commercial fields', function () {
    $owner = upUser('hown');
    $architect = upUser('harch', 'arsitek');
    $profile = Arsitek::create(['user_id' => $architect->id, 'nama' => 'Arch']);
    $project = upProject($owner, 'hired', ['selected_arsitek_id' => $profile->id]);

    $this->actingAs($architect)
        ->putJson("/api/projects/{$project->id}", [
            'title' => 'Renamed by architect',
            'status' => 'completed',
            'requires_structural' => true,
        ])
        ->assertStatus(200);

    expect($project->fresh()->title)->toBe('Renamed by architect');
    // The non-owner's lifecycle/commercial fields were stripped.
    expect($project->fresh()->status)->toBe('open');
    expect((bool) $project->fresh()->requires_structural)->toBeFalse();
});

it('rewrites the payment plan through the termin guards', function () {
    $owner = upUser('plan');
    $project = upProject($owner, 'plan');
    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'arsitek',
        'label' => 'Old', 'percentage' => 100, 'amount' => 1000000,
        'status' => 'locked',
    ]);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}", [
            'payment_termins' => [
                ['label' => 'DP', 'percentage' => 50, 'amount' => 1000000],
                ['label' => 'Final', 'percentage' => 50, 'amount' => 1000000],
            ],
            'target_role' => 'arsitek',
        ])
        ->assertStatus(200);

    $rows = ProjectPaymentTermin::where('project_id', $project->id)->where('role_type', 'arsitek')->get();
    expect($rows)->toHaveCount(2);
    expect($rows->pluck('label')->all())->toBe(['DP', 'Final']);
    expect($rows->pluck('status')->all())->toBe(['locked', 'locked']);
    expect($rows[0]->retention_amount)->toBe('50000.00');
    expect($rows[0]->net_amount)->toBe('950000.00');

    // The owner omitting target_role falls back to their own role_type 'user',
    // which is not a licensed role.
    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}", [
            'payment_termins' => [['label' => 'X', 'percentage' => 100, 'amount' => 1000]],
        ])
        ->assertStatus(422);

    // A non-owner professional cannot rewrite another role's plan.
    // (The update gate admits the architect/contractor/interior hires, not the notary.)
    $interior = upUser('pint', 'interior');
    $interiorProfile = \App\Models\InteriorProfile::create(['user_id' => $interior->id, 'nama' => 'I']);
    $project->update(['selected_interior_id' => $interiorProfile->id]);
    $this->actingAs($interior)
        ->putJson("/api/projects/{$project->id}", [
            'payment_termins' => [['label' => 'Y', 'percentage' => 100, 'amount' => 1000]],
            'target_role' => 'kontraktor',
        ])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized. You can only modify payment termins for your own role.']);

    // In-flight money blocks a wholesale rewrite.
    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'arsitek',
        'label' => 'Verifying', 'percentage' => 100, 'amount' => 1000000,
        'status' => 'verifying',
    ]);
    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}", [
            'payment_termins' => [['label' => 'Z', 'percentage' => 100, 'amount' => 1000]],
            'target_role' => 'arsitek',
        ])
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Cannot replace payment termins while any of them is verifying or paid.']);
});

it('logs a status change from the POST alias', function () {
    $owner = upUser('alias');
    $project = upProject($owner, 'alias');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/update", ['status' => 'in_progress'])
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'in_progress');

    expect($project->fresh()->status)->toBe('in_progress');
    expect(ProjectActivityLog::where('project_id', $project->id)
        ->where('action', 'status_changed')->count())->toBe(1);
});
