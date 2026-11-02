<?php

use App\Models\Arsitek;
use App\Models\BidStructural;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectSubProfessional;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Sub-professional roster and its lifecycle
|--------------------------------------------------------------------------
|
| Regression suite for the nine roster routes:
| - the roster is participant-gated and hides removed rows;
| - assign validates, refuses duplicates and mints an invited row
|   (auto-accepted only when the LEAD's own profile is a company);
| - accept/decline/interview/recommend/hire/remove each enforce their
|   own gate and answer the row;
| - recommend marks the specialist bid, and the status it writes is
|   storable because bids_structural.status is a VARCHAR on MySQL (the
|   PG mirror's ENUM grew `recommended` in migration 0017).
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function spOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "spown_$tag" . uniqid(),
        'email' => "spown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function spSpecialist(string $tag): User
{
    $user = User::create([
        'name' => "Spek $tag", 'username' => "sps_$tag" . uniqid(),
        'email' => "sps_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'structural',
    ]);

    StructuralEngineer::create(['user_id' => $user->id, 'nama' => "Struct $tag"]);

    return $user;
}

function spProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "Roster $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open', 'target_role' => 'both',
    ]);
}

function spUri(Project $project, string $suffix = ''): string
{
    return "/api/projects/{$project->id}/sub-professionals{$suffix}";
}

it('gates the roster and hides removed rows', function () {
    $owner = spOwner('idx');
    $stranger = spOwner('out');
    $pro = spSpecialist('idx');
    $project = spProject($owner, 'idx');

    $this->actingAs($stranger)
        ->getJson(spUri($project))
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    ProjectSubProfessional::create([
        'project_id' => $project->id, 'user_id' => $pro->id,
        'parent_role' => 'arsitek', 'sub_role' => 'structural',
        'assigned_by' => $owner->id, 'status' => 'active', 'rate' => 100,
    ]);
    ProjectSubProfessional::create([
        'project_id' => $project->id, 'user_id' => $stranger->id,
        'parent_role' => 'arsitek', 'sub_role' => 'interior',
        'assigned_by' => $owner->id, 'status' => 'removed', 'rate' => 0,
    ]);

    $data = $this->actingAs($owner)->getJson(spUri($project))->assertStatus(200)->json('data');
    expect($data)->toHaveCount(1);
    expect($data[0]['user']['name'])->toBe($pro->name);
    expect($data[0]['assigned_by_user']['name'])->toBe($owner->name);
});

it('assigns with create-order keys and refuses duplicates', function () {
    $owner = spOwner('asg');
    $pro = spSpecialist('asg');
    $project = spProject($owner, 'asg');

    $response = $this->actingAs($owner)
        ->postJson(spUri($project), [
            'user_id' => $pro->id, 'parent_role' => 'arsitek',
            'sub_role' => 'structural', 'rate' => 500000, 'scope_notes' => 'frame',
        ])
        ->assertStatus(201);

    expect(array_keys($response->json('data')))->toBe([
        'project_id', 'user_id', 'sub_role', 'parent_role', 'assigned_by', 'status',
        'rate', 'scope_notes', 'accepted_at', 'completed_at', 'updated_at', 'created_at', 'id', 'user',
    ]);
    expect($response->json('data.status'))->toBe('invited');
    expect($response->json('data.user.role_type'))->toBe('structural');

    expect(Notification::where('user_id', $pro->id)->where('type', 'sub_professional_invite')->count())->toBe(1);

    $this->actingAs($owner)
        ->postJson(spUri($project), ['user_id' => $pro->id, 'parent_role' => 'arsitek', 'sub_role' => 'structural'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'This professional is already assigned to this project.');
});

it('validates and gates the assignment', function () {
    $owner = spOwner('val');
    $other = spOwner('other');
    $project = spProject($owner, 'val');

    $this->actingAs($other)
        ->postJson(spUri($project), ['user_id' => $owner->id, 'parent_role' => 'arsitek', 'sub_role' => 'structural'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized to assign sub-professionals.');

    $this->actingAs($owner)
        ->postJson(spUri($project), [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['user_id', 'parent_role', 'sub_role']);

    $this->actingAs($owner)
        ->postJson(spUri($project), ['user_id' => 999999, 'parent_role' => 'arsitek', 'sub_role' => 'structural'])
        ->assertStatus(422)
        ->assertJsonPath('errors.user_id', ['The selected user id is invalid.']);
});

it('walks accept, interview, recommend and hire', function () {
    $owner = spOwner('flow');
    $pro = spSpecialist('flow');
    $project = spProject($owner, 'flow');
    $sub = ProjectSubProfessional::create([
        'project_id' => $project->id, 'user_id' => $pro->id,
        'parent_role' => 'arsitek', 'sub_role' => 'structural',
        'assigned_by' => $owner->id, 'status' => 'invited', 'rate' => 500000,
    ]);
    $bid = BidStructural::create([
        'project_id' => $project->id, 'structural_id' => $pro->structural_engineer->id,
        'price' => 500000, 'proposal' => 'Struct offer', 'status' => 'shortlisted',
    ]);

    $this->actingAs($owner)
        ->postJson(spUri($project, "/{$sub->id}/accept"))
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the invited professional can accept.');

    $this->actingAs($pro)
        ->postJson(spUri($project, "/{$sub->id}/accept"))
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'accepted');

    // The structural slot is linked on accept.
    expect($project->fresh()->structural_id)->toBe($pro->structural_engineer->id);

    $this->actingAs($owner)
        ->postJson(spUri($project, "/{$sub->id}/interview"))
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'interviewing');

    $this->actingAs($owner)
        ->postJson(spUri($project, "/{$sub->id}/recommend"), ['suggested_fee' => 750000, 'lead_pro_notes' => 'solid'])
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'recommended');

    // The bid is marked recommended — its VARCHAR status accepts it.
    expect($bid->fresh()->status)->toBe('recommended');
    expect($bid->fresh()->is_recommended)->toBeTrue();

    $this->actingAs($owner)
        ->postJson(spUri($project, "/{$sub->id}/hire"))
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'active');

    // The rate takes the recommended fee.
    expect($sub->fresh()->rate)->toBe('750000.00');
});

it('declines and removes, clearing the slot only on decline', function () {
    $owner = spOwner('dec');
    $pro = spSpecialist('dec');
    $project = spProject($owner, 'dec');
    $project->update(['structural_id' => $pro->structural_engineer->id]);
    $sub = ProjectSubProfessional::create([
        'project_id' => $project->id, 'user_id' => $pro->id,
        'parent_role' => 'arsitek', 'sub_role' => 'structural',
        'assigned_by' => $owner->id, 'status' => 'accepted', 'rate' => 500000,
    ]);

    $this->actingAs($pro)
        ->postJson(spUri($project, "/{$sub->id}/decline"))
        ->assertStatus(200)
        ->assertJsonPath('message', 'Assignment declined.');

    expect($sub->fresh()->status)->toBe('removed');
    expect($project->fresh()->structural_id)->toBeNull();
    expect(Notification::where('user_id', $owner->id)->where('type', 'sub_professional_declined')->count())->toBe(1);

    // remove is owner or assigner only
    $other = spOwner('dec-out');
    $this->actingAs($other)
        ->deleteJson(spUri($project, "/{$sub->id}"))
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized to remove this sub-professional.');
});
