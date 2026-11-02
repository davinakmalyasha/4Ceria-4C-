<?php

use App\Models\NotarisProfile;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectDocument;
use App\Models\ProjectExternalVendor;
use App\Models\ProjectManager;
use App\Models\ProjectMilestone;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Technical audit and project creation
|--------------------------------------------------------------------------
|
| The audit approves milestones/documents in one pass: the PM marks them
| approved+completed, unlocks linked payment stages, syncs gallery files and
| moves the integration timestamp only when EVERY item is approved. Creating a
| project derives the published bidding roles, writes the opening deposit and
| imports external vendors.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function audUser(string $tag, string $role = 'user'): User
{
    return User::create([
        'name' => "AU $tag", 'username' => "au_$tag" . uniqid(),
        'email' => "au_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

function audProject(User $owner, string $tag, array $extra = []): Project
{
    return Project::create(array_merge([
        'title' => "AU Project $tag", 'user_id' => $owner->id,
        'budget' => 10000000, 'status' => 'open', 'target_role' => 'both',
    ], $extra));
}

it('audits milestones and documents as the PM', function () {
    $owner = audUser('own');
    $pmUser = audUser('pm', 'project_manager');
    $pmProfile = ProjectManager::create(['user_id' => $pmUser->id, 'nama' => 'PM']);
    $project = audProject($owner, 'aud', ['pm_id' => $pmProfile->id]);
    $notaryUser = audUser('not', 'notaris');
    $notaryProfile = NotarisProfile::create(['user_id' => $notaryUser->id, 'nama' => 'Notary']);

    $milestone = ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Audit Milestone',
        'type' => 'generic', 'content' => [], 'sort_order' => 1,
        'is_completed' => false, 'approval_status' => 'drafting',
        'notaris_id' => $notaryProfile->id,
    ]);
    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris',
        'recipient_id' => $notaryUser->id, 'label' => 'Audit DP',
        'percentage' => 50, 'amount' => 1000000, 'status' => 'locked',
        'milestone_id' => $milestone->id,
    ]);
    $document = ProjectDocument::create([
        'project_id' => $project->id, 'uploader_id' => $owner->id,
        'file_name' => 'Doc', 'version' => 1, 'file_path' => 'misc/doc.pdf',
        'status' => 'under_review',
    ]);

    $this->actingAs(audUser('str'))
        ->postJson("/api/projects/{$project->id}/technical-audit-submit", ['role_type' => 'structural'])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized']);

    $this->actingAs($pmUser)
        ->postJson("/api/projects/{$project->id}/technical-audit-submit", ['role_type' => 'bogus'])
        ->assertStatus(422)
        ->assertJsonPath('errors.role_type', ['The selected role type is invalid.']);

    $response = $this->actingAs($pmUser)
        ->postJson("/api/projects/{$project->id}/technical-audit-submit", [
            'role_type' => 'structural',
            'milestones' => [['id' => $milestone->id, 'status' => 'approved', 'note' => 'Looks good']],
            'documents' => [['id' => $document->id, 'status' => 'approved', 'note' => 'OK']],
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Audit submitted successfully');

    expect($response->json('unlocked_termins'))->toBe([[
        'label' => 'Audit DP', 'amount' => '1000000.00', 'milestone_title' => 'Audit Milestone',
    ]]);
    $fresh = $milestone->fresh();
    expect($fresh->approval_status)->toBe('approved');
    expect((bool) $fresh->is_completed)->toBeTrue();
    expect($fresh->pm_verified_at)->not->toBeNull();
    expect($fresh->lead_pro_verified_at)->toBeNull();
    expect($termin->fresh()->status)->toBe('pending');
    expect($document->fresh()->status)->toBe('approved');
    expect($document->fresh()->reviewed_at)->not->toBeNull();
    expect($project->fresh()->structural_approved_at)->not->toBeNull();
    expect(Notification::where('user_id', $notaryUser->id)
        ->where('type', 'milestone_approved')->count())->toBe(1);
    expect(ProjectActivityLog::where('project_id', $project->id)
        ->whereIn('action', ['payment_triggered', 'integration_approved'])->count())->toBe(2);

    // A revision request clears both verifications and blocks the integration.
    $second = audProject($owner, 'aud2', ['pm_id' => $pmProfile->id]);
    $secondMilestone = ProjectMilestone::create([
        'project_id' => $second->id, 'title' => 'Revise Me',
        'type' => 'generic', 'content' => [], 'sort_order' => 1,
        'is_completed' => false, 'approval_status' => 'drafting',
        'notaris_id' => $notaryProfile->id,
    ]);
    $this->actingAs($pmUser)
        ->postJson("/api/projects/{$second->id}/technical-audit-submit", [
            'role_type' => 'structural',
            'milestones' => [['id' => $secondMilestone->id, 'status' => 'revision_requested', 'note' => 'Fix it']],
        ])
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Audit submitted successfully', 'unlocked_termins' => []]);

    expect($secondMilestone->fresh()->approval_status)->toBe('pending');
    expect($secondMilestone->fresh()->lead_pro_verified_at)->toBeNull();
    expect($second->fresh()->structural_approved_at)->toBeNull();
    expect(Notification::where('user_id', $notaryUser->id)
        ->where('type', 'milestone_revision_requested')->count())->toBe(1);
});

it('creates a project with derived roles, deposit and vendors', function () {
    $owner = audUser('create');

    $this->actingAs($owner)
        ->postJson('/api/projects', [])
        ->assertStatus(422)
        ->assertJsonPath('errors.title', ['The title field is required.']);

    $response = $this->actingAs($owner)
        ->postJson('/api/projects', [
            'title' => 'New Build', 'description' => 'Build it',
            'budget' => 123000000, 'lokasi' => 'Bekasi',
            'project_category' => 'new_build', 'deadline' => '2026-12-31',
            'needed_phases' => json_encode(['design', 'build', 'legal']),
            'project_dimensions' => json_encode(['building_area' => 120]),
            'external_vendors' => json_encode([
                'notaris' => ['contact_person' => 'Vendor N', 'phone_number' => '08123', 'company_name' => 'Notary Co'],
            ]),
            'bidding_choices' => '[]',
            'wants_project_manager' => false,
        ])
        ->assertStatus(201);

    $data = $response->json('data');
    expect($data['title'])->toBe('New Build');
    // The notary phase is handled by an external vendor, so it is not published.
    expect($data['published_bidding_roles'])->toBe(['arsitek', 'kontraktor']);
    expect($data['target_role'])->toBeNull();
    expect($data['construction_brief_status'])->toBeNull();
    expect($data['planning_status'])->toBeNull();
    expect($data['requires_structural'])->toBeNull();

    $project = Project::where('title', 'New Build')->sole();
    expect($project->budget)->toBe('123000000.00');
    expect($project->status)->toBe('open');
    expect(ProjectExternalVendor::where('project_id', $project->id)->count())->toBe(1);
    $ledger = ProjectBudgetTransaction::where('project_id', $project->id)->sole();
    expect($ledger->transaction_type)->toBe('deposit');
    expect($ledger->title)->toBe('Opening project budget');
    expect(ProjectActivityLog::where('project_id', $project->id)
        ->where('action', 'project_created')->count())->toBe(1);
});
