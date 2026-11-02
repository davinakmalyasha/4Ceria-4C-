<?php

use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectComment;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Project comments: the workspace Q&A thread
|--------------------------------------------------------------------------
|
| - participants post and read; the created comment answers in create order
|   (user_id, message, parent_id, project_id, timestamps, id) with a
|   SANITIZED author (email and email_verified_at hidden);
| - a reply must point at a comment OF THE SAME PROJECT (422) and notifies
|   the parent's author; a top-level message notifies the owner;
| - only the author edits; the author or the owner deletes.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function cmOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "cmown_$tag" . uniqid(),
        'email' => "cmown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function cmContractor(string $tag): User
{
    $user = User::create([
        'name' => "Kon $tag", 'username' => "cmk_$tag" . uniqid(),
        'email' => "cmk_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    Kontraktor::create(['user_id' => $user->id, 'nama' => "Build $tag"]);

    return $user;
}

function cmProject(User $owner, User $kon, string $tag): Project
{
    return Project::create([
        'title' => "Comments $tag", 'user_id' => $owner->id,
        'budget' => 90_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'selected_kontraktor_id' => $kon->kontraktor->id,
    ]);
}

it('posts a top-level comment with a sanitized author', function () {
    $owner = cmOwner('post');
    $kon = cmContractor('post');
    $project = cmProject($owner, $kon, 'post');

    $response = $this->actingAs($kon)
        ->postJson("/api/projects/{$project->id}/comments", ['message' => 'when is the slab?'])
        ->assertStatus(200);

    $data = $response->json('data');
    expect($data)->toHaveCount(1);
    expect(array_keys($data[0]))->toBe([
        'user_id', 'message', 'parent_id', 'project_id', 'updated_at', 'created_at', 'id', 'user', 'parent',
    ]);
    expect($data[0]['user']['name'])->toBe($kon->name);
    expect($data[0]['user'])->not->toHaveKey('email');
    expect($data[0]['user'])->not->toHaveKey('email_verified_at');
    expect($data[0]['parent'])->toBeNull();

    expect(\App\Models\Notification::where('user_id', $owner->id)->where('type', 'project_message')->count())->toBe(1);
    expect(\App\Models\ProjectActivityLog::where('project_id', $project->id)->where('action', 'comment_posted')->count())->toBe(1);
});

it('replies to a comment and notifies its author', function () {
    $owner = cmOwner('rep');
    $kon = cmContractor('rep');
    $project = cmProject($owner, $kon, 'rep');

    $parent = ProjectComment::create([
        'project_id' => $project->id, 'user_id' => $kon->id, 'message' => 'when is the slab?',
    ]);

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/comments", [
            'message' => 'next monday', 'parent_id' => $parent->id,
        ])
        ->assertStatus(200);

    // A reply's relation order is parent first, then the author.
    expect(array_keys($response->json('data.0')))->toBe([
        'user_id', 'message', 'parent_id', 'project_id', 'updated_at', 'created_at', 'id', 'parent', 'user',
    ]);
    expect($response->json('data.0.parent.message'))->toBe('when is the slab?');
    expect($response->json('data.0.parent.user.name'))->toBe($kon->name);

    expect(\App\Models\Notification::where('user_id', $kon->id)->where('type', 'project_message')->count())->toBe(1);

    // A parent from ANOTHER project is refused with the controller's 422.
    $other = cmProject($owner, $kon, 'other');
    $foreign = ProjectComment::create([
        'project_id' => $other->id, 'user_id' => $owner->id, 'message' => 'foreign',
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/comments", ['message' => 'x', 'parent_id' => $foreign->id])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Invalid parent comment.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/comments", ['message' => 'x', 'parent_id' => 999999999])
        ->assertStatus(422)
        ->assertJsonPath('errors.parent_id', ['The selected parent id is invalid.']);
});

it('lists the thread for participants only', function () {
    $owner = cmOwner('idx');
    $kon = cmContractor('idx');
    $stranger = cmOwner('out');
    $project = cmProject($owner, $kon, 'idx');

    $parent = ProjectComment::create([
        'project_id' => $project->id, 'user_id' => $kon->id, 'message' => 'first',
    ]);
    ProjectComment::create([
        'project_id' => $project->id, 'user_id' => $owner->id, 'message' => 'reply', 'parent_id' => $parent->id,
    ]);

    $response = $this->actingAs($kon)
        ->getJson("/api/projects/{$project->id}/comments")
        ->assertStatus(200);

    expect($response->json('data'))->toHaveCount(2);
    expect($response->json('data.0.message'))->toBe('first');
    expect($response->json('data.1.parent.user.id'))->toBe($kon->id);
    expect($response->json('data.0.user'))->not->toHaveKey('email');

    $this->actingAs($stranger)
        ->getJson("/api/projects/{$project->id}/comments")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');
});

it('edits as the author and deletes as the author or owner', function () {
    $owner = cmOwner('edit');
    $kon = cmContractor('edit');
    $project = cmProject($owner, $kon, 'edit');
    $comment = ProjectComment::create([
        'project_id' => $project->id, 'user_id' => $kon->id, 'message' => 'first',
    ]);

    $response = $this->actingAs($kon)
        ->putJson("/api/projects/{$project->id}/comments/{$comment->id}", ['message' => 'edited'])
        ->assertStatus(200);

    // The update answers the row in table order, with NO relations.
    expect(array_keys($response->json('data')))->toBe([
        'id', 'project_id', 'user_id', 'parent_id', 'message', 'created_at', 'updated_at',
    ]);
    expect($response->json('data.message'))->toBe('edited');

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/comments/{$comment->id}", ['message' => 'hijack'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    // Cross-project binding is the plain 404.
    $other = cmProject($owner, $kon, 'other');
    $foreign = ProjectComment::create([
        'project_id' => $other->id, 'user_id' => $kon->id, 'message' => 'foreign',
    ]);
    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/comments/{$foreign->id}")
        ->assertStatus(404)
        ->assertJsonPath('message', 'Not found.');

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/comments/{$comment->id}")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Comment deleted');

    expect(ProjectComment::find($comment->id))->toBeNull();
});
