<?php

use App\Support\ContractCapture\Capture;
use App\Support\ContractCapture\Fixture;
use App\Support\ContractCapture\Normaliser;

/*
|--------------------------------------------------------------------------
| The contract capture
|--------------------------------------------------------------------------
|
| The golden files are the ORACLE for the Go rewrite: 296 recordings of what
| the legacy application answers, byte for byte, so the Go port can be
| compared against them.
|
| This suite pins the properties the recordings have to have:
|
|   - there is a recording for EVERY endpoint, and only for endpoints that
|     exist;
|   - no endpoint answers a 500. A recording of a 500 is a recording of a
|     crash, and a crash is a defect — five of them were found this way
|     (B23, B24, B25, B26, B27) and each is now a regression test;
|   - the recording is DETERMINISTIC. A recording that changes on every run
|     is not a recording, and a golden file that changes on every run makes
|     the CI gate meaningless.
|
*/

uses(Tests\TestCase::class);

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * The committed golden files.
 *
 * @return array<string, array<string, mixed>>
 */
function contractCaptureFiles(): array
{
    $directory = base_path('spec/contracts/laravel');

    $files = [];

    foreach (glob($directory.'/*.json') ?: [] as $path) {
        $files[basename($path, '.json')] = json_decode((string) file_get_contents($path), true);
    }

    return $files;
}

it('records a golden file for every endpoint, and only for endpoints that exist', function () {
    $files = contractCaptureFiles();

    // The manifest is GENERATED, with a stable format, so the route ids are
    // read out of it directly. (The PHP YAML extension is not installed,
    // and the manifest is a machine-written file with one shape.)
    $manifest = (string) file_get_contents(base_path('routing/routes.yaml'));

    preg_match_all("/^  - 'id': '(.+)'$/m", $manifest, $matches);

    $expected = $matches[1];
    sort($expected);

    $recorded = array_keys($files);
    sort($recorded);

    expect($recorded)->toBe($expected);
});

it('records no endpoint answering a server error', function () {
    $files = contractCaptureFiles();

    // The two geocode endpoints PROXY an external service —
    // `nominatim.openstreetmap.org` — and answer 500 when it cannot be
    // reached. That is the application behaving correctly on a machine
    // without the internet, and the recording says so.
    $external = ['get.api.geocode.reverse', 'get.api.geocode.search'];

    $crashes = [];

    foreach ($files as $id => $file) {
        $status = (int) $file['response']['status'];

        if (in_array($id, $external, true)) {
            continue;
        }

        if ($status >= 500 && $status !== 501) {
            $crashes[] = $id.' answered '.$status.': '.substr((string) $file['response']['body_raw'], 0, 160);
        }
    }

    expect($crashes)->toBe([]);
});

it('records the same bytes twice', function () {
    // ONE endpoint, recorded twice in the same process.
    //
    // The capture's determinism rests on: the clock frozen, the fixture's
    // ids pinned, the Host pinned, the cache flushed, and each endpoint
    // recorded against a pristine world.
    $route = 'get.api.projects';

    $first = runCapture($route);
    $second = runCapture($route);

    expect($first)->toBe($second);
});

it('binds the path parameters to the fixture rows', function () {
    $fixture = new Fixture();
    $fixture->build();

    $capture = new Capture($fixture);

    // The parameters are ids, and they are the FIXTURE's ids.
    $resolved = $capture->resolve('api/projects/{project}/payment-termins/{termin}');

    expect($resolved)->toBe([
        'project' => (string) $fixture->id('project'),
        'termin' => (string) $fixture->id('termin'),
    ]);
});

it('rejects the id range it needs when it is occupied', function () {
    // The fixture pins its ids so the recordings are the same on every
    // machine, and it cannot do that on a database where the range is in
    // use — the recordings would then depend on the state of the database
    // the capture ran against.
    \Illuminate\Support\Facades\DB::table('users')->insert([
        'id' => Fixture::ID_BASE + 5,
        'name' => 'An Occupant',
        'username' => 'occupant',
        'email' => 'occupant@example.test',
        'password' => 'x',
        'role_type' => 'user',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    expect(fn () => (new Fixture())->build())
        ->toThrow(RuntimeException::class, 'id range');
});

it('normalises the timestamps and nothing else', function () {
    $body = '{"created_at":"2026-01-01T00:00:00.000000Z","amount":"500000000.00","ratio":0.5,"url":"http:\/\/x.test\/a"}';

    $normalised = Normaliser::body($body);

    // The timestamp is replaced...
    expect($normalised)->toContain('"created_at":"'.Normaliser::TIMESTAMP.'"');

    // ...and nothing else is. The number formatting, the escaping and the
    // key order are the contract, and a normaliser that touched them would
    // be hiding the differences it exists to find.
    expect($normalised)->toContain('"amount":"500000000.00"')
        ->and($normalised)->toContain('"ratio":0.5')
        ->and($normalised)->toContain('"url":"http:\/\/x.test\/a"');
});

/**
 * Run the capture for one endpoint and return the file it wrote.
 *
 * @return array<string, mixed>
 */
function runCapture(string $route): array
{
    $path = storage_path('framework/testing/contract-capture-'.getmypid());

    \Illuminate\Support\Facades\File::ensureDirectoryExists($path);

    $exit = \Illuminate\Support\Facades\Artisan::call('contract:capture', [
        '--route' => $route,
        '--path' => $path,
    ]);

    expect($exit)->toBe(0);

    $file = $path.'/'.$route.'.json';

    expect(is_file($file))->toBeTrue();

    return json_decode((string) file_get_contents($file), true);
}
