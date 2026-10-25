<?php

namespace App\Support\ContractCapture;

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\BidKontraktor;
use App\Models\BidMep;
use App\Models\BidNotaris;
use App\Models\BidStructural;
use App\Models\ChatMessage;
use App\Models\Conversation;
use App\Models\CourierProfile;
use App\Models\DeliveryJob;
use App\Models\DisputeMessage;
use App\Models\Favorite;
use App\Models\FirmMember;
use App\Models\House;
use App\Models\HouseAnswer;
use App\Models\HouseQuestion;
use App\Models\Kontraktor;
use App\Models\Material;
use App\Models\MaterialOrder;
use App\Models\MaterialOrderItem;
use App\Models\MaterialOrderReview;
use App\Models\MaterialQuote;
use App\Models\MepEngineer;
use App\Models\NotarisConsultation;
use App\Models\NotarisProfile;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectAddendum;
use App\Models\ProjectBudgetSandbox;
use App\Models\ProjectChangeOrder;
use App\Models\ProjectComment;
use App\Models\ProjectDailyLog;
use App\Models\ProjectDelay;
use App\Models\ProjectDispute;
use App\Models\ProjectDocument;
use App\Models\ProjectExternalVendor;
use App\Models\ProjectImage;
use App\Models\ProjectMaterialFolder;
use App\Models\ProjectMilestone;
use App\Models\ProjectPaymentTermin;
use App\Models\ProjectProcurementRequest;
use App\Models\ProjectReport;
use App\Models\ProjectRequirement;
use App\Models\ProjectRequirementHistory;
use App\Models\ProjectSchedule;
use App\Models\ProjectSnagItem;
use App\Models\ProjectSubProfessional;
use App\Models\ProjectTermination;
use App\Models\ProjectTimelineExtension;
use App\Models\ProjectWarrantyClaim;
use App\Models\Room;
use App\Models\StickyNote;
use App\Models\StructuralEngineer;
use App\Models\Supplier;
use App\Models\TeamMember;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Hash;

/**
 * The world the capture records against.
 *
 * WHY A FIXTURE AT ALL
 * --------------------
 * A golden file is a RECORDING, and a recording is only meaningful if the
 * thing it recorded is the same thing every time. The legacy application
 * answers differently depending on who is asking — `ProjectResource` gates
 * the phone number and the construction details on the viewer's
 * relationship to the project, and `visibleBids()` filters the bids by the
 * same — so "the response" is not a thing until the asker and the state are
 * pinned.
 *
 * So the capture runs against a fixture: a small, complete, DETERMINISTIC
 * world with one of everything an endpoint might need.
 *
 * WHY THE IDS ARE PINNED
 * ----------------------
 * The ids are NOT normalised out of the recorded bodies. A golden file that
 * said "there is an id here" could not catch an endpoint that returned the
 * WRONG id, and the id is exactly the thing a port is most likely to get
 * wrong — a profile id where a user id belongs, or a user id where a
 * profile id belongs, which is the id-space confusion that produced three
 * of the legacy application's defects.
 *
 * So the fixture pins every id it creates, in a reserved range above
 * anything the application has ever used, and the recorded bodies carry
 * those ids verbatim. The same fixture has to be reproduced on the Go side,
 * and that is a requirement worth having: the two engines have to agree on
 * what the world looks like before they can agree on what it answers.
 *
 * The range is 900 000 000 and up. The application has used ids up to about
 * 65 000, so there is no collision, and the fixture CHECKS rather than
 * assumes: it refuses to build on a database where the range is occupied.
 */
final class Fixture
{
    /**
     * The first id of the reserved range.
     */
    public const ID_BASE = 900_000_000;

    /**
     * The size of one table's band inside the reserved range.
     *
     * EACH TABLE GETS ITS OWN BAND, because a row the endpoint CREATES gets
     * its id from that table's auto-increment counter — and the counter
     * lands in the middle of the reserved range, where it can land on top of
     * another table's fixture id.
     *
     * That is not a theoretical problem: the sticky-note endpoint's created
     * row was assigned 900 000 057, which is the fixture's 58th entity, and
     * the recording could not tell the two apart.
     *
     * With a band per table, a created id is always above its own table's
     * fixture ids and always below the next table's, so it can never
     * collide with anything.
     */
    public const BAND_SIZE = 1_000;

    /**
     * The version of the fixture.
     *
     * A golden file records the version it was recorded against, and the
     * comparison refuses a file recorded against a different one — because a
     * change to the fixture changes what the bodies MEAN.
     */
    public const VERSION = 1;

    /**
     * The `unique_code` the fixture's users carry.
     *
     * PINNED, because `User::generateUniqueCode()` uses `random_int` and
     * the side effects record the user row — so the recording would differ
     * between two captures of the same endpoint.
     */
    public const UNIQUE_CODE_PREFIX = 'CAP';

    /**
     * The ids, by entity name.
     *
     * @var array<string, int>
     */
    private array $ids = [];

    /**
     * The bearer tokens, by identity name.
     *
     * @var array<string, string>
     */
    private array $tokens = [];

    /**
     * The next id in the reserved range.
     *
     * It is an INSTANCE property, not a static one, because the fixture is
     * rebuilt for every endpoint: a static counter would give the second
     * build a different set of ids, and the recordings would not be of the
     * same world.
     */
    private int $next = self::ID_BASE;

    /**
     * The band each table's ids come from.
     *
     * @var array<string, int>
     */
    private array $bands = [];

    /**
     * How many ids each table has used.
     *
     * @var array<string, int>
     */
    private array $bandCounters = [];

    /**
     * Build the fixture.
     *
     * The caller is responsible for the transaction: the fixture is created
     * inside one that is rolled back, so a capture never leaves a trace on
     * the database.
     */
    public function build(): void
    {
        $this->bands = [];
        $this->bandCounters = [];

        $this->assertTheRangeIsFree();

        $this->buildPeople();
        $this->buildProject();
        $this->buildBids();
        $this->buildProjectChildren();
        $this->buildMarketplace();
        $this->buildHouses();
        $this->buildFirm();
        $this->buildConversations();
    }

    /**
     * The id of an entity.
     */
    public function id(string $entity): int
    {
        if (! isset($this->ids[$entity])) {
            throw new \RuntimeException("the fixture has no entity named '{$entity}'");
        }

        return $this->ids[$entity];
    }

    /**
     * The bearer token for an identity.
     */
    public function token(string $identity): string
    {
        if (! isset($this->tokens[$identity])) {
            throw new \RuntimeException("the fixture has no identity named '{$identity}'");
        }

        return $this->tokens[$identity];
    }

    /**
     * The bearer token for an identity, re-minted if the application took it.
     *
     * The application can consume a token: `POST /api/logout` deletes the
     * caller's, and suspending a user revokes every token they hold. A
     * capture that ran 296 endpoints in a row would have every request
     * after the first logout answered 401 — a recording of the capture's
     * own breakage rather than of the application.
     *
     * So the token is checked before each request and re-minted when it is
     * gone. The endpoint that consumed it still records what it did.
     */
    public function ensureToken(string $identity): string
    {
        $token = $this->token($identity);

        if (\App\Models\PersonalAccessToken::findToken($token) !== null) {
            return $token;
        }

        $user = \App\Models\User::where('id', $this->ids[$this->userEntityFor($identity)])->first();

        if (! $user) {
            throw new \RuntimeException("the fixture has no user for the identity '{$identity}'");
        }

        $this->tokens[$identity] = $user->createToken('contract-capture')->plainTextToken;

        return $this->tokens[$identity];
    }

    /**
     * The fixture entity that holds an identity's user.
     */
    private function userEntityFor(string $identity): string
    {
        return match ($identity) {
            'owner' => 'owner',
            'stranger' => 'stranger',
            'admin' => 'admin',
            'arsitek' => 'arsitek_user',
            'kontraktor' => 'kontraktor_user',
            'notaris' => 'notaris_user',
            'pm' => 'pm_user',
            'structural' => 'structural_user',
            'mep' => 'mep_user',
            'supplier' => 'supplier_user',
            'courier' => 'courier_user',
            default => throw new \RuntimeException("the fixture has no identity named '{$identity}'"),
        };
    }

    /**
     * The identities the capture can act as.
     *
     * @return list<string>
     */
    public function identities(): array
    {
        return array_keys($this->tokens);
    }

    /**
     * All the ids, for the golden file's metadata.
     *
     * @return array<string, int>
     */
    public function ids(): array
    {
        $ids = $this->ids;
        ksort($ids);

        return $ids;
    }

    // -----------------------------------------------------------------------
    // The people.
    // -----------------------------------------------------------------------

    private function buildPeople(): void
    {
        // The password. A bcrypt hash has a random salt, so it is NOT
        // deterministic — and it does not need to be, because the
        // normaliser REDACTS the password column out of the recorded side
        // effects. A hash in a committed golden file is a hash in the
        // repository's history for ever, and it is not part of any contract.
        $password = Hash::make('contract-capture');

        $owner = $this->create(User::class, [
            'name' => 'Contract Capture Owner',
            'username' => 'capture_owner',
            'unique_code' => 'CAP000',
            'email' => 'capture_owner@example.test',
            'password' => $password,
            'role_type' => 'user',
            // The owner is also a FIRM owner, so the firm endpoints have a
            // firm to find.
            'firm_name' => 'Contract Capture Firm',
            'firm_slogan' => 'A fixture firm.',
            'firm_description' => 'A fixture firm.',
            'firm_is_hiring' => true,
        ]);
        $this->ids['owner'] = $owner->id;
        $this->tokens['owner'] = $owner->createToken('contract-capture')->plainTextToken;

        $stranger = $this->create(User::class, [
            'name' => 'Contract Capture Stranger',
            'username' => 'capture_stranger',
            'unique_code' => 'CAP001',
            'email' => 'capture_stranger@example.test',
            'password' => $password,
            'role_type' => 'user',
        ]);
        $this->ids['stranger'] = $stranger->id;
        $this->tokens['stranger'] = $stranger->createToken('contract-capture')->plainTextToken;

        $admin = $this->create(User::class, [
            'name' => 'Contract Capture Admin',
            'username' => 'capture_admin',
            'unique_code' => 'CAP002',
            'email' => 'capture_admin@example.test',
            'password' => $password,
            'role_type' => 'admin',
        ]);
        $this->ids['admin'] = $admin->id;
        $this->tokens['admin'] = $admin->createToken('contract-capture')->plainTextToken;

        // The professionals. Each has a PROFILE, because `projects.selected_*`
        // holds a profile id — the id-space rule that three legacy defects
        // came from.
        $arsitekUser = $this->create(User::class, [
            'name' => 'Contract Capture Architect',
            'username' => 'capture_arsitek',
            'unique_code' => 'CAP003',
            'email' => 'capture_arsitek@example.test',
            'password' => $password,
            'role_type' => 'arsitek',
        ]);
        $this->ids['arsitek_user'] = $arsitekUser->id;
        $this->tokens['arsitek'] = $arsitekUser->createToken('contract-capture')->plainTextToken;

        $this->ids['arsitek'] = $this->create(Arsitek::class, [
            'user_id' => $arsitekUser->id,
            'nama' => 'Contract Capture Architect',
            'no_telp' => '081100000001',
            'rate_harga' => 25_000_000,
            'spesialisasi' => 'Architecture',
            'deskripsi' => 'A fixture architect.',
            'lokasi' => 'Jakarta Pusat',
            'pengalaman_tahun' => 8,
            'verification_status' => 'verified',
            'entity_type' => 'individual',
        ])->id;

        $kontraktorUser = $this->create(User::class, [
            'name' => 'Contract Capture Contractor',
            'username' => 'capture_kontraktor',
            'unique_code' => 'CAP004',
            'email' => 'capture_kontraktor@example.test',
            'password' => $password,
            'role_type' => 'kontraktor',
        ]);
        $this->ids['kontraktor_user'] = $kontraktorUser->id;
        $this->tokens['kontraktor'] = $kontraktorUser->createToken('contract-capture')->plainTextToken;

        $this->ids['kontraktor'] = $this->create(Kontraktor::class, [
            'user_id' => $kontraktorUser->id,
            'nama' => 'Contract Capture Contractor',
            'no_telepon' => '081100000002',
            'nama_perusahaan' => 'CV Capture',
            'pengalaman' => 5,
            'spesialisasi' => 'Construction',
            'rate_harga' => 30_000_000,
            'verification_status' => 'verified',
            'entity_type' => 'company',
            'company_name' => 'CV Capture',
        ])->id;

        $notarisUser = $this->create(User::class, [
            'name' => 'Contract Capture Notary',
            'username' => 'capture_notaris',
            'unique_code' => 'CAP005',
            'email' => 'capture_notaris@example.test',
            'password' => $password,
            'role_type' => 'notaris',
        ]);
        $this->ids['notaris_user'] = $notarisUser->id;
        $this->tokens['notaris'] = $notarisUser->createToken('contract-capture')->plainTextToken;

        $this->ids['notaris'] = $this->create(NotarisProfile::class, [
            'user_id' => $notarisUser->id,
            'nama' => 'Contract Capture Notary',
            'no_telp' => '081100000003',
            'nomor_sk' => 'SK-CAPTURE-001',
            'wilayah_kerja' => 'DKI Jakarta',
            'spesialisasi' => 'Property Law',
            'deskripsi' => 'A fixture notary.',
            'lokasi' => 'Jakarta Pusat',
            'pengalaman_tahun' => 12,
            'rate_harga' => 5_000_000,
            'verification_status' => 'verified',
            'entity_type' => 'individual',
        ])->id;

        $pmUser = $this->create(User::class, [
            'name' => 'Contract Capture PM',
            'username' => 'capture_pm',
            'unique_code' => 'CAP006',
            'email' => 'capture_pm@example.test',
            'password' => $password,
            'role_type' => 'project_manager',
        ]);
        $this->ids['pm_user'] = $pmUser->id;
        $this->tokens['pm'] = $pmUser->createToken('contract-capture')->plainTextToken;

        $this->ids['pm'] = $this->create(\App\Models\ProjectManager::class, [
            'user_id' => $pmUser->id,
            'nama' => 'Contract Capture PM',
            'no_telp' => '081100000004',
            'rate_harga' => 25_000_000,
            'spesialisasi' => 'Project Management',
            'deskripsi' => 'A fixture project manager.',
            'lokasi' => 'Jakarta Barat',
            'pengalaman_tahun' => 10,
            'verification_status' => 'verified',
            'entity_type' => 'individual',
        ])->id;

        $structuralUser = $this->create(User::class, [
            'name' => 'Contract Capture Structural',
            'username' => 'capture_structural',
            'unique_code' => 'CAP007',
            'email' => 'capture_structural@example.test',
            'password' => $password,
            'role_type' => 'structural',
        ]);
        $this->ids['structural_user'] = $structuralUser->id;
        $this->tokens['structural'] = $structuralUser->createToken('contract-capture')->plainTextToken;

        $this->ids['structural'] = $this->create(StructuralEngineer::class, [
            'user_id' => $structuralUser->id,
            'nama' => 'Contract Capture Structural',
            'no_telp' => '081100000005',
            'rate_harga' => 20_000_000,
            'spesialisasi' => 'Structural Engineering',
            'deskripsi' => 'A fixture structural engineer.',
            'lokasi' => 'Jakarta Selatan',
            'pengalaman_tahun' => 7,
            'verification_status' => 'verified',
            'entity_type' => 'individual',
        ])->id;

        $mepUser = $this->create(User::class, [
            'name' => 'Contract Capture MEP',
            'username' => 'capture_mep',
            'unique_code' => 'CAP008',
            'email' => 'capture_mep@example.test',
            'password' => $password,
            'role_type' => 'mep',
        ]);
        $this->ids['mep_user'] = $mepUser->id;
        $this->tokens['mep'] = $mepUser->createToken('contract-capture')->plainTextToken;

        $this->ids['mep'] = $this->create(MepEngineer::class, [
            'user_id' => $mepUser->id,
            'nama' => 'Contract Capture MEP',
            'no_telp' => '081100000006',
            'rate_harga' => 20_000_000,
            'spesialisasi' => 'MEP Engineering',
            'deskripsi' => 'A fixture MEP engineer.',
            'lokasi' => 'Jakarta Timur',
            'pengalaman_tahun' => 6,
            'verification_status' => 'verified',
            'entity_type' => 'individual',
        ])->id;

        $supplierUser = $this->create(User::class, [
            'name' => 'Contract Capture Supplier',
            'username' => 'capture_supplier',
            'unique_code' => 'CAP009',
            'email' => 'capture_supplier@example.test',
            'password' => $password,
            'role_type' => 'supplier',
        ]);
        $this->ids['supplier_user'] = $supplierUser->id;
        $this->tokens['supplier'] = $supplierUser->createToken('contract-capture')->plainTextToken;

        $this->ids['supplier'] = $this->create(Supplier::class, [
            'user_id' => $supplierUser->id,
            'store_name' => 'Contract Capture Store',
            'address' => 'Jl. Capture No. 1',
            'detail_location' => 'Jakarta',
            'latitude' => -6.2,
            'longitude' => 106.8,
            'no_telp' => '081100000007',
            'category' => 'general',
            'bio' => 'A fixture supplier.',
            'verification_status' => 'verified',
        ])->id;

        $courierUser = $this->create(User::class, [
            'name' => 'Contract Capture Courier',
            'username' => 'capture_courier',
            'unique_code' => 'CAP010',
            'email' => 'capture_courier@example.test',
            'password' => $password,
            // The logistics role, which is what the delivery endpoints check
            // for. A courier with the `user` role is refused by all of them.
            'role_type' => 'logistics',
        ]);
        $this->ids['courier_user'] = $courierUser->id;
        $this->tokens['courier'] = $courierUser->createToken('contract-capture')->plainTextToken;

        $this->ids['courier'] = $this->create(CourierProfile::class, [
            'user_id' => $courierUser->id,
            'vehicle_type' => 'motorcycle',
            'license_plate' => 'B 1234 CAP',
            'is_active' => true,
            'verification_status' => 'verified',
        ])->id;
    }

    // -----------------------------------------------------------------------
    // The project.
    // -----------------------------------------------------------------------

    private function buildProject(): void
    {
        $this->ids['project'] = $this->create(Project::class, [
            'user_id' => $this->ids['owner'],
            'title' => 'Contract Capture Project',
            'description' => 'A project that exists so the capture has something to record.',
            'budget' => 500_000_000,
            'lokasi' => 'Pondok Indah, Jakarta',
            'jenis_proyek' => 'umum',
            'status' => 'in_progress',
            'target_role' => 'both',
            'pm_id' => $this->ids['pm'],
            'selected_arsitek_id' => $this->ids['arsitek'],
            'selected_kontraktor_id' => $this->ids['kontraktor'],
            'selected_notaris_id' => $this->ids['notaris'],
            'structural_id' => $this->ids['structural'],
            'mep_id' => $this->ids['mep'],
            'wants_project_manager' => true,
            'requires_structural' => true,
            'requires_mep' => true,
            'latitude' => -6.24,
            'longitude' => 106.81,
            'province' => 'DKI Jakarta',
            'city' => 'Jakarta Selatan',
            'kecamatan' => 'Pondok Indah',
            'kelurahan' => 'Pondok Indah',
            // The deadline. `project_timeline_extensions.original_deadline` is
            // NOT NULL, and the extension endpoints copy it — so a project
            // without one answers 500 on the extension request, which is the
            // capture's problem and not the application's.
            'deadline' => now()->addDays(30),
            'published_bidding_roles' => ['project_manager', 'arsitek', 'kontraktor', 'notaris', 'structural', 'mep'],
            // The share token, so the public brief endpoint has something to
            // find. The brief is reachable by anyone holding the token, so
            // it is a fixed string rather than a random one.
            'share_token' => 'capture-share-token',
        ])->id;

        $this->ids['other_project'] = $this->create(Project::class, [
            'user_id' => $this->ids['stranger'],
            'title' => 'Contract Capture Other Project',
            'description' => 'A second project, so the "not yours" paths have somewhere to point.',
            'budget' => 100_000_000,
            'lokasi' => 'Bekasi',
            'jenis_proyek' => 'umum',
            'status' => 'open',
            'target_role' => 'both',
        ])->id;
    }

    private function buildBids(): void
    {
        $this->ids['bid_arsitek'] = $this->create(BidArsitek::class, [
            'project_id' => $this->ids['project'],
            'arsitek_id' => $this->ids['arsitek'],
            'price' => 25_000_000,
            'proposal' => 'A fixture bid.',
            'status' => 'accepted',
            'estimated_duration' => 30,
            'duration_unit' => 'days',
            'payment_status' => 'unpaid',
            'fee_type' => 'fixed',
        ])->id;

        $this->ids['bid_kontraktor'] = $this->create(BidKontraktor::class, [
            'project_id' => $this->ids['project'],
            'kontraktor_id' => $this->ids['kontraktor'],
            'price' => 150_000_000,
            'proposal' => 'A fixture bid.',
            'status' => 'shortlisted',
            'estimated_duration' => 90,
            'duration_unit' => 'days',
            'payment_status' => 'unpaid',
            'fee_type' => 'fixed',
        ])->id;

        $this->ids['bid_notaris'] = $this->create(BidNotaris::class, [
            'project_id' => $this->ids['project'],
            'notaris_id' => $this->ids['notaris'],
            'price' => 5_000_000,
            'proposal' => 'A fixture bid.',
            'status' => 'shortlisted',
            'estimated_duration' => 14,
            'duration_unit' => 'days',
            'payment_status' => 'unpaid',
            'fee_type' => 'fixed',
        ])->id;

        $this->ids['bid_pm'] = $this->create(\App\Models\BidProjectManager::class, [
            'project_id' => $this->ids['project'],
            'pm_id' => $this->ids['pm'],
            'price' => 25_000_000,
            'proposal' => 'A fixture bid.',
            'status' => 'accepted',
            'estimated_duration' => 6,
            'duration_unit' => 'months',
            'payment_status' => 'unpaid',
            'fee_type' => 'fixed',
        ])->id;

        $this->ids['bid_structural'] = $this->create(BidStructural::class, [
            'project_id' => $this->ids['project'],
            'structural_id' => $this->ids['structural'],
            'price' => 20_000_000,
            'proposal' => 'A fixture bid.',
            'status' => 'shortlisted',
            'estimated_duration' => 21,
            'duration_unit' => 'days',
            'payment_status' => 'unpaid',
            'fee_type' => 'fixed',
        ])->id;

        $this->ids['bid_mep'] = $this->create(BidMep::class, [
            'project_id' => $this->ids['project'],
            'mep_id' => $this->ids['mep'],
            'price' => 20_000_000,
            'proposal' => 'A fixture bid.',
            'status' => 'shortlisted',
            'estimated_duration' => 21,
            'duration_unit' => 'days',
            'payment_status' => 'unpaid',
            'fee_type' => 'fixed',
        ])->id;
    }

    // -----------------------------------------------------------------------
    // The project's children.
    // -----------------------------------------------------------------------

    private function buildProjectChildren(): void
    {
        $project = $this->ids['project'];

        $this->ids['milestone'] = $this->create(ProjectMilestone::class, [
            'project_id' => $project,
            'arsitek_id' => $this->ids['arsitek'],
            'title' => 'Design Concept',
            'type' => 'design',
            'content' => 'A fixture milestone.',
            'description' => 'A fixture milestone.',
            'sort_order' => 1,
            'is_completed' => true,
            'approval_status' => 'approved',
            'phase_context' => 'arsitek',
        ])->id;

        $this->ids['termin'] = $this->create(ProjectPaymentTermin::class, [
            'project_id' => $project,
            'role_type' => 'kontraktor',
            'recipient_id' => $this->ids['kontraktor_user'],
            'label' => 'Down Payment',
            'percentage' => 30,
            'amount' => 45_000_000,
            'trigger_description' => 'A fixture termin.',
            'status' => 'pending',
        ])->id;

        $this->ids['addendum'] = $this->create(ProjectAddendum::class, [
            'project_id' => $project,
            'type' => 'scope_change',
            'role_type' => 'kontraktor',
            'user_id' => $this->ids['kontraktor_user'],
            'title' => 'Extra Structural Work',
            'description' => 'A fixture addendum.',
            'amount' => 7_500_000,
            'status' => 'approved_unpaid',
        ])->id;

        $this->ids['requirement'] = $this->create(ProjectRequirement::class, [
            'project_id' => $project,
            'user_id' => $this->ids['owner'],
            'name' => 'Cement',
            'quantity_required' => 100,
            'estimated_unit_cost' => 550_000,
            'quantity_on_site' => 0,
            'quantity_used' => 0,
            'unit' => 'sak',
            'quality_level' => 'standard',
            'purpose' => 'Structure',
            'category' => 'general',
            'bom_type' => 'raw',
        ])->id;

        $this->ids['requirement_history'] = $this->create(ProjectRequirementHistory::class, [
            'project_requirement_id' => $this->ids['requirement'],
            'user_id' => $this->ids['owner'],
            'type' => 'restock',
            'quantity' => 100,
            'notes' => 'A fixture history row.',
        ])->id;

        $this->ids['folder'] = $this->create(ProjectMaterialFolder::class, [
            'project_id' => $project,
            'name' => 'Structural',
            'created_by' => $this->ids['owner'],
            'bom_type' => 'raw',
        ])->id;

        $this->ids['document'] = $this->create(ProjectDocument::class, [
            'project_id' => $project,
            'uploader_id' => $this->ids['owner'],
            'version' => 1,
            'file_name' => 'capture.pdf',
            'description' => 'A fixture document.',
            'file_path' => 'documents/capture.pdf',
            'file_type' => 'application/pdf',
            'category' => 'contract',
            'status' => 'active',
            'target_role' => 'kontraktor',
        ])->id;

        $this->ids['change_order'] = $this->create(ProjectChangeOrder::class, [
            'project_id' => $project,
            'requested_by' => $this->ids['kontraktor_user'],
            'role_type' => 'kontraktor',
            'title' => 'Extra Footing',
            'description' => 'A fixture change order.',
            'cost_impact' => 3_000_000,
            'time_impact_days' => 3,
            'status' => 'proposed',
        ])->id;

        $this->ids['termination'] = $this->create(ProjectTermination::class, [
            'project_id' => $project,
            'initiator_id' => $this->ids['owner'],
            'reason' => 'A fixture termination request.',
            'settlement_terms' => 'A fixture settlement.',
            'status' => 'pending',
        ])->id;

        $this->ids['procurement_request'] = $this->create(ProjectProcurementRequest::class, [
            'project_id' => $project,
            'requirement_id' => $this->ids['requirement'],
            'requested_by' => $this->ids['kontraktor_user'],
            'quantity_needed' => 50,
            'estimated_unit_cost' => 550_000,
            'estimated_cost' => 27_500_000,
            'message' => 'A fixture procurement request.',
            'offer_to_buy' => false,
            'status' => 'pending_pm',
        ])->id;

        $this->ids['sub_professional'] = $this->create(ProjectSubProfessional::class, [
            'project_id' => $project,
            'user_id' => $this->ids['structural_user'],
            'parent_role' => 'kontraktor',
            'sub_role' => 'structural',
            'assigned_by' => $this->ids['kontraktor_user'],
            'status' => 'invited',
            'rate' => 5_000_000,
            'scope_notes' => 'A fixture sub-professional.',
        ])->id;

        $this->ids['sandbox_item'] = $this->create(ProjectBudgetSandbox::class, [
            'project_id' => $project,
            'title' => 'A Sandbox Item',
            'estimated_amount' => 1_000_000,
            'is_active' => true,
        ])->id;

        $this->ids['dispute'] = $this->create(ProjectDispute::class, [
            'project_id' => $project,
            'opened_by' => $this->ids['owner'],
            'category' => 'payment',
            'title' => 'A Fixture Dispute',
            'description' => 'A fixture dispute.',
            'status' => 'open',
            'disputed_amount' => 5_000_000,
            'payment_type' => 'bid_arsitek',
            'payment_id' => $this->ids['bid_arsitek'],
        ])->id;

        $this->ids['dispute_message'] = $this->create(DisputeMessage::class, [
            'dispute_id' => $this->ids['dispute'],
            'user_id' => $this->ids['owner'],
            'body' => 'A fixture dispute message.',
        ])->id;

        $this->ids['comment'] = $this->create(ProjectComment::class, [
            'project_id' => $project,
            'user_id' => $this->ids['owner'],
            'message' => 'A fixture comment.',
        ])->id;

        $this->ids['sticky_note'] = $this->create(StickyNote::class, [
            'project_id' => $project,
            'user_id' => $this->ids['owner'],
            'phase_context' => 'design',
            'title' => 'A Sticky Note',
            'content' => 'A fixture sticky note.',
            'position_index' => 0,
        ])->id;

        $this->ids['report'] = $this->create(ProjectReport::class, [
            'project_id' => $project,
            'phase_slug' => 'design',
            'created_by' => $this->ids['owner'],
            'summary' => 'A fixture report.',
            'progress_percentage' => 40,
            'budget_health' => 'on_track',
            'site_photos' => [],
            'attachments' => [],
        ])->id;

        $this->ids['snag'] = $this->create(ProjectSnagItem::class, [
            'project_id' => $project,
            'title' => 'A Crack',
            'description' => 'A fixture snag.',
            'location' => 'Floor 1',
            'severity' => 'major',
            'photos' => [],
            'status' => 'open',
            'assigned_role' => 'kontraktor',
            'reported_by' => $this->ids['owner'],
        ])->id;

        $this->ids['daily_log'] = $this->create(ProjectDailyLog::class, [
            'project_id' => $project,
            'user_id' => $this->ids['kontraktor_user'],
            'log_date' => now()->subDay()->toDateString(),
            'weather' => 'sunny',
            'worker_count' => 12,
            'activities' => 'A fixture daily log.',
            'issues' => '',
            'photos' => [],
        ])->id;

        $this->ids['schedule'] = $this->create(ProjectSchedule::class, [
            'project_id' => $project,
            'phase_slug' => 'design',
            'target_start_date' => now()->subDays(10)->toDateString(),
            'target_end_date' => now()->addDays(10)->toDateString(),
            'original_target_end_date' => now()->addDays(10)->toDateString(),
            'shifted_days' => 0,
            'progress_percentage' => 50,
            'status' => 'on_track',
        ])->id;

        $this->ids['extension'] = $this->create(ProjectTimelineExtension::class, [
            'project_id' => $project,
            'requester_id' => $this->ids['kontraktor_user'],
            'reason' => 'A fixture extension.',
            'description' => 'A fixture extension.',
            'days_requested' => 5,
            'status' => 'proposed',
            'original_deadline' => now()->addDays(10)->toDateString(),
            'new_deadline_date' => now()->addDays(15)->toDateString(),
        ])->id;

        $this->ids['warranty_claim'] = $this->create(ProjectWarrantyClaim::class, [
            'project_id' => $project,
            'reporter_id' => $this->ids['owner'],
            'title' => 'A Warranty Claim',
            'description' => 'A fixture claim.',
            'images' => [],
            'status' => 'open',
            'cost_impact' => 1_500_000,
        ])->id;

        $this->ids['external_vendor'] = $this->create(ProjectExternalVendor::class, [
            'project_id' => $project,
            'team_member_id' => null,
            'phase_role' => 'arsitek',
            'company_name' => 'CV External',
            'contact_person' => 'A Contact',
            'phone_number' => '081100000008',
            'email' => 'external@example.test',
            'agreed_fee' => 2_500_000,
            'notes' => 'A fixture external vendor.',
        ])->id;

        $this->ids['project_image'] = $this->create(ProjectImage::class, [
            'project_id' => $project,
            'image_path' => 'projects/capture.png',
            'sort_order' => 1,
        ])->id;

        $this->ids['delay'] = $this->create(ProjectDelay::class, [
            'project_id' => $project,
            'phase_slug' => 'design',
            'days' => 2,
            'reason' => 'A fixture delay.',
            'category' => 'weather',
            'logged_at' => now()->subDays(2),
        ])->id;

        $this->create(ProjectActivityLog::class, [
            'project_id' => $project,
            'user_id' => $this->ids['owner'],
            'action' => 'project_created',
            'details' => 'A fixture activity log.',
        ]);

        $this->ids['notification'] = $this->create(Notification::class, [
            'user_id' => $this->ids['owner'],
            'type' => 'project_update',
            'title' => 'A Fixture Notification',
            'body' => 'A fixture notification.',
            'data' => ['project_id' => $project],
        ])->id;
    }

    // -----------------------------------------------------------------------
    // The marketplace.
    // -----------------------------------------------------------------------

    private function buildMarketplace(): void
    {
        $this->ids['material'] = $this->create(Material::class, [
            'supplier_id' => $this->ids['supplier'],
            'name' => 'Cement',
            'description' => 'A fixture material.',
            'price' => 550_000,
            'unit' => 'sak',
            'category' => 'cement',
            'stock' => 500,
            'is_available' => true,
        ])->id;

        $this->ids['quote'] = $this->create(MaterialQuote::class, [
            'user_id' => $this->ids['owner'],
            'supplier_id' => $this->ids['supplier'],
            'project_id' => $this->ids['project'],
            'items' => [['material_id' => $this->ids['material'], 'name' => 'Cement', 'qty' => 10, 'price' => 550_000]],
            'delivery_address' => 'Jl. Capture No. 1',
            'total_amount' => 5_500_000,
            'shipping_cost' => 100_000,
            'delivery_method' => 'Supplier Delivery',
            'status' => 'approved',
            'latitude' => -6.2,
            'longitude' => 106.8,
        ])->id;

        $this->ids['material_order'] = $this->create(MaterialOrder::class, [
            'user_id' => $this->ids['owner'],
            'supplier_id' => $this->ids['supplier'],
            'project_id' => $this->ids['project'],
            'status' => 'awaiting_payment',
            'total_price' => 5_500_000,
            'shipping_cost' => 100_000,
            'whatsapp_order_id' => 'CAPTURE-ORDER-1',
            'delivery_method' => 'Supplier Delivery',
            'delivery_address' => 'Jl. Capture No. 1',
            'is_stock_decremented' => false,
        ])->id;

        $this->ids['material_order_item'] = $this->create(MaterialOrderItem::class, [
            'order_id' => $this->ids['material_order'],
            'material_id' => $this->ids['material'],
            'requirement_id' => $this->ids['requirement'],
            'quantity' => 10,
            'price_at_order' => 550_000,
        ])->id;

        $this->ids['material_order_review'] = $this->create(MaterialOrderReview::class, [
            'user_id' => $this->ids['owner'],
            'supplier_id' => $this->ids['supplier'],
            'order_id' => $this->ids['material_order'],
            'rating' => 5,
            'comment' => 'A fixture review.',
            'delivery_rating' => 5,
            'delivery_comment' => 'A fixture delivery review.',
            'delivery_user_id' => $this->ids['courier_user'],
            'image_paths' => [],
            'delivery_image_paths' => [],
        ])->id;

        $this->ids['delivery_job'] = $this->create(DeliveryJob::class, [
            'quote_id' => $this->ids['quote'],
            'order_id' => $this->ids['material_order'],
            'logistics_id' => $this->ids['courier_user'],
            'pickup_address' => 'Jl. Capture No. 1',
            'dropoff_address' => 'Jl. Capture No. 2',
            'status' => 'available',
            'agreed_fee' => 75_000,
            'estimated_weight' => 500,
            'pickup_photos' => [],
            'delivery_photos' => [],
        ])->id;
    }

    // -----------------------------------------------------------------------
    // The houses.
    // -----------------------------------------------------------------------

    private function buildHouses(): void
    {
        $this->ids['house'] = $this->create(House::class, [
            'name' => 'A Fixture House',
            'price' => 1_200_000_000,
            'house_desc' => 'A fixture house.',
            'width' => '10',
            'length' => '20',
            'br' => 3,
            'ba' => 2,
            'floors' => 2,
            'coordinate' => '-6.2,106.8',
            'street_name' => 'Jl. Capture',
            'kelurahan' => 'Pondok Indah',
            'kecamatan' => 'Pondok Indah',
            'kab_kota' => 'Jakarta Selatan',
            'province' => 'DKI Jakarta',
            'postal_code' => '12345',
            'views' => 0,
            'id_user' => $this->ids['owner'],
        ])->id;

        $this->ids['room'] = $this->create(Room::class, [
            'name' => 'Living Room',
            'type' => 'living',
            'width' => '5',
            'length' => '6',
            'desc' => 'A fixture room.',
            'id_house' => $this->ids['house'],
        ])->id;

        $this->ids['house_question'] = $this->create(HouseQuestion::class, [
            'house_id' => $this->ids['house'],
            'user_id' => $this->ids['stranger'],
            'question' => 'Is the price negotiable?',
        ])->id;

        $this->ids['house_answer'] = $this->create(HouseAnswer::class, [
            'question_id' => $this->ids['house_question'],
            'user_id' => $this->ids['owner'],
            'answer' => 'A fixture answer.',
        ])->id;
    }

    // -----------------------------------------------------------------------
    // The firm.
    // -----------------------------------------------------------------------

    private function buildFirm(): void
    {
        $this->ids['firm_member'] = $this->create(FirmMember::class, [
            'firm_owner_id' => $this->ids['arsitek_user'],
            'member_user_id' => $this->ids['kontraktor_user'],
            'role_in_firm' => 'arsitek',
            'status' => 'active',
            'invited_at' => now()->subDays(10),
            'accepted_at' => now()->subDays(9),
            'requested_at' => now()->subDays(11),
        ])->id;

        $this->ids['team_member'] = $this->create(TeamMember::class, [
            'owner_user_id' => $this->ids['owner'],
            'owner_role' => 'arsitek',
            'name' => 'A Fixture Team Member',
            'photo_path' => 'team/capture.png',
            'role_title' => 'Site Manager',
            'bio' => 'A fixture team member.',
            'skills' => ['management'],
            'phone' => '081100000009',
            'email' => 'team@example.test',
            'status' => 'active',
        ])->id;

        $this->ids['portfolio'] = $this->create(\App\Models\ProfessionalPortfolio::class, [
            'user_id' => $this->ids['arsitek_user'],
            'role_type' => 'arsitek',
            'title' => 'A Fixture Portfolio',
            'description' => 'A fixture portfolio entry.',
            'image_path' => 'portfolio/capture.png',
            'duration' => '6 months',
            'client_review' => 'A fixture client review.',
        ])->id;

        $this->ids['consultation'] = $this->create(NotarisConsultation::class, [
            'notaris_id' => $this->ids['notaris'],
            'user_id' => $this->ids['owner'],
            'schedule_date' => now()->addDays(3)->toDateTimeString(),
            'status' => 'pending',
            'notes' => 'A fixture consultation.',
        ])->id;

        $this->ids['favorite'] = $this->create(Favorite::class, [
            'user_id' => $this->ids['owner'],
            'favoritable_type' => \App\Models\Arsitek::class,
            'favoritable_id' => $this->ids['arsitek'],
        ])->id;
    }

    // -----------------------------------------------------------------------
    // The conversations.
    // -----------------------------------------------------------------------

    private function buildConversations(): void
    {
        $this->ids['conversation'] = $this->create(Conversation::class, [
            'user_one_id' => $this->ids['owner'],
            'user_two_id' => $this->ids['arsitek_user'],
            'last_message_at' => now()->subMinutes(5),
        ])->id;

        $this->ids['message'] = $this->create(ChatMessage::class, [
            'conversation_id' => $this->ids['conversation'],
            'sender_id' => $this->ids['owner'],
            'content' => 'A fixture chat message.',
            'is_read' => false,
        ])->id;
    }

    // -----------------------------------------------------------------------
    // The mechanics.
    // -----------------------------------------------------------------------

    /**
     * Create a row with a PINNED id.
     *
     * The id is set explicitly so the recorded bodies carry the same ids on
     * every machine. `forceFill` is used because `id` is never fillable —
     * and it is not fillable for a good reason: an id that a request body
     * could set is an id that a request body could set to someone else's.
     *
     * @param  class-string<Model>  $model
     * @param  array<string, mixed>  $attributes
     */
    private function create(string $model, array $attributes): Model
    {
        $instance = new $model();

        $instance->forceFill($attributes);
        $instance->id = $this->nextId($instance);
        $instance->save();

        return $instance;
    }

    /**
     * The next id in the reserved range.
     *
     * Each table's ids come from its own band, so a row the endpoint
     * CREATES — which takes the next id from that table's auto-increment
     * counter — lands in the same band and can never collide with another
     * table's fixture id.
     */
    private function nextId(Model $instance): int
    {
        $table = $instance->getTable();

        if (! isset($this->bands[$table])) {
            $this->bands[$table] = self::ID_BASE + (count($this->bands) * self::BAND_SIZE);
            $this->bandCounters[$table] = 0;
        }

        $this->bandCounters[$table]++;

        return $this->bands[$table] + $this->bandCounters[$table];
    }

    /**
     * Refuse to build on a database where the reserved range is occupied.
     *
     * A collision would make the fixture's ids point at real rows, and the
     * recorded bodies would then depend on the state of the database the
     * capture ran against — which is exactly what the fixture exists to
     * prevent.
     */
    private function assertTheRangeIsFree(): void
    {
        $occupied = \Illuminate\Support\Facades\DB::table('users')
            ->whereBetween('id', [self::ID_BASE, self::ID_BASE + 10_000])
            ->count();

        if ($occupied > 0) {
            throw new \RuntimeException(
                'The contract-capture id range ('.self::ID_BASE.' to '.(self::ID_BASE + 10_000).') is occupied by '
                .$occupied.' user row(s). The capture fixture pins its ids so the recorded bodies are the same '
                .'on every machine, and it cannot do that on a database where the range is in use.'
            );
        }
    }
}
