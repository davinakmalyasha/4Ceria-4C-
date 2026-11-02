<?php

use App\Models\Arsitek;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectDispute;
use App\Models\ProjectManager;
use App\Models\ProjectTermination;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Mutual termination
|--------------------------------------------------------------------------
|
| - GET lists the project's requests to participants;
| - POST initiate: reason/settlement validation, participant gate, active
|   status gate, project frozen at termination_pending, one activity row;
| - POST respond: initiator cannot answer, owner/assigned PM only, pending
|   only, accept cancels and reject reactivates;
| - POST escalate: a rejected request becomes an open dispute (idempotent),
|   which freezes payments.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function mtwUser(string $tag, string $role = 'user'): User
{
    return User::create([
        'name' => "MT $tag", 'username' => "mt_$tag" . uniqid(),
        'email' => "mt_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

function mtwProject(User $owner, string $tag, array $extra = []): Project
{
    return Project::create(array_merge([
        'title' => "MT Project $tag", 'user_id' => $owner->id,
        'budget' => 10000000, 'status' => 'open', 'target_role' => 'both',
    ], $extra));
}

it('lists termination requests to participants only', function () {
    $owner = mtwUser('idx');
    $project = mtwProject($owner, 'idx');

    $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/mutual-termination")
        ->assertStatus(200)
        ->assertExactJson(['data' => []]);

    $hired = mtwUser('idxh', 'arsitek');
    $profile = Arsitek::create(['user_id' => $hired->id, 'nama' => 'Hired']);
    $project->update(['selected_arsitek_id' => $profile->id]);

    $this->actingAs($hired)
        ->getJson("/api/projects/{$project->id}/mutual-termination")
        ->assertStatus(200);

    $this->actingAs(mtwUser('idxs'))
        ->getJson("/api/projects/{$project->id}/mutual-termination")
        ->assertStatus(403);
});

it('initiates a mutual termination and freezes the project', function () {
    $owner = mtwUser('init');
    $project = mtwProject($owner, 'init');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/mutual-termination/initiate", [])
        ->assertStatus(422)
        ->assertJsonPath('errors.reason', ['The reason field is required.']);

    $this->actingAs(mtwUser('inits'))
        ->postJson("/api/projects/{$project->id}/mutual-termination/initiate", ['reason' => 'x'])
        ->assertStatus(403);

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/mutual-termination/initiate", [
            'reason' => 'Owner relocating abroad',
            'settlement_terms' => 'Refund the unspent escrow.',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Pengajuan pembatalan bersama berhasil dibuat. Workspace dibekukan sementara.');

    expect(array_keys($response->json('data')))->toBe([
        'project_id', 'initiator_id', 'reason', 'settlement_terms',
        'status', 'updated_at', 'created_at', 'id',
    ]);
    expect($project->fresh()->status)->toBe('termination_pending');
    expect(ProjectActivityLog::where('project_id', $project->id)
        ->where('action', 'termination_initiated')->count())->toBe(1);

    // A second request is refused while the workspace is frozen.
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/mutual-termination/initiate", ['reason' => 'again'])
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Proyek tidak dalam status aktif untuk dibatalkan.']);
});

it('responds as the owner, accepting or rejecting', function () {
    $owner = mtwUser('resp');
    $initiator = mtwUser('respi', 'arsitek');
    $profile = Arsitek::create(['user_id' => $initiator->id, 'nama' => 'Init']);
    $project = mtwProject($owner, 'resp', [
        'selected_arsitek_id' => $profile->id,
        'status' => 'termination_pending',
    ]);
    $termination = ProjectTermination::create([
        'project_id' => $project->id, 'initiator_id' => $initiator->id,
        'reason' => 'Owner relocating', 'status' => 'pending',
    ]);

    $this->actingAs($initiator)
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/respond", ['action' => 'accept'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Anda tidak bisa menanggapi pengajuan yang Anda buat sendiri.');

    $this->actingAs($initiator)
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/respond", ['action' => 'bogus'])
        ->assertStatus(422)
        ->assertJsonPath('errors.action', ['The selected action is invalid.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/respond", ['action' => 'accept'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Proyek dibatalkan secara bersama.')
        ->assertJsonPath('data.status', 'accepted');

    expect($project->fresh()->status)->toBe('cancelled');
    expect($termination->fresh()->resolved_at)->not->toBeNull();

    // A processed request cannot be answered again.
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/respond", ['action' => 'reject'])
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Pengajuan ini sudah diproses.']);

    // Rejection reactivates the project and leaves resolved_at null.
    $second = ProjectTermination::create([
        'project_id' => $project->id, 'initiator_id' => $initiator->id,
        'reason' => 'Second try', 'status' => 'pending',
    ]);
    $project->update(['status' => 'termination_pending']);
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$second->id}/respond", ['action' => 'reject'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Pengajuan pembatalan ditolak. Proyek kembali aktif.')
        ->assertJsonPath('data.status', 'rejected')
        ->assertJsonPath('data.resolution_notes', 'Diselesaikan secara kekeluargaan.');

    expect($project->fresh()->status)->toBe('in_progress');
    expect($second->fresh()->resolved_at)->toBeNull();
});

it('escalates a rejected termination into an open dispute', function () {
    $owner = mtwUser('esc');
    $project = mtwProject($owner, 'esc', ['status' => 'termination_pending']);
    $termination = ProjectTermination::create([
        'project_id' => $project->id, 'initiator_id' => $owner->id,
        'reason' => 'Owner relocating', 'status' => 'rejected',
        'resolution_notes' => 'No agreement.',
    ]);

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/escalate")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Perselisihan berhasil dieskalasi ke Admin Platform. Admin akan melakukan review menyeluruh.');

    expect($termination->fresh()->status)->toBe('escalated');
    expect($response->json('dispute.termination_id'))->toBe($termination->id);
    expect($response->json('dispute.category'))->toBe('termination');
    expect($response->json('dispute.status'))->toBe('open');

    $dispute = ProjectDispute::where('project_id', $project->id)->where('status', 'open')->sole();
    expect(ProjectActivityLog::where('project_id', $project->id)
        ->whereIn('action', ['dispute_opened', 'termination_escalated'])->count())->toBe(2);
    expect(Notification::where('type', 'dispute_opened')->count())->toBeGreaterThan(0);

    // Idempotent: a retry returns the SAME open dispute.
    $again = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/escalate")
        ->assertStatus(200);
    expect($again->json('dispute.id'))->toBe($dispute->id);
    expect(ProjectDispute::where('project_id', $project->id)->count())->toBe(1);
});
