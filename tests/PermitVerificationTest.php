<?php

use App\Models\Arsitek;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Permit verifications: PBG and SLF
|--------------------------------------------------------------------------
|
| Regression suite for the two regulatory stamps:
| - both are owner-or-assigned-PM only, with their own 403 sentences;
| - PBG is locked until the Architectural Construction Brief is approved
|   (the SIMBG pre-gate), SLF has no pre-gate;
| - each stamps its column, writes its activity line and answers the
|   LEAN ProjectResource (no relation blocks).
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function permitOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "ppm_$tag" . uniqid(),
        'email' => "ppm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function permitArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "ppa_$tag" . uniqid(),
        'email' => "ppa_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);

    return $user;
}

function permitProject(User $owner, string $tag, string $brief = 'approved'): Project
{
    return Project::create([
        'title' => "Permit $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open', 'target_role' => 'both',
        'construction_brief_status' => $brief,
    ]);
}

it('gates PBG on the owner and the approved brief', function () {
    $owner = permitOwner('pbg');
    $pro = permitArchitect('pbg');
    $draft = permitProject($owner, 'draft', 'draft');
    $approved = permitProject($owner, 'ok', 'approved');

    $this->actingAs($pro)
        ->postJson("/api/projects/{$draft->id}/verify-pbg")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the Project Owner or assigned Project Manager can verify PBG compliance.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$draft->id}/verify-pbg")
        ->assertStatus(422)
        ->assertJsonPath('message', 'Regulatory Block: PBG verification is locked until the Architectural Construction Brief (DED) is approved and locked.');

    expect($draft->fresh()->pbg_verified_at)->toBeNull();

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$approved->id}/verify-pbg")
        ->assertStatus(200);

    expect($approved->fresh()->pbg_verified_at)->not->toBeNull();
    // Lean resource: no relation blocks.
    expect($response->json('data'))->not->toHaveKey('bids_arsitek');
    expect($response->json('data'))->not->toHaveKey('sub_professionals');
    expect($response->json('data.budget_summary.currency'))->toBe('IDR');
});

it('stamps SLF behind the same gate and logs it', function () {
    $owner = permitOwner('slf');
    $pro = permitArchitect('slf');
    $project = permitProject($owner, 'slf');

    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/verify-slf")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the Project Owner or assigned Project Manager can verify SLF compliance.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/verify-slf")
        ->assertStatus(200);

    expect($project->fresh()->slf_verified_at)->not->toBeNull();

    $log = \App\Models\ProjectActivityLog::where('project_id', $project->id)->latest('id')->first();
    expect($log->action)->toBe('slf_verified');
    expect($log->details)->toContain('Certificate of Occupancy');
});
