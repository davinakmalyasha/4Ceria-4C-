<?php

use App\Models\Arsitek;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| A professional may not authorise their own fee
|--------------------------------------------------------------------------
|
| Regression suite for HIGH finding H3 of the final security audit, in
| ProjectBudgetController::handleAddendumStatus().
|
| THE BUG
| -------
| The gate was:
|
|     !($isPro && $addendum->status === 'negotiating')
|
| which admitted the proposing professional ONLY while a negotiation was open --
| and then let that same caller pass ANY status the validator allowed, including
| `approved_unpaid`, together with an arbitrary `amount`.
|
| So a hired professional could, in one request:
|   - set the fee to any number they liked, and
|   - mark it authorised,
|
| on their own addendum. The notification it produced was worse than the write
| itself: the copy hardcoded
|
|     $roleLabel = Auth::user()->role_type === 'project_manager'
|         ? 'Project Manager' : 'Owner';
|
| so a professional's action was announced to the client as "Budget Authorized
| by Owner ... Please proceed with the payment" -- a forged approval, attributed
| to the client, telling the client to pay.
|
| THE RULE
| --------
|   AUTHORISER (owner / assigned PM)  decides money: approve, reject, negotiate.
|   PROPOSER  (the professional who raised it)  may only RESPOND to a counter
|   offer: accept it, or answer with a revised counter. Never authorise, never
|   reject, never resubmit, and never write the author's own counter-offer.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function makeOwner(): User
{
    return User::create([
        'name' => 'Owner', 'username' => 'o' . uniqid(),
        'email' => 'o' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function makeArsitek(string $tag): array
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "a_$tag" . uniqid(),
        'email' => "a_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    $profile = Arsitek::create([
        'user_id' => $user->id, 'nama' => "Studio $tag",
        'verification_status' => 'verified',
    ]);

    return [$user, $profile];
}

/** Project with the architect hired, plus one addendum they raised. */
function projectWithAddendum(string $tag, string $status = 'negotiating'): array
{
    [$pro, $profile] = makeArsitek($tag);
    $owner = makeOwner();

    $project = Project::create([
        'title' => "Job $tag", 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
        'selected_arsitek_id' => $profile->id,
    ]);

    $addendum = ProjectAddendum::create([
        'project_id' => $project->id,
        'role_type' => 'arsitek',
        'user_id' => $pro->id,
        'title' => "Extra scope $tag",
        'amount' => 10_000_000,
        'type' => 'extra_fee',
        'status' => $status,
        'counter_offer_amount' => $status === 'negotiating' ? 7_500_000 : null,
    ]);

    return [$owner, $pro, $project, $addendum];
}

it('refuses to let a professional authorise their OWN addendum', function () {
    [$owner, $pro, $project, $addendum] = projectWithAddendum('x1');

    $this->actingAs($pro)
        ->putJson("/api/projects/{$project->id}/budget/addendums/{$addendum->id}", [
            'status' => 'approved_unpaid',
            'amount' => 999_000_000,
        ])
        ->assertStatus(403);

    expect($addendum->fresh()->status)->toBe('negotiating')
        ->and((float) $addendum->fresh()->amount)->toBe(10000000.0);
});

it('refuses to let a professional reject their OWN addendum', function () {
    [$owner, $pro, $project, $addendum] = projectWithAddendum('x2');

    $this->actingAs($pro)
        ->putJson("/api/projects/{$project->id}/budget/addendums/{$addendum->id}", [
            'status' => 'rejected',
        ])
        ->assertStatus(403);

    expect($addendum->fresh()->status)->toBe('negotiating');
});

it('refuses to let a professional re-submit their OWN addendum', function () {
    [$owner, $pro, $project, $addendum] = projectWithAddendum('x3');

    $this->actingAs($pro)
        ->putJson("/api/projects/{$project->id}/budget/addendums/{$addendum->id}", [
            'status' => 'pending_approval',
        ])
        ->assertStatus(403);
});

it('never attributes the professional\'s action to the Owner in a notification', function () {
    [$owner, $pro, $project, $addendum] = projectWithAddendum('x4');

    $this->actingAs($pro)
        ->putJson("/api/projects/{$project->id}/budget/addendums/{$addendum->id}", [
            'status' => 'approved_unpaid',
        ])
        ->assertStatus(403);

    $forged = Notification::where('type', 'budget_approved')
        ->where('user_id', $owner->id)
        ->exists();

    expect($forged)->toBeFalse();
});

it('still lets a professional ACCEPT a counter-offer', function () {
    [$owner, $pro, $project, $addendum] = projectWithAddendum('x5');

    $this->actingAs($pro)
        ->putJson("/api/projects/{$project->id}/budget/addendums/{$addendum->id}", [
            'status' => 'accepted_by_pro',
        ])
        ->assertStatus(200);

    expect($addendum->fresh()->status)->toBe('accepted_by_pro');
});

it('makes accepting a counter-offer adopt the COUNTER figure, not their own', function () {
    // Otherwise "accepting" the other side's number while keeping one's own is
    // precisely the forgery this method exists to prevent.
    [$owner, $pro, $project, $addendum] = projectWithAddendum('x6');

    $this->actingAs($pro)
        ->putJson("/api/projects/{$project->id}/budget/addendums/{$addendum->id}", [
            'status' => 'accepted_by_pro',
        ])
        ->assertStatus(200);

    expect((float) $addendum->fresh()->amount)->toBe(7500000.0);
});

it('refuses to let a professional forge the counter-offer they are answering', function () {
    [$owner, $pro, $project, $addendum] = projectWithAddendum('x7');

    $this->actingAs($pro)
        ->putJson("/api/projects/{$project->id}/budget/addendums/{$addendum->id}", [
            'status' => 'accepted_by_pro',
            'counter_offer_amount' => 1,
        ])
        ->assertStatus(403);

    // The author's instrument must survive untouched.
    expect((float) $addendum->fresh()->counter_offer_amount)->toBe(7500000.0);
});

it('lets a professional revise their counter WITHOUT destroying the author\'s position', function () {
    [$owner, $pro, $project, $addendum] = projectWithAddendum('x8');

    $this->actingAs($pro)
        ->putJson("/api/projects/{$project->id}/budget/addendums/{$addendum->id}", [
            'status' => 'negotiating',
            'amount' => 9_000_000,
        ])
        ->assertStatus(200);

    $fresh = $addendum->fresh();
    expect($fresh->status)->toBe('negotiating')
        ->and((float) $fresh->amount)->toBe(9000000.0)
        // The counter the author set is still on the record.
        ->and((float) $fresh->counter_offer_amount)->toBe(7500000.0);
});

it('still lets the OWNER authorise the addendum at the negotiated amount', function () {
    [$owner, $pro, $project, $addendum] = projectWithAddendum('x9');

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/budget/addendums/{$addendum->id}", [
            'status' => 'approved_unpaid',
            'amount' => 7_500_000,
        ])
        ->assertStatus(200);

    $fresh = $addendum->fresh();
    expect($fresh->status)->toBe('approved_unpaid')
        ->and((float) $fresh->amount)->toBe(7500000.0);
});

it('freezes the amount once the item is no longer in negotiation', function () {
    [$owner, $pro, $project, $addendum] = projectWithAddendum('x10');

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/budget/addendums/{$addendum->id}", [
            'status' => 'approved_unpaid',
            'amount' => 7_500_000,
        ])
        ->assertStatus(200);

    // Re-opening the price on an authorised item must be refused.
    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/budget/addendums/{$addendum->id}", [
            'status' => 'negotiating',
            'amount' => 50_000_000,
            'counter_offer_amount' => 50_000_000,
        ])
        ->assertStatus(422);

    expect((float) $addendum->fresh()->amount)->toBe(7500000.0);
});

it('refuses a professional who is not the proposer', function () {
    // A hired professional must not touch a colleague's addendum, even to accept
    // it -- the gate is authorship, not mere participation.
    [$owner, $pro, $project, $addendum] = projectWithAddendum('x11');

    [$other, $otherProfile] = makeArsitek('other');

    $this->actingAs($other)
        ->putJson("/api/projects/{$project->id}/budget/addendums/{$addendum->id}", [
            'status' => 'accepted_by_pro',
        ])
        ->assertStatus(403);
});

it('refuses a professional with no addendum state to respond to', function () {
    [$owner, $pro, $project, $addendum] = projectWithAddendum('x12', 'pending_approval');

    $this->actingAs($pro)
        ->putJson("/api/projects/{$project->id}/budget/addendums/{$addendum->id}", [
            'status' => 'accepted_by_pro',
        ])
        ->assertStatus(422);
});

it('does not let an UNHIRED professional with the matching role create an addendum', function () {
    // The null-comparison gate that `Hire::matches()` replaced: a user whose
    // role_type is 'arsitek', holding a profile, on a project with NO architect,
    // was admitted by `$project->selected_arsitek_id == optional($user->arsitek)->id`
    // because `null == null` is true.
    $owner = makeOwner();
    [$stranger, $profile] = makeArsitek('stranger');

    $project = Project::create([
        'title' => 'Unstaffed job', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
        // No selected_arsitek_id at all.
    ]);

    $this->actingAs($stranger)
        ->postJson("/api/projects/{$project->id}/budget/addendums", [
            'title' => 'Injected fee', 'amount' => 12_000_000,
        ])
        ->assertStatus(403);

    expect(ProjectAddendum::where('project_id', $project->id)->count())->toBe(0);
});