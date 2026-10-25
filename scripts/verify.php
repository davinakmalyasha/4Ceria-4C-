<?php

/**
 * verify.php — the local verification gate.
 *
 * WHY THIS IS A PHP SCRIPT AND NOT THE POWERSHELL ONE
 * ---------------------------------------------------
 * `composer verify` ran `"@php scripts/verify.ps1"`. Composer handed a
 * PowerShell file to PHP. PHP found no `<?php` tag in it, echoed the whole
 * file as text and exited 0. The gate was a NO-OP THAT PRINTED A SCRIPT
 * INSTEAD OF RUNNING IT — and it exits green, so it looks like it passed.
 *
 * It was also Windows-only, so it could not be the thing CI runs even in
 * principle. This script is the single, cross-platform implementation, and
 * `composer verify` now points at it.
 *
 * WHAT IT RUNS
 * ------------
 * The same list CI runs, in the same order, stopping at the first failure.
 * See AGENTS.md ("Full verification gate") for the contract.
 *
 * USAGE
 *   composer verify
 *   composer verify --skip-frontend     # only the PHP half
 *   composer verify --scratch-db=4ceria_scratch
 *   composer verify --php=/path/to/php  # use a specific interpreter
 */

declare(strict_types=1);

$root = dirname(__DIR__);

$options = [
    'skip-frontend' => false,
    'scratch-db' => '4ceria_scratch',
    'php' => PHP_BINARY,
];

foreach (array_slice($argv, 1) as $argument) {
    if ($argument === '--skip-frontend') {
        $options['skip-frontend'] = true;
    } elseif (str_starts_with($argument, '--scratch-db=')) {
        $options['scratch-db'] = substr($argument, strlen('--scratch-db='));
    } elseif (str_starts_with($argument, '--php=')) {
        $options['php'] = substr($argument, strlen('--php='));
    } elseif ($argument === '--help' || $argument === '-h') {
        fwrite(STDOUT, "Usage: composer verify [--skip-frontend] [--scratch-db=NAME] [--php=PATH]\n");
        exit(0);
    } else {
        fwrite(STDERR, "::error::unknown option: {$argument}\n");
        exit(2);
    }
}

$php = $options['php'];

/**
 * Run a command, stream its output, and report whether it succeeded.
 *
 * @param  list<string>|string  $command  An array is used verbatim on POSIX.
 *                        On Windows an array is joined into a command line,
 *                        because `proc_open`'s array form cannot start a
 *                        `.cmd` shim at all.
 * @param  array<string, string>  $env
 * @param  bool  $buffer  When true the output is held back and only shown if
 *                        the step FAILS. Used for the migration steps, whose
 *                        per-migration chatter is 200 lines of noise that says
 *                        nothing when the step worked.
 * @param  int  $timeoutSeconds  0 means "no timeout". A step that exceeds it
 *                        is killed and reported as timed out.
 */
function step(
    string $name,
    array|string $command,
    array $env = [],
    ?string $cwd = null,
    bool $tolerateFailure = false,
    bool $buffer = false,
    int $timeoutSeconds = 0
): bool {
    global $root;

    fwrite(STDOUT, "\n==> {$name}\n");
    fwrite(STDOUT, '    $ '.(is_array($command) ? implode(' ', $command) : $command)."\n");

    $environment = getenv();
    $environment = is_array($environment) ? $environment : [];
    $environment = array_merge($environment, $env);
    // Keep the toolchain's own PATH entries.
    $environment['PATH'] = getenv('PATH') ?: ($environment['PATH'] ?? '');
    $environment['COMPOSER_ALLOW_SUPERUSER'] = '1';

    // The null device is spelled differently on Windows.
    $nullDevice = DIRECTORY_SEPARATOR === '\\' ? 'NUL' : '/dev/null';

    $descriptors = [
        0 => ['file', $nullDevice, 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $process = proc_open($command, $descriptors, $pipes, $cwd ?? $root, $environment);

    if (! is_resource($process)) {
        fwrite(STDERR, "    ::error::could not start: ".implode(' ', $command)."\n");

        return false;
    }

    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);

    $open = [1 => $pipes[1], 2 => $pipes[2]];
    $buffers = [1 => '', 2 => ''];
    $collected = '';
    $deadline = $timeoutSeconds > 0 ? microtime(true) + $timeoutSeconds : null;
    $timedOut = false;

    while ($open !== []) {
        $read = array_values($open);
        $write = null;
        $except = null;

        if (@stream_select($read, $write, $except, 1) === false) {
            break;
        }

        if ($deadline !== null && microtime(true) > $deadline) {
            $timedOut = true;
            break;
        }

        foreach ($read as $stream) {
            $key = array_search($stream, $open, true);
            $chunk = fread($stream, 8192);

            if ($chunk === false || $chunk === '') {
                if (feof($stream)) {
                    if (! $buffer) {
                        fwrite(STDOUT, $buffers[$key]);
                    }
                    $collected .= $buffers[$key];
                    fclose($stream);
                    unset($open[$key]);
                }

                continue;
            }

            $buffers[$key] .= $chunk;

            if ($buffer) {
                continue;
            }

            // Echo complete lines as they arrive.
            while (($newline = strpos($buffers[$key], "\n")) !== false) {
                $line = substr($buffers[$key], 0, $newline);
                $buffers[$key] = substr($buffers[$key], $newline + 1);
                fwrite(STDOUT, '    '.rtrim($line)."\n");
            }
        }
    }

    foreach ($open as $key => $stream) {
        if (! $buffer) {
            fwrite(STDOUT, $buffers[$key]);
        }
        $collected .= $buffers[$key];
        fclose($stream);
    }

    if ($timedOut) {
        // The process is stuck. Kill it rather than leaving a runaway behind.
        proc_terminate($process, 9);
        proc_close($process);

        fwrite(STDOUT, "    WARNING: timed out after {$timeoutSeconds}s and was killed\n");

        return false;
    }

    $status = proc_close($process);
    $succeeded = $status === 0;

    if ($succeeded) {
        if ($buffer && trim($collected) !== '') {
            $lines = array_values(array_filter(explode("\n", $collected), static fn ($l) => trim($l) !== ''));
            $tail = array_slice($lines, -4);
            foreach ($tail as $line) {
                fwrite(STDOUT, '    '.rtrim($line)."\n");
            }
        }
        fwrite(STDOUT, "    ok\n");
    } elseif ($tolerateFailure) {
        fwrite(STDOUT, "    WARNING: exited {$status} (non-fatal)\n");
    } else {
        if ($buffer && trim($collected) !== '') {
            fwrite(STDERR, $collected);
        }
        fwrite(STDERR, "    ::error::exited {$status}\n");
    }

    return $succeeded;
}

/**
 * The composer binary, invoked through the CURRENT interpreter.
 *
 * The bare `composer` on PATH may run a PHP older than the `php: ^8.4`
 * floor in composer.json, and on Windows it is a `.bat` that `proc_open`
 * cannot start directly. Using the interpreter that is running this script
 * removes both traps.
 *
 * @return list<string>
 */
function composerCommand(string $php): array
{
    $candidates = [];

    $fromEnvironment = getenv('COMPOSER_PHAR');

    if (is_string($fromEnvironment) && $fromEnvironment !== '') {
        $candidates[] = $fromEnvironment;
    }

    // Laragon's layout: bin/php/php-8.5.x/php.exe, and bin/composer/ is two
    // levels above that.
    $candidates[] = dirname($php).DIRECTORY_SEPARATOR.'composer.phar';
    $candidates[] = dirname($php, 2).DIRECTORY_SEPARATOR.'composer'.DIRECTORY_SEPARATOR.'composer.phar';
    $candidates[] = dirname($php, 3).DIRECTORY_SEPARATOR.'composer'.DIRECTORY_SEPARATOR.'composer.phar';

    foreach ($candidates as $candidate) {
        if (is_file($candidate)) {
            return [$php, $candidate];
        }
    }

    // No PHAR: fall back to the launcher. On Windows that is a `.bat`, which
    // `proc_open` cannot start directly, and which resolves the interpreter
    // from its own shebang — so it is invoked through an UNQUOTED `cmd /c`.
    if (DIRECTORY_SEPARATOR === '\\') {
        foreach (['composer.bat', 'composer'] as $launcher) {
            exec('where '.escapeshellarg($launcher).' 2>nul', $found, $status);

            if ($status === 0 && $found !== []) {
                return 'cmd /c '.$launcher;
            }

            $found = [];
        }
    }

    return ['composer'];
}

/**
 * The npm launcher.
 *
 * On Windows `npm` is `npm.cmd`, which `proc_open` cannot start directly, and
 * `proc_open`'s ARRAY form cannot start it at all — `CreateProcess` reports
 * "The system cannot find the file specified". The array form also has to be
 * avoided for `cmd /c` itself: a quoted `/c` makes cmd.exe strip the outer
 * quotes of the whole command line, after which it resolves `npm` relative to
 * the CURRENT DIRECTORY instead of PATH, and npm then looks for its own
 * `npm-prefix.js` one directory too high.
 *
 * So on Windows the command is a plain string with an UNQUOTED `/c`; on
 * everything else it stays an array, where quoting is the shell's problem.
 *
 * @param  list<string>  $arguments
 * @return list<string>|string
 */
function npmCommand(array $arguments): array|string
{
    if (DIRECTORY_SEPARATOR !== '\\') {
        return array_merge(['npm'], $arguments);
    }

    return 'cmd /c npm '.implode(' ', $arguments);
}

/**
 * Read the DB credentials out of `.env` without booting Laravel.
 *
 * @return array{host: string, port: string, database: string, username: string, password: string}
 */
function databaseCredentials(string $root): array
{
    $credentials = [
        'host' => '127.0.0.1',
        'port' => '3306',
        'database' => '4ceria',
        'username' => 'root',
        'password' => '',
    ];

    $envPath = $root.'/.env';

    if (! is_file($envPath)) {
        return $credentials;
    }

    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);

        if ($line === '' || str_starts_with($line, '#') || ! str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value, " \t\n\r\0\x0B\"'");

        $map = [
            'DB_HOST' => 'host',
            'DB_PORT' => 'port',
            'DB_DATABASE' => 'database',
            'DB_USERNAME' => 'username',
            'DB_PASSWORD' => 'password',
        ];

        if (isset($map[$key]) && $value !== '') {
            $credentials[$map[$key]] = $value;
        }
    }

    return $credentials;
}

fwrite(STDOUT, "4Ceria verification gate\n");
fwrite(STDOUT, '  php    : '.$php."\n");
fwrite(STDOUT, '  root   : '.$root."\n");
fwrite(STDOUT, '  scratch: '.$options['scratch-db']."\n");

$composerBase = composerCommand($php);
$failed = [];

// ---------------------------------------------------------------------------
// 1. PHP syntax sweep — the same four trees CI lints.
// ---------------------------------------------------------------------------
$lint = [];
$lintTrees = ['app', 'database', 'routes', 'tests'];

foreach ($lintTrees as $tree) {
    $path = $root.'/'.$tree;

    if (! is_dir($path)) {
        continue;
    }

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS)
    );

    foreach ($iterator as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'php') {
            continue;
        }

        exec(escapeshellarg($php).' -l '.escapeshellarg($file->getPathname()).' 2>&1', $output, $status);

        if ($status !== 0) {
            $lint[] = implode("\n", $output);
        }

        $output = [];
    }
}

fwrite(STDOUT, "\n==> php -l (app database routes tests)\n");

if ($lint !== []) {
    foreach ($lint as $error) {
        fwrite(STDERR, '    '.$error."\n");
    }
    fwrite(STDERR, "    ::error::PHP syntax errors found\n");
    $failed[] = 'php -l';
} else {
    fwrite(STDOUT, "    ok\n");
}

// ---------------------------------------------------------------------------
// 2. Autoloader.
//
// `post-autoload-dump` runs scripts/apply-octane-patches.php, which MUTATES
// vendor/. That must not happen as part of a verification pass, hence
// --no-scripts.
//
// BOUNDED, and non-fatal by design.
//
// `composer dump-autoload` HANGS in this environment: it reaches "Generating
// optimized autoload files" and never exits (observed at 3, 5, 20 and 40
// minutes, with and without --no-scripts, with COMPOSER_DISABLE_NETWORK=1,
// and with --no-plugins). A gate that hangs forever is worse than no gate, so
// this step runs the process with a hard timeout and WARNS rather than
// blocking. It is a classmap refresh, not a correctness check — the classes
// it maps are the ones PHP already found.
//
// Two other traps here, both of which produce a confusing failure:
//   - bare `composer` on PATH runs PHP 8.3, which is BELOW the `php: ^8.4`
//     floor in composer.json. The interpreter is passed explicitly.
//   - composer.json wires `post-autoload-dump` to
//     scripts/apply-octane-patches.php, which MUTATES vendor/. That must not
//     run as part of a verification pass, hence --no-scripts.
// ---------------------------------------------------------------------------
$composerBase = composerCommand($php);
$composerArgs = ['dump-autoload', '--no-interaction', '--no-scripts', '--no-plugins'];
$composerCommandLine = is_array($composerBase)
    ? array_merge($composerBase, $composerArgs)
    : $composerBase.' '.implode(' ', $composerArgs);

$dumpAutoload = step(
    'composer dump-autoload (bounded, non-fatal)',
    $composerCommandLine,
    [],
    null,
    true,
    false,
    60
);

if (! $dumpAutoload) {
    fwrite(STDOUT, "    It hangs in this environment. Non-fatal, but the committed\n");
    fwrite(STDOUT, "    classmap may be stale for classes added since the last run.\n");
}

// ---------------------------------------------------------------------------
// 3. The supply-chain policy. A rule that is only written down is not a rule.
// ---------------------------------------------------------------------------
$actionPolicy = null;
$bash = null;

// `command -v` is a bash builtin, so it is useless from PHP on Windows.
// `bash --version` is portable and answers the only question that matters:
// is there a bash that can run the policy script?
//
// Git Bash is preferred over the WSL launcher (`C:\Windows\System32\bash.exe`),
// which is on the PATH on most Windows machines and cannot read a Windows
// path — it would report a syntax error on the script and exit non-zero for a
// reason that has nothing to do with the policy.
$bashCandidates = DIRECTORY_SEPARATOR === '\\'
    ? [
        'C:\Program Files\Git\bin\bash.exe',
        'C:\Program Files\Git\usr\bin\bash.exe',
        'D:\laragon\bin\git\bin\bash.exe',
        'bash',
    ]
    : ['bash', '/bin/bash', '/usr/bin/bash'];

foreach ($bashCandidates as $candidate) {
    exec(escapeshellarg($candidate).' --version 2>nul', $found, $status);

    if ($status !== 0 || $found === []) {
        $found = [];
        continue;
    }

    // WSL's bash announces itself; it cannot read the repository path.
    if (str_contains(strtolower(implode(' ', $found)), 'microsoft') || str_contains(strtolower(implode(' ', $found)), 'wsl')) {
        $found = [];
        continue;
    }

    $bash = $candidate;
    break;
}

if ($bash !== null) {
    // Git Bash wants forward slashes; WSL would want a /mnt/... path.
    $policyScript = str_replace('\\', '/', $root.'/scripts/ci/action-policy.sh');
    $actionPolicy = step('action policy', [$bash, $policyScript]);

    if (! $actionPolicy) {
        $failed[] = 'action-policy';
    }
} else {
    fwrite(STDOUT, "\n==> action policy\n    skipped: no usable bash on PATH\n");
}

// ---------------------------------------------------------------------------
// 4-9. The frontend half.
// ---------------------------------------------------------------------------
if (! $options['skip-frontend']) {
    // The typecheck is a RATCHET, not a gate: `npm run typecheck:check` fails
    // if the error count RISES above the recorded baseline. It is allowed to
    // fall.
    $frontendSteps = [
        'typecheck (ratchet, must not rise)' => npmCommand(['run', 'typecheck:check']),
        'TypeScript 7 and 6 must agree' => npmCommand(['run', 'typecheck:parity']),
        'SPA unit tests (vitest)' => npmCommand(['run', 'test']),
        'eslint (errors must be zero)' => npmCommand(['run', 'lint']),
        'npm run build (public/build)' => npmCommand(['run', 'build']),
    ];

    foreach ($frontendSteps as $name => $command) {
        if (! step($name, $command)) {
            $failed[] = $name;
        }
    }

    // BOTH builds are required. Production ships `dist/` (VITE_STANDALONE),
    // local dev serves public/build — so a green `npm run build` alone does
    // not prove the artifact that actually deploys is buildable.
    if (step('VITE_STANDALONE build (dist/)', npmCommand(['run', 'build']), ['VITE_STANDALONE' => 'true', 'VITE_API_URL' => 'https://api.example.test'])) {
        // A green build is not a correct build. The standalone artifact is
        // what Vercel serves, and it shipped without Tailwind for months
        // while every build was green.
        if (! step('assert both build modes ship their stylesheet', ['node', $root.'/scripts/ci/assert-build-assets.mjs'])) {
            $failed[] = 'build-assets';
        }

        // THE VISUAL GATE.
        //
        // The computed style of every class the stylesheet defines, captured in
        // a real browser, diffed against the committed Tailwind v3 baseline.
        // A build that succeeds is not a build that renders the same.
        //
        // It needs a browser, so it is SKIPPED (loudly) when Playwright has
        // not been installed — the gate must not be a no-op that looks like a
        // pass, and it must not block a developer who has not run
        // `npx playwright install chromium`.
        $playwright = glob($root.'/node_modules/playwright/package.json');

        if ($playwright === []) {
            fwrite(STDOUT, "    skipped: playwright is not installed (npx playwright install chromium)
");
        } else {
            $css = glob($root.'/public/build/assets/app-*.css');

            if ($css === []) {
                fwrite(STDERR, "    ::error::no built stylesheet to compare
");
                $failed[] = 'visual comparison';
            } elseif (! step('the rendering must match the committed baseline', ['node', $root.'/scripts/visual/compare-builds.mjs', '--css='.$css[0]])) {
                $failed[] = 'visual comparison';
            }
        }
    } else {
        $failed[] = 'standalone build';
    }
} else {
    fwrite(STDOUT, "\n==> frontend\n    skipped (--skip-frontend)\n");
}

// ---------------------------------------------------------------------------
// 10. The schema round-trip, on a THROWAWAY database.
//
// `migrate:fresh` drops every table. Running it against the developer's
// working database destroys local data — that mistake was made once during
// this work; this script exists so it cannot be made again by hand.
// ---------------------------------------------------------------------------
$credentials = databaseCredentials($root);
$scratch = $options['scratch-db'];

fwrite(STDOUT, "\n==> schema round-trip on {$scratch}\n");

$pdo = null;

try {
    $dsn = sprintf('mysql:host=%s;port=%s;charset=utf8mb4', $credentials['host'], $credentials['port']);
    $pdo = new PDO($dsn, $credentials['username'], $credentials['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    // Recreate from scratch so a previous aborted run cannot leave residue.
    $pdo->exec("DROP DATABASE IF EXISTS `{$scratch}`");
    $pdo->exec("CREATE DATABASE `{$scratch}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    fwrite(STDOUT, "    created `{$scratch}`\n");
} catch (Throwable $e) {
    fwrite(STDERR, '    ::error::could not create the scratch database: '.$e->getMessage()."\n");
    $failed[] = 'schema round-trip';
    $pdo = null;
}

if ($pdo !== null) {
    $scratchEnv = [
        'DB_DATABASE' => $scratch,
        'CACHE_STORE' => 'array',
        'SESSION_DRIVER' => 'array',
        'QUEUE_CONNECTION' => 'sync',
    ];

    $roundTrip = step('migrate (from scratch)', array_merge([$php, 'artisan'], ['migrate', '--force', '--no-interaction']), $scratchEnv, buffer: true);

    if ($roundTrip) {
        $roundTrip = step('schema:verify (from scratch)', array_merge([$php, 'artisan'], ['schema:verify', '--relations']), $scratchEnv, buffer: true);
    }

    if ($roundTrip) {
        $roundTrip = step('migrate:reset (every down() must work)', array_merge([$php, 'artisan'], ['migrate:reset', '--force', '--no-interaction']), $scratchEnv, buffer: true);
    }

    if ($roundTrip) {
        $roundTrip = step('migrate (re-apply)', array_merge([$php, 'artisan'], ['migrate', '--force', '--no-interaction']), $scratchEnv, buffer: true);
    }

    if ($roundTrip) {
        $roundTrip = step('schema:verify (round-tripped)', array_merge([$php, 'artisan'], ['schema:verify', '--relations']), $scratchEnv, buffer: true);
    }

    if (! $roundTrip) {
        $failed[] = 'schema round-trip';
    }

    try {
        $pdo->exec("DROP DATABASE IF EXISTS `{$scratch}`");
        fwrite(STDOUT, "    dropped `{$scratch}`\n");
    } catch (Throwable $e) {
        fwrite(STDOUT, "    WARNING: could not drop `{$scratch}`: ".$e->getMessage()."\n");
    }
}

// ---------------------------------------------------------------------------
// 11. The full Pest suite, against the developer's own database.
//
// The suites are transactional: each test runs inside a transaction that is
// rolled back, so fixtures vanish and no data is persisted.
// ---------------------------------------------------------------------------
if (! step('pest (full suite)', [$php, 'vendor/bin/pest', '--colors=never', '--log-junit', 'junit.xml'])) {
    $failed[] = 'pest';
}

// The oracle must not shrink. A deleted test narrows the definition of
// "identical" for the Go port, and a green run says nothing about how much it
// checked.
if (! step('assert the suite did not shrink', [$php, $root.'/scripts/ci/assert-suite-floor.php', $root.'/junit.xml'])) {
    $failed[] = 'suite floor';
}

// ---------------------------------------------------------------------------
// 12. The route-set parity gate, and the money differential.
//
// BOTH are the rewrite's two load-bearing instruments, and BOTH are cheap:
// the route gate reads the route table, and the money differential runs two
// implementations over a fixed corpus.
// ---------------------------------------------------------------------------
if (! step('the route manifest is up to date', [$php, 'artisan', 'routes:export', '--check'])) {
    $failed[] = 'route manifest';
}

if (! step('the route tables agree', ['node', $root.'/tools/parity/routes.mjs'])) {
    $failed[] = 'route parity';
}

// The THREE-WAY gate: the manifest, the Laravel route table and the Go
// route table, including the normalised middleware set and the rate limit
// of every route.
//
// This one starts the gateway itself, so the sequence is identical on a
// developer's machine and in CI — a half-run sequence that leaves a process
// behind is not a gate.
if (! step('the manifest, Laravel and Go agree', ['node', $root.'/tools/parity/routes-against-gateway.mjs', '--port=8097'])) {
    $failed[] = 'three-way route parity';
}

// The published matrix. It is GENERATED from the manifest and the golden files,
// so this step is really "the manifest and the contracts have not moved since
// docs/PARITY.md was last regenerated" — a stale matrix is a CI failure, and a
// hand-edited one is an outright lie about what is done.
if (! step('the parity matrix is up to date', ['node', $root.'/tools/parity/matrix.mjs', '--check'])) {
    $failed[] = 'parity matrix';
}

// The contract capture.
//
// The golden files are the ORACLE for the Go rewrite: 296 recordings of what
// the legacy application answers, byte for byte. The gate re-records them and
// compares — so a change in the legacy application's answers, or in the
// capture's own determinism, fails the build.
//
// The capture takes a few minutes (the fixture is rebuilt for every
// endpoint, so each recording is of a pristine world), and it is therefore
// opt-out with SKIP_CONTRACT_CAPTURE=1 for a quick local run.
if (getenv('SKIP_CONTRACT_CAPTURE') === '1') {
    fwrite(STDOUT, "\n==> the recorded contracts match the current application\n    skipped (SKIP_CONTRACT_CAPTURE=1)\n");
} else {
    if (! step('the recorded contracts match the current application', [$php, 'artisan', 'contract:capture', '--check'])) {
        $failed[] = 'contract capture';
    }
}

$corpus = $root.'/tools/money/corpus.json';

// ---------------------------------------------------------------------------
// The Go domain suites.
//
// These are the rewrite's OWN safety net, and they were not part of the gate:
// `internal/domain/money` (the value object and its rounding rules),
// `internal/domain/escrow` (the ledger vocabulary, the retention split, the
// platform fee and the service's idempotency), `internal/domain/authz`,
// `internal/jsonphp` and `internal/httpapi`.
//
// The differentials below prove the Go agrees with PHP on the cases they
// generate. They do not prove the Go is correct about anything PHP has no
// equivalent for — the three escrow type-lists, the retention truncation, the
// refund's reversal. That is what this step is for.
// ---------------------------------------------------------------------------
if (! step('the Go domain packages pass their own tests', ['go', 'test', './...'], ['GOEXPERIMENT' => 'nojsonv2'])) {
    $failed[] = 'go tests';
}

if (is_file($corpus)) {
    $phpResults = $root.'/.tmp/money-php.json';
    $goResults = $root.'/.tmp/money-go.json';

    $moneySteps = [
        'compute the PHP money answers' => [$php, $root.'/tools/money/compute-php.php', '--corpus='.$corpus, '--out='.$phpResults],
        'compute the Go money answers' => ['go', 'run', './cmd/moneydiff', '--corpus='.$corpus, '--out='.$goResults],
        'the two money implementations must agree' => ['node', $root.'/tools/money/compare.mjs', '--php='.$phpResults, '--go='.$goResults, '--corpus='.$corpus],
    ];

    foreach ($moneySteps as $name => $command) {
        if (! step($name, $command)) {
            $failed[] = 'money differential';
        }
    }
}

// ---------------------------------------------------------------------------
// 13. The JSON encoding differential.
//
// The Go `jsonphp` package is a PORT of PHP's `json_encode` with the
// default flags — the flags Laravel's `response()->json()` uses. The
// rewrite's contract is that a Go response body is BYTE-IDENTICAL to the
// Laravel one, and PHP and Go's encoders differ in five ways that a
// comparison which parses the JSON first would not see:
//
//   - the forward slash: PHP escapes it, Go does not;
//   - non-ASCII characters: PHP writes \uXXXX, Go writes raw UTF-8;
//   - the \b and \f escapes: PHP has them, Go does not;
//   - the key order: PHP keeps insertion order, Go sorts a map;
//   - the float formatting: PHP's thresholds and shapes are its own.
//
// So the two encoders are run over a fixed-seed corpus and compared BYTE
// FOR BYTE.
// ---------------------------------------------------------------------------
$jsonCorpus = $root.'/tools/json/corpus.json';

if (is_file($jsonCorpus)) {
    $phpResults = $root.'/.tmp/json-php.json';
    $goResults = $root.'/.tmp/json-go.json';

    $jsonSteps = [
        'compute the PHP JSON answers' => [$php, $root.'/tools/json/compute-php.php', '--corpus='.$jsonCorpus, '--out='.$phpResults],
        'compute the Go JSON answers' => ['go', 'run', './cmd/jsondiff', '--corpus='.$jsonCorpus, '--out='.$goResults],
        'the two JSON encoders must agree' => ['node', $root.'/tools/json/compare.mjs', '--php='.$phpResults, '--go='.$goResults, '--corpus='.$jsonCorpus],
    ];

    foreach ($jsonSteps as $name => $command) {
        if (! step($name, $command, ['GOEXPERIMENT' => 'nojsonv2'])) {
            $failed[] = 'json differential';
        }
    }
}

// ---------------------------------------------------------------------------
// 14. The PostgreSQL baseline, against the live MySQL schema.
//
// The rewrite's target engine is PostgreSQL, and its baseline is a
// HAND-WRITTEN translation of the live MySQL schema. A hand-written
// translation drifts, so the baseline is checked by a tool that reads the
// LIVE MySQL schema and diffs it against the baseline — tables, columns,
// enum types, enum VALUES IN ORDER, foreign keys, indexes, and column
// DEFAULTS.
//
// The baseline is also built FROM SCRATCH here, because a baseline that has
// only ever been applied to a database that already existed is not a
// baseline: the failures that matter — an ordering assumption, an extension
// that is not installed, a migration that depends on state a previous one
// created — only appear on a clean build.
//
// SKIPPED, not failed, when there is no PostgreSQL to talk to. The gate has
// to be runnable on a machine that only has MySQL; the CI job
// (`.github/workflows/ci.yml`, `postgres-baseline`) is where this is
// enforced, and it runs with a real PostgreSQL service.
// ---------------------------------------------------------------------------
$psql = null;

foreach ([
    'D:'.'\\'.'laragon'.'\\'.'bin'.'\\'.'postgresql'.'\\'.'pgsql-18.6'.'\\'.'bin'.'\\'.'psql.exe',
    '/usr/local/bin/psql',
    '/usr/bin/psql',
] as $candidate) {
    if (is_file($candidate)) {
        $psql = $candidate;
        break;
    }
}

if ($psql === null || getenv('SKIP_POSTGRES_BASELINE') === '1') {
    fwrite(STDOUT, "\n==> the PostgreSQL baseline matches the live MySQL schema\n    skipped: no psql on this machine\n");
} else {
    $env = ['PSQL_BIN' => $psql];

    if (is_file('D:'.'\\'.'laragon'.'\\'.'bin'.'\\'.'mysql'.'\\'.'mysql-9.6.0-winx64'.'\\'.'bin'.'\\'.'mysql.exe')) {
        $env['MYSQL_BIN'] = 'D:'.'\\'.'laragon'.'\\'.'bin'.'\\'.'mysql'.'\\'.'mysql-9.6.0-winx64'.'\\'.'bin'.'\\'.'mysql.exe';
    }

    $pgCheck = step(
        'the PostgreSQL baseline matches the live MySQL schema',
        ['node', $root.'/tools/db/verify-postgres-baseline.mjs'],
        $env,
    );

    if (! $pgCheck) {
        $failed[] = 'postgres baseline';
    }
}

// ---------------------------------------------------------------------------
// 15. The visual screens.
//
// P-2 of the parity contract: for each screen the port renders, the pixels must
// match the baseline captured from the legacy application (ADR-0021). The
// baseline is captured by `node tools/visual/capture.mjs`, and the comparison
// here re-captures and diffs every screen.
//
// It needs the application RUNNING with the seeded database, which a lint-only
// gate does not, so the step is SKIPPED when the base URL does not answer. The
// skip is visible: it prints why.
//
// The comparison also refuses to run when the baseline was captured on a
// different platform — never matching across operating systems is a fact about
// glyph rasterisation, not a regression, and pretending otherwise would train
// everyone to ignore the gate.
// ---------------------------------------------------------------------------
$visualBase = getenv('VISUAL_BASE_URL') ?: 'http://127.0.0.1:9000';

if (! step('the visual screenshot inventory is up to date', ['node', $root.'/tools/visual/screens.mjs', '--check'])) {
    $failed[] = 'visual screenshot inventory';
}

if (getenv('SKIP_VISUAL_SCREENS') === '1') {
    fwrite(STDOUT, "
==> the screens render as the baseline says
    skipped (SKIP_VISUAL_SCREENS=1)
");
} else {
    $headers = @get_headers(rtrim($visualBase, '/').'/', true);
    $answers = is_array($headers) && str_contains((string) ($headers[0] ?? ''), '200');

    if (! $answers) {
        fwrite(STDOUT, "
==> the screens render as the baseline says
    skipped: nothing answers at {$visualBase} (start the app, or set VISUAL_BASE_URL)
");
    } elseif (! step('the screens render as the baseline says', ['node', $root.'/tools/visual/compare-screens.mjs', '--base-url='.$visualBase])) {
        $failed[] = 'visual screens';
    }
}

// ---------------------------------------------------------------------------
// 15b. The ETL: MySQL -> PostgreSQL.
//
// `cmd/etl` copies the live MySQL data into the PostgreSQL target. It is the
// only way to prove that the TARGET SCHEMA can hold the DATA — the baseline is
// checked against the MySQL schema's SHAPE, and this checks its CONTENT.
//
// It has already earned its keep: the first run refused a zero-amount ledger
// row (the voided duplicate of Rp 5 500 000) because the target's CHECK
// constraint forbade it, and that sent us back to the constraint rather than to
// a `--skip-bad-rows` flag.
//
// Skipped when PostgreSQL is not reachable, like the baseline check above.
// ---------------------------------------------------------------------------
// The DSN comes from `.env`, like everything else that connects to MySQL: this
// machine has no root password and CI's root password is `root`, and a
// hardcoded DSN is wrong on one of them.
$etlCredentials = databaseCredentials($root);
$etlDsn = sprintf(
    '%s:%s@tcp(%s:%s)/%s?parseTime=false',
    $etlCredentials['username'],
    $etlCredentials['password'],
    $etlCredentials['host'],
    $etlCredentials['port'],
    $etlCredentials['database'],
);

if ($psql === null || getenv('SKIP_POSTGRES_BASELINE') === '1') {
    fwrite(STDOUT, "
==> the ETL reproduces the MySQL rows in PostgreSQL
    skipped: no PostgreSQL on this machine
");
} else {
    $etl = step(
        'the ETL reproduces the MySQL rows in PostgreSQL',
        ['go', 'run', './cmd/etl', '-all'],
        [
            'GOEXPERIMENT' => 'nojsonv2',
            'MYSQL_DSN' => $etlDsn,
            'DATABASE_URL' => 'postgres://postgres@127.0.0.1:5432/4ceria_pgcheck',
        ],
    );

    if (! $etl) {
        $failed[] = 'etl';
    } elseif (! step(
        'the two databases hold the same number of rows',
        ['go', 'run', './cmd/etl', '-all', '-verify'],
        [
            'GOEXPERIMENT' => 'nojsonv2',
            'MYSQL_DSN' => $etlDsn,
            'DATABASE_URL' => 'postgres://postgres@127.0.0.1:5432/4ceria_pgcheck',
        ],
    )) {
        $failed[] = 'etl verify';
    }
}

// ---------------------------------------------------------------------------
// 15c. The ported endpoints, against the applications they replace.
//
// `tools/parity/shadow-all.mjs` starts the gateway on the ETL'd PostgreSQL
// database, sends the same request to Laravel and to Go for every route the
// gateway actually SERVES, and requires the answers to be identical byte for
// byte.
//
// It is the step that makes the handlers' correctness part of the gate rather
// than a fact somebody verified once. The list of ported routes lives in the
// script and grows one entry at a time.
//
// Skipped when PostgreSQL is absent, like the two sections above.
// ---------------------------------------------------------------------------
if ($psql === null || getenv('SKIP_POSTGRES_BASELINE') === '1') {
    fwrite(STDOUT, "
==> the ported endpoints answer byte-identically
    skipped: no PostgreSQL on this machine
");
} else {
    $legacyBase = getenv('SHADOW_LARAVEL') ?: 'http://127.0.0.1:9001';
    $headers = @get_headers(rtrim($legacyBase, '/').'/', true);
    $legacyAnswers = is_array($headers) && str_contains((string) ($headers[0] ?? ''), '200');

    if (! $legacyAnswers) {
        fwrite(STDOUT, "
==> the ported endpoints answer byte-identically
    skipped: nothing answers at {$legacyBase} (start the legacy app, or set SHADOW_LARAVEL)
");
    } elseif (! step(
        'the ported endpoints answer byte-identically',
        ['node', $root.'/tools/parity/shadow-all.mjs', '--laravel='.$legacyBase],
        [
            'PHP_BIN' => $php,
            'DATABASE_URL' => 'postgres://postgres@127.0.0.1:5432/4ceria_pgcheck',
        ],
    )) {
        $failed[] = 'shadow parity';
    }
}

// ---------------------------------------------------------------------------
// 16. The Next.js port (web/).
//
// The port's own gates, which are different from the legacy ones: the
// stylesheet must still be the DESIGN (a byte-copy of resources/css, with only
// the @source paths retargeted), the TypeScript must compile, and the app must
// build.
//
// Skipped when web/node_modules is absent: a checkout that has not installed
// the second app cannot build it, and pretending otherwise would fail a gate
// for a missing prerequisite rather than a defect.
// ---------------------------------------------------------------------------
if (! is_dir($root.'/web/node_modules')) {
    fwrite(STDOUT, "
==> the Next.js port builds
    skipped: web/node_modules is absent (cd web && npm install)
");
} else {
    // `npmCommand()` because `npm` on Windows is a `.cmd` shim that
    // proc_open cannot launch by name — the same trap the SPA steps document.
    $webSteps = [
        'the port ships the same stylesheet' => npmCommand(['run', 'sync:styles:check']),
        'the port ships the same help content' => npmCommand(['run', 'sync:content:check']),
        'the port type-checks' => npmCommand(['exec', '--', 'tsc', '--noEmit']),
        'the port builds' => npmCommand(['run', 'build']),
    ];

    foreach ($webSteps as $name => $command) {
        if (! step($name, $command, [], $root.'/web')) {
            $failed[] = 'web';
        }
    }
}

// ---------------------------------------------------------------------------
// 17. Ledger diagnostics.
//
// `money:detect-duplicates` and `money:reconcile` are DIAGNOSTICS: on a
// database with pre-existing violations they report them and exit non-zero,
// which is correct behaviour. Their findings are triaged in the refinement
// plan, not silenced here, so both are reported without failing the run.
// ---------------------------------------------------------------------------
foreach (['money:detect-duplicates', 'money:reconcile'] as $diagnostic) {
    fwrite(STDOUT, "\n==> {$diagnostic} (informational)\n");
    exec(escapeshellarg($php).' artisan '.escapeshellarg($diagnostic).' --no-interaction 2>&1', $out, $status);
    foreach ($out as $line) {
        fwrite(STDOUT, '    '.$line."\n");
    }
    if ($status !== 0) {
        fwrite(STDOUT, "    reported findings (does not fail the gate)\n");
    }
    $out = [];
}

// ---------------------------------------------------------------------------
fwrite(STDOUT, "\n");

if ($failed === []) {
    fwrite(STDOUT, "VERIFICATION PASSED\n");
    exit(0);
}

fwrite(STDERR, 'VERIFICATION FAILED ('.count($failed)."):\n");

foreach ($failed as $failure) {
    fwrite(STDERR, "  - {$failure}\n");
}

exit(1);
