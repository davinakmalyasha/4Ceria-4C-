<?php

use App\Models\Arsitek;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Admin project actions: the CSV export and force-termination
|--------------------------------------------------------------------------
|
| - the export streams a UTF-8 BOM, an fputcsv header row (fields holding a
|   space are quoted) and one line per project ordered created_at DESC with
|   ids ascending inside equal timestamps;
| - `csvCell` prefixes a single quote on values starting with =, +, -, @, tab
|   or CR — a project title is attacker-controlled and Excel would EXECUTE
|   it in the admin's session;
| - force-terminate loads the project with its relations BEFORE mutating and
|   answers the raw 98-column model plus user/arsitek/kontraktor.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function expAdmin(string $tag): User
{
    return User::create([
        'name' => "Admin $tag", 'username' => "expadm_$tag" . uniqid(),
        'email' => "expadm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'admin',
    ]);
}

function expProject(User $owner, string $title, array $overrides = []): Project
{
    $createdAt = $overrides['created_at'] ?? null;
    unset($overrides['created_at']);

    $project = Project::create(array_merge([
        'title' => $title, 'user_id' => $owner->id,
        'budget' => 200_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'published_bidding_roles' => [],
    ], $overrides));

    if ($createdAt !== null) {
        // created_at is not fillable; assign it directly.
        $project->timestamps = false;
        $project->created_at = $createdAt;
        $project->save();
        $project->timestamps = true;
    }

    return $project;
}

it('streams the CSV with BOM, quoting and the injection guard', function () {
    $admin = expAdmin('csv');
    expProject($admin, '=CMD|calc', ['budget' => 2_500_000, 'created_at' => '2026-10-01 10:00:00']);

    $response = $this->actingAs($admin)
        ->get('/api/admin/projects/export?search=CMD');

    $response->assertStatus(200);
    $response->assertHeader('content-type', 'text/csv; charset=UTF-8');
    $response->assertHeader('cache-control', 'no-cache, private');
    expect($response->headers->get('content-disposition'))
        ->toMatch('/^attachment; filename=projects-export-\d{8}-\d{6}\.csv$/');

    $body = $response->streamedContent();

    // UTF-8 BOM, then the header row with quoted space-bearing fields.
    expect(substr($body, 0, 3))->toBe("\xEF\xBB\xBF");
    expect($body)->toContain("\xEF\xBB\xBFID,Title,Owner,Status,\"Budget (IDR)\",\"Created At\"\n");

    // The formula is neutralised with a leading quote.
    // No space or delimiter: fputcsv leaves it unquoted, only the guard quote is added.
    expect($body)->toContain("'=CMD|calc");
    expect($body)->toContain('"Admin csv');
});

it('exports matching rows with the owner and budget', function () {
    $admin = expAdmin('csv2');
    $owner = User::create([
        'name' => 'Owner Export', 'username' => 'expown' . uniqid(),
        'email' => 'expown' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    expProject($owner, 'Export Row One', [
        'budget' => 123_456_789, 'created_at' => '2026-10-02 11:22:33',
    ]);

    $body = $this->actingAs($admin)
        ->get('/api/admin/projects/export?search=Export Row One')
        ->assertStatus(200)
        ->streamedContent();

    expect($body)->toContain('"Export Row One"');
    expect($body)->toContain('"Owner Export"');
    expect($body)->toContain('123456789.00');
    expect($body)->toContain('"2026-10-02 11:22:33"');
});

it('force-terminates a project and returns the relation tree', function () {
    $admin = expAdmin('term');
    $owner = User::create([
        'name' => 'Owner Term', 'username' => 'termown' . uniqid(),
        'email' => 'termown' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $architect = User::create([
        'name' => 'Arch Term', 'username' => 'terma' . uniqid(),
        'email' => 'terma' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create(['user_id' => $architect->id, 'nama' => 'Term Studio']);
    $project = expProject($owner, 'Terminate Me', ['selected_arsitek_id' => $profile->id]);

    $response = $this->actingAs($admin)
        ->postJson("/api/admin/projects/{$project->id}/force-terminate")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Project forced terminated by Administrator.');

    expect($response->json('project.status'))->toBe('cancelled');
    expect($response->json('project'))->toHaveCount(101);
    expect(array_slice(array_keys($response->json('project')), -3))->toBe(['user', 'arsitek', 'kontraktor']);
    expect($response->json('project.user.id'))->toBe($owner->id);
    expect($response->json('project.arsitek.id'))->toBe($profile->id);
    expect($response->json('project.arsitek'))->not->toHaveKey('user');

    expect($project->fresh()->status)->toBe('cancelled');

    $this->actingAs($admin)
        ->postJson('/api/admin/projects/999999999/force-terminate')
        ->assertStatus(404);

    // Non-admins never reach the controller.
    $ownerAsStranger = User::create([
        'name' => 'Stranger', 'username' => 'termx' . uniqid(),
        'email' => 'termx' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $this->actingAs($ownerAsStranger)
        ->get('/api/admin/projects/export')
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized access.');
});
