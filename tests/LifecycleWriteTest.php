<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\Notification;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Lifecycle writes: invite, mark-complete and delete
|--------------------------------------------------------------------------
|
| Regression suite for the three S2 lifecycle writes:
| - invite admits the owner, the hired architect or the assigned PM and
|   mints an invited bid at price 0 with the fixed proposal sentence;
| - mark-complete is owner-only behind the completed/cancelled guards
|   and answers the lean resource;
| - delete refuses hired projects, paid/verifying payments and site
|   progress, terminates pending bids (the ENUM has no `cancelled`) and
|   soft-deletes.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function lcOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "lcown_$tag" . uniqid(),
        'email' => "lcown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function lcArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "lca_$tag" . uniqid(),
        'email' => "lca_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);

    return $user;
}

function lcProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "Lifecycle $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open', 'target_role' => 'both',
    ]);
}

it('invites a professional and refuses a second invitation', function () {
    $owner = lcOwner('inv');
    $pro = lcArchitect('inv');
    $project = lcProject($owner, 'inv');

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/invite", [
            'professional_id' => $pro->arsitek->id,
            'role_type' => 'arsitek',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Invitation sent successfully.');

    // The created model: create-order keys only.
    expect(array_keys($response->json('bid')))->toBe([
        'project_id', 'arsitek_id', 'price', 'proposal', 'status', 'updated_at', 'created_at', 'id',
    ]);
    expect($response->json('bid.price'))->toBe('0.00');
    expect($response->json('bid.status'))->toBe('invited');

    $bid = BidArsitek::where('project_id', $project->id)->sole();
    expect($bid->arsitek_id)->toBe($pro->arsitek->id);

    expect(Notification::where('user_id', $pro->id)->where('type', 'project_invitation')->count())->toBe(1);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/invite", [
            'professional_id' => $pro->arsitek->id,
            'role_type' => 'arsitek',
        ])
        ->assertStatus(422)
        ->assertJsonPath('message', 'This professional already has a bid or invitation for this project.');
});

it('validates and gates the invitation', function () {
    $owner = lcOwner('gate');
    $stranger = lcOwner('outsider');
    $project = lcProject($owner, 'gate');

    $this->actingAs($stranger)
        ->postJson("/api/projects/{$project->id}/invite", ['professional_id' => 1, 'role_type' => 'arsitek'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only the owner, assigned architect, or project manager can invite professionals.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/invite", [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['professional_id', 'role_type']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/invite", ['professional_id' => 999999, 'role_type' => 'arsitek'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'The invited professional could not be found for this role.');
});

it('completes the project for the owner only', function () {
    $owner = lcOwner('mc');
    $stranger = lcOwner('mc-out');
    $project = lcProject($owner, 'mc');

    $this->actingAs($stranger)
        ->postJson("/api/projects/{$project->id}/mark-complete")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the project owner can complete the project.');

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/mark-complete")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Project completed successfully.');

    expect($response->json('data.status'))->toBe('completed');
    expect($project->fresh()->status)->toBe('completed');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/mark-complete")
        ->assertStatus(422)
        ->assertJsonPath('message', 'Project is already completed.');
});

it('refuses deletion with a hire or a paid payment', function () {
    $owner = lcOwner('del');
    $pro = lcArchitect('del');
    $project = lcProject($owner, 'del');
    $project->update(['selected_arsitek_id' => $pro->arsitek->id]);

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}")
        ->assertStatus(422)
        ->assertJsonPath('message', 'Proyek tidak bisa dihapus karena sudah ada profesional yang disewa. Silakan gunakan pengajuan Pembatalan Bersama (Mutual Termination).');

    $paid = lcProject($owner, 'paid');
    \App\Models\ProjectPaymentTermin::create([
        'project_id' => $paid->id, 'role_type' => 'notaris',
        'label' => 'DP', 'percentage' => 50, 'amount' => 1_000_000, 'status' => 'paid',
    ]);

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$paid->id}")
        ->assertStatus(422)
        ->assertJsonPath('message', 'Proyek tidak bisa dihapus karena terdapat transaksi pembayaran yang sudah diverifikasi atau sedang dalam proses verifikasi bukti transfer.');

    expect(Project::find($paid->id))->not->toBeNull();
});

it('deletes an idle project, terminating its pending bids', function () {
    $owner = lcOwner('ok');
    $pro = lcArchitect('ok');
    $project = lcProject($owner, 'ok');
    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $pro->arsitek->id,
        'price' => 1_000_000, 'proposal' => 'x', 'status' => 'pending',
        'offered_by_id' => $pro->id,
    ]);

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Proyek berhasil dihapus.');

    // Soft delete, and the pending bid is terminated — never `cancelled`
    // (not an ENUM member: that was the strict-mode 1265 bug).
    expect(Project::find($project->id))->toBeNull();
    expect(Project::withTrashed()->find($project->id))->not->toBeNull();
    expect($bid->fresh()->status)->toBe('terminated');
});
