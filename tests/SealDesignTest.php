<?php

use App\Models\Arsitek;
use App\Models\Project;
use App\Models\ProjectDocument;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Seal design: the architect hands the package over
|--------------------------------------------------------------------------
|
| Regression suite for the first seal:
| - only the HIRED architect passes (Hire::matches, so a profiled-null
|   architect cannot slip through);
| - a legally-required but unhired structural engineer blocks it, and a
|   hired specialist without their deliverable category blocks it too;
| - success stamps the handover, clears the notes, logs and notifies the
|   owner and PM, and answers the full resource with the termins
|   projection (floats for retention/net, nested milestone).
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function sealOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "slown_$tag" . uniqid(),
        'email' => "slown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function sealArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "sla_$tag" . uniqid(),
        'email' => "sla_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);

    return $user;
}

function sealProject(User $owner, User $architect, string $tag, array $overrides = []): Project
{
    return Project::create(array_merge([
        'title' => "Seal $tag", 'user_id' => $owner->id,
        'budget' => 200_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'selected_arsitek_id' => $architect->arsitek->id,
    ], $overrides));
}

it('gates the seal on the hired architect and the structural hire', function () {
    $owner = sealOwner('gate');
    $pro = sealArchitect('gate');
    $other = sealArchitect('other');
    $project = sealProject($owner, $pro, 'gate');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/seal-design")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only the hired architect can seal the design.');

    $this->actingAs($other)
        ->postJson("/api/projects/{$project->id}/seal-design")
        ->assertStatus(403);

    $needsStructural = sealProject($owner, $pro, 'struct', ['requires_structural' => true]);
    $this->actingAs($pro)
        ->postJson("/api/projects/{$needsStructural->id}/seal-design")
        ->assertStatus(422)
        ->assertJsonPath('message', 'A Structural Engineer is legally required but has not been hired yet.');
});

it('refuses while a hired specialist has not uploaded deliverables', function () {
    $owner = sealOwner('docs');
    $pro = sealArchitect('docs');
    $structural = User::create([
        'name' => 'Struct Pro', 'username' => 'st' . uniqid(),
        'email' => 'st' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'structural',
    ]);
    StructuralEngineer::create(['user_id' => $structural->id, 'nama' => 'Struct Co']);
    $profile = StructuralEngineer::where('user_id', $structural->id)->sole();

    $project = sealProject($owner, $pro, 'docs', ['structural_id' => $profile->id]);

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/seal-design")
        ->assertStatus(422)
        ->assertJsonPath('message', 'Structural Engineer must upload their deliverables before you can request PM approval.');

    ProjectDocument::create([
        'project_id' => $project->id, 'uploader_id' => $structural->id,
        'file_name' => 'calc.pdf', 'file_path' => 'project_documents/calc.pdf',
        'category' => 'structural_calc', 'status' => 'uploaded', 'version' => 1, 'file_type' => 'pdf',
    ]);

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/seal-design")
        ->assertStatus(200);
});

it('stamps the handover and answers the full resource', function () {
    $owner = sealOwner('ok');
    $pro = sealArchitect('ok');
    $project = sealProject($owner, $pro, 'ok');
    $project->update(['design_handover_notes' => 'stale note']);

    \App\Models\ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'arsitek',
        'recipient_id' => $pro->id, 'label' => 'DP', 'percentage' => 30,
        'amount' => 60_000_000, 'trigger_description' => 'after frame', 'status' => 'locked',
    ]);

    $response = $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/seal-design")
        ->assertStatus(200);

    $fresh = $project->fresh();
    expect($fresh->design_handover_submitted_at)->not->toBeNull();
    expect($fresh->design_handover_notes)->toBeNull();

    // The termins projection: floats for retention/net, strings for the
    // decimal casts.
    $termins = $response->json('data.payment_termins');
    expect($termins)->toHaveCount(1);
    expect($termins[0]['percentage'])->toBe('30.00');
    expect($termins[0]['retention_amount'])->toEqual(3000000);
    expect($termins[0]['net_amount'])->toEqual(57000000);
    expect($termins[0])->toHaveKey('milestone');
    expect($response->json('data'))->toHaveKey('documents');
    expect($response->json('data'))->toHaveKey('comments');

    $log = \App\Models\ProjectActivityLog::where('project_id', $project->id)->latest('id')->first();
    expect($log->action)->toBe('design_handover_submitted');
});
