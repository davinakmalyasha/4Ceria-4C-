<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\ContractorSubspecialty;
use App\Models\DeliveryJob;
use App\Models\House;
use App\Models\HouseAnswer;
use App\Models\HouseQuestion;
use App\Models\Kontraktor;
use App\Models\MaterialQuote;
use App\Models\Project;
use App\Models\ProjectComment;
use App\Models\ProjectMilestone;
use App\Models\ProjectRequirement;
use App\Models\Room;
use App\Models\RoomPic;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| The remaining single routes
|--------------------------------------------------------------------------
|
| - GET /brief/{token}: unauthenticated, `rab` stripped, safe Q&A shape;
| - GET /contractor-subspecialties: category then label;
| - GET /my-bids: per-role table, lightweight project card, role_type;
| - GET /hire-history: every hired professional across the owner's projects;
| - GET /delivery-jobs: supplier-only raw join;
| - GET /verifications/documents/...: type/field allowlists and ownership;
| - POST /questions/{question}/answers: owner/admin gate;
| - DELETE /rooms/{room}: ownership, photo cleanup, refreshed house;
| - POST /upload: folder allowlist and validator messages.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function singleUser(string $tag, string $role = 'user'): User
{
    return User::create([
        'name' => "SR $tag", 'username' => "sr_$tag" . uniqid(),
        'email' => "sr_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

function singleProject(User $owner, string $tag, array $extra = []): Project
{
    return Project::create(array_merge([
        'title' => "SR Project $tag", 'user_id' => $owner->id,
        'budget' => 1000000, 'status' => 'open', 'target_role' => 'both',
    ], $extra));
}

it('serves the public brief with rab stripped and a safe Q&A shape', function () {
    $owner = singleUser('brief');
    $project = singleProject($owner, 'brief', [
        'share_token' => 'parity-token',
        'construction_details' => ['rab' => ['total' => 1], 'scope' => 'build'],
        'lokasi' => 'Bekasi',
        'city' => 'Bekasi',
    ]);

    $comment = ProjectComment::create([
        'project_id' => $project->id, 'user_id' => $owner->id,
        'message' => 'Is this open?', 'parent_id' => null,
    ]);
    ProjectComment::create([
        'project_id' => $project->id, 'user_id' => $owner->id,
        'message' => 'Yes.', 'parent_id' => $comment->id,
    ]);
    ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Second',
        'sort_order' => 2, 'is_completed' => false,
    ]);
    ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'First',
        'sort_order' => 1, 'is_completed' => true, 'content' => ['a' => 1],
    ]);
    ProjectRequirement::create([
        'project_id' => $project->id, 'user_id' => $owner->id,
        'name' => 'Cement', 'quantity_required' => 2, 'unit' => 'sak',
    ]);

    $this->getJson('/api/brief/missing-token')
        ->assertStatus(404)
        ->assertExactJson(['message' => 'Brief not found or link has been revoked.']);

    $response = $this->getJson('/api/brief/parity-token')
        ->assertStatus(200);

    expect(array_keys($response->json()))->toBe([
        'title', 'location', 'city', 'construction_details',
        'construction_locked_at', 'milestones', 'requirements', 'comments',
    ]);
    expect($response->json('construction_details'))->toBe(['scope' => 'build']);

    // sort_order decides the milestone order, not the id.
    expect(array_column($response->json('milestones'), 'title'))->toBe(['First', 'Second']);
    expect($response->json('milestones.0.is_completed'))->toBeTrue();
    expect($response->json('milestones.0.content'))->toBe(['a' => 1]);

    expect($response->json('requirements.0.name'))->toBe('Cement');
    expect($response->json('requirements.0.quantity_required'))->toBe('2.00');
    expect($response->json('requirements.0.image_url'))->toBeNull();

    // The commenter is reduced to a name: no email, no id.
    expect(array_keys($response->json('comments.0')))->toBe(['id', 'message', 'created_at', 'user', 'replies']);
    expect($response->json('comments.0.user'))->toBe(['name' => $owner->name]);
    expect(array_keys($response->json('comments.0.replies.0')))->toBe(['id', 'message', 'created_at', 'user']);
});

it('lists contractor subspecialties by category then label', function () {
    ContractorSubspecialty::create([
        'slug' => 'roofing-z', 'label' => 'Zeta Roofing', 'label_id' => 'Z',
        'category' => 'construction', 'icon' => 'roof',
    ]);
    ContractorSubspecialty::create([
        'slug' => 'roofing-a', 'label' => 'Alpha Roofing', 'label_id' => 'A',
        'category' => 'construction', 'icon' => 'roof',
    ]);
    ContractorSubspecialty::create([
        'slug' => 'design', 'label' => 'Beta Design', 'label_id' => 'B',
        'category' => 'mechanical', 'icon' => 'pen',
    ]);

    $response = $this->actingAs(singleUser('subs'))
        ->getJson('/api/contractor-subspecialties')
        ->assertStatus(200);

    // The live fixture ships rows in every category: assert the RELATIVE
    // order of this test's three labels and the global sort invariant.
    $labels = array_column($response->json('data'), 'label');
    $positions = array_map(fn ($label) => array_search($label, $labels, true), ['Alpha Roofing', 'Zeta Roofing', 'Beta Design']);
    expect($positions[0])->toBeLessThan($positions[1]);
    expect($positions[1])->toBeLessThan($positions[2]);
    // Category is an ENUM: construction < mechanical < finishing, so the
    // label order is only alphabetical WITHIN a category.
    expect($positions[0])->toBe(0);
    expect(array_search('Foundation Specialist', $labels, true))->toBeLessThan($positions[1]);
    expect(array_keys($response->json('data.0')))->toBe([
        'id', 'slug', 'label', 'label_id', 'category', 'icon', 'created_at', 'updated_at',
    ]);
});

it('returns my bids with the lightweight project card', function () {
    $pro = singleUser('bid', 'arsitek');
    $profile = Arsitek::create(['user_id' => $pro->id, 'nama' => 'SR Architect']);
    $owner = singleUser('bidowner');
    $project = singleProject($owner, 'bid');

    BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 50000000, 'proposal' => 'Draw it.', 'status' => 'pending',
        'offered_by_id' => $pro->id,
    ]);

    $response = $this->actingAs($pro)
        ->getJson('/api/my-bids')
        ->assertStatus(200);

    expect($response->json('data'))->toHaveCount(1);
    $bid = $response->json('data.0');
    expect(array_keys($bid))->toBe([
        'id', 'project_id', 'arsitek_id', 'price', 'price_max',
        'negotiation_count', 'fee_type', 'unit_price', 'quantity',
        'calculated_total', 'proposal', 'status', 'is_recommended',
        'estimated_duration', 'duration_unit', 'attachment_1', 'attachment_2',
        'attachment_3', 'payment_status', 'paid_at', 'scopes', 'deliverables',
        'style', 'created_at', 'updated_at', 'offered_by_id', 'fee_agreed_at',
        'payment_proof_path', 'verification_notes', 'proposed_termins',
        'proposed_milestones', 'proposed_team', 'refunded_amount',
        'project', 'role_type',
    ]);
    expect($bid['project'])->toBe([
        'id' => $project->id, 'title' => $project->title, 'status' => 'open',
    ]);
    expect(array_keys($bid['project']))->toBe(['id', 'title', 'status']);
    expect($bid['role_type'])->toBe('arsitek');

    // A role without a profile answers an empty list, not 403.
    $this->actingAs(singleUser('nobid', 'arsitek'))
        ->getJson('/api/my-bids')
        ->assertStatus(200)
        ->assertExactJson(['data' => []]);
});

it('lists the hire history across projects', function () {
    $owner = singleUser('hire');
    $pro = singleUser('hirepro', 'arsitek');
    $arsitek = Arsitek::create([
        'user_id' => $pro->id, 'nama' => 'Hired Architect',
        'no_telp' => '08123', 'foto' => 'profiles/arch.png',
    ]);
    singleProject($owner, 'hire', ['selected_arsitek_id' => $arsitek->id]);

    $response = $this->actingAs($owner)
        ->getJson('/api/hire-history')
        ->assertStatus(200)
        ->assertJsonPath('success', true);

    expect($response->json('data'))->toHaveCount(1);
    $row = $response->json('data.0');
    expect(array_keys($row))->toBe([
        'id', 'user_id', 'name', 'role', 'project_title', 'phone', 'avatar', 'hired_at',
    ]);
    expect($row['name'])->toBe('Hired Architect');
    expect($row['role'])->toBe('Architect');
    expect($row['phone'])->toBe('08123');
    expect($row['avatar'])->toEndWith('/storage/profiles/arch.png');

    // Someone without projects sees an empty history.
    $this->actingAs(singleUser('hirenone'))
        ->getJson('/api/hire-history')
        ->assertStatus(200)
        ->assertExactJson(['success' => true, 'data' => []]);
});

it('serves delivery jobs to suppliers only, as raw rows', function () {
    $supplierUser = singleUser('supp', 'supplier');
    $supplier = Supplier::create([
        'user_id' => $supplierUser->id, 'store_name' => 'SR Store',
        'category' => 'Furniture', 'verification_status' => 'verified',
    ]);
    $buyer = singleUser('buyer');
    $quote = MaterialQuote::create([
        'user_id' => $buyer->id, 'supplier_id' => $supplier->id,
        'items' => [['name' => 'Sofa', 'qty' => 1, 'price' => 100]],
        'delivery_address' => 'Jl. Parity', 'total_amount' => 300,
        'status' => 'approved', 'shipping_cost' => 2500,
    ]);
    DeliveryJob::create([
        'quote_id' => $quote->id, 'logistics_id' => $buyer->id,
        'pickup_address' => 'Warehouse', 'dropoff_address' => 'Jl. Parity',
        'status' => 'picked_up', 'agreed_fee' => 2500,
        'estimated_weight' => '500kg', 'pickup_photos' => ['a.jpg'],
    ]);

    $this->actingAs(singleUser('notsupp'))
        ->getJson('/api/delivery-jobs')
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized']);

    $response = $this->actingAs($supplierUser)
        ->getJson('/api/delivery-jobs')
        ->assertStatus(200)
        ->assertJsonPath('success', true);

    expect($response->json('data'))->toHaveCount(1);
    $row = $response->json('data.0');
    expect(array_keys($row))->toBe([
        'id', 'quote_id', 'order_id', 'logistics_id', 'pickup_address',
        'dropoff_address', 'status', 'agreed_fee', 'estimated_weight',
        'created_at', 'updated_at', 'pickup_photos', 'delivery_photos',
        'delivery_address', 'total_amount', 'driver_user_id', 'driver_name',
        'driver_phone', 'vehicle_type', 'license_plate',
    ]);
    // Query-builder rows: no casts, JSON stays the stored TEXT.
    expect($row['agreed_fee'])->toBe('2500.00');
    expect($row['total_amount'])->toBe('300.00');
    expect($row['pickup_photos'])->toBe('["a.jpg"]');
    // An unstored JSON column casts to null, not `[]`.
    expect($row['delivery_photos'])->toBeNull();
});

it('guards the verification document endpoint', function () {
    $owner = singleUser('vowner', 'arsitek');
    $profile = Arsitek::create([
        'user_id' => $owner->id, 'nama' => 'Doc Owner', 'npwp' => null,
        'foto' => 'verifications/doc.jpg',
    ]);

    $this->actingAs($owner)
        ->getJson('/api/verifications/documents/bogus/1/foto')
        ->assertStatus(400)
        ->assertExactJson(['message' => 'Invalid professional type']);

    $this->actingAs($owner)
        ->getJson("/api/verifications/documents/arsitek/{$profile->id}/password")
        ->assertStatus(400)
        ->assertExactJson(['message' => 'Invalid document request field']);

    $this->actingAs($owner)
        ->getJson('/api/verifications/documents/arsitek/999999999/foto')
        ->assertStatus(404);

    $this->actingAs($owner)
        ->getJson("/api/verifications/documents/arsitek/{$profile->id}/npwp")
        ->assertStatus(404)
        ->assertExactJson(['message' => 'No document uploaded for this field.']);

    $this->actingAs(singleUser('vstranger'))
        ->getJson("/api/verifications/documents/arsitek/{$profile->id}/foto")
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized access to credentials.']);
});

it('lets only the listing owner or an admin answer a question', function () {
    $owner = singleUser('qaowner');
    $house = House::create([
        'name' => 'QA House', 'price' => 1000, 'house_desc' => 'x',
        'width' => '10', 'length' => '20', 'br' => 2, 'ba' => 1,
        'floors' => 1, 'coordinate' => '-6.2, 106.8', 'street_name' => 'Jl',
        'kelurahan' => 'Kel', 'kecamatan' => 'Kec', 'kab_kota' => 'Kota',
        'province' => 'Prov', 'postal_code' => '12345', 'views' => 0,
        'id_user' => $owner->id, 'is_suspended' => false,
    ]);
    $question = HouseQuestion::create([
        'house_id' => $house->id, 'user_id' => $owner->id,
        'question' => 'Available?',
    ]);

    $this->actingAs(singleUser('qastranger'))
        ->postJson("/api/questions/{$question->id}/answers", ['answer' => 'Yes'])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Only the property owner can answer questions.']);

    $this->actingAs($owner)
        ->postJson("/api/questions/{$question->id}/answers", [])
        ->assertStatus(422)
        ->assertJsonPath('errors.answer', ['The answer field is required.']);

    $response = $this->actingAs($owner)
        ->postJson("/api/questions/{$question->id}/answers", ['answer' => 'Yes, available.'])
        ->assertStatus(201);

    expect(array_keys($response->json('data')))->toBe(['id', 'answer', 'user', 'created_at']);
    expect($response->json('data.user.email'))->toBe($owner->email);

    // An admin may answer a listing they do not own.
    $admin = singleUser('qaadmin', 'admin');
    $admin->assignRole('admin');
    $this->actingAs($admin)
        ->postJson("/api/questions/{$question->id}/answers", ['answer' => 'Admin here.'])
        ->assertStatus(201);
});

it('deletes a room for its owner and refreshes the house', function () {
    $owner = singleUser('room');
    $house = House::create([
        'name' => 'Room House', 'price' => 1000, 'house_desc' => 'x',
        'width' => '10', 'length' => '20', 'br' => 2, 'ba' => 1,
        'floors' => 1, 'coordinate' => '-6.2, 106.8', 'street_name' => 'Jl',
        'kelurahan' => 'Kel', 'kecamatan' => 'Kec', 'kab_kota' => 'Kota',
        'province' => 'Prov', 'postal_code' => '12345', 'views' => 0,
        'id_user' => $owner->id, 'is_suspended' => false,
    ]);
    $room = Room::create([
        'name' => 'Bedroom', 'type' => 'bedroom', 'width' => '3',
        'length' => '4', 'desc' => 'x', 'id_house' => $house->id,
    ]);
    RoomPic::create(['id_room' => $room->id, 'dir' => 'rooms/pic.jpg']);

    Storage::fake('public');
    Storage::disk('public')->put('rooms/pic.jpg', 'bytes');

    $this->actingAs(singleUser('roomstranger'))
        ->deleteJson("/api/rooms/{$room->id}")
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Unauthorized action. You do not own this house.']);

    $response = $this->actingAs($owner)
        ->deleteJson("/api/rooms/{$room->id}")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Room deleted successfully');

    expect($response->json('house.id'))->toBe($house->id);
    expect($response->json('house.roomList'))->toBe([]);
    expect(Room::find($room->id))->toBeNull();
    Storage::disk('public')->assertMissing('rooms/pic.jpg');
});

it('uploads a document into an allowlisted folder', function () {
    Storage::fake('public');
    $owner = singleUser('upload');

    $this->actingAs($owner)
        ->postJson('/api/upload', [])
        ->assertStatus(422)
        ->assertJsonPath('errors.file', ['The file field is required.']);

    $this->actingAs($owner)
        ->postJson('/api/upload', ['file' => 'not-a-file'])
        ->assertStatus(422)
        ->assertJsonPath('errors.file', [
            'The file field must be a file.',
            'The file field must be a file of type: jpg, jpeg, png, pdf, webp.',
        ]);

    $response = $this->actingAs($owner)
        ->post('/api/upload', [
            'file' => UploadedFile::fake()->create('brief.pdf', 12, 'application/pdf'),
            'folder' => 'design_briefs',
        ], ['Accept' => 'application/json'])
        ->assertStatus(200);

    expect($response->json('path'))->toStartWith('design_briefs/');
    expect($response->json('path'))->toEndWith('.pdf');
    // The fake disk can sign a temporary URL; the local disk cannot, and
    // the controller then falls back to the plain storage path.
    expect($response->json('url'))->toContain($response->json('path'));
    Storage::disk('public')->assertExists($response->json('path'));

    // An unknown folder falls back to project_assets.
    $fallback = $this->actingAs($owner)
        ->post('/api/upload', [
            'file' => UploadedFile::fake()->create('shot.png', 4, 'image/png'),
            'folder' => 'receipts',
        ], ['Accept' => 'application/json'])
        ->assertStatus(200);
    expect($fallback->json('path'))->toStartWith('project_assets/');
});

it('rejects a wrong document type with the validator message', function () {
    Storage::fake('public');

    $this->actingAs(singleUser('uploadbad'))
        ->post('/api/upload', [
            'file' => UploadedFile::fake()->create('notes.txt', 1, 'text/plain'),
        ], ['Accept' => 'application/json'])
        ->assertStatus(422)
        ->assertJsonPath('errors.file', [
            'The file field must be a file of type: jpg, jpeg, png, pdf, webp.',
        ]);
});
