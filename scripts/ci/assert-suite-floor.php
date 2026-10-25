<?php

/**
 * assert-suite-floor.php — the RISING FLOOR for the legacy test suite.
 *
 * WHY
 * ---
 * The Laravel application is the oracle for the Go rewrite. The port is judged
 * against it, endpoint by endpoint and byte by byte. A test that quietly
 * disappears is a silent narrowing of the definition of "identical", and the
 * thing that would catch it — a suite that grew smaller — is invisible in a
 * green CI run, because a green run says nothing about how much it checked.
 *
 * So the count is a FLOOR. It may rise. It may not fall.
 *
 * WHAT IT CHECKS
 * --------------
 *   1. The JUnit report exists and parses.
 *   2. `tests`      >= the committed floor.
 *   3. `assertions` >= the committed floor.
 *   4. `failures` and `errors` are zero.
 *
 * USAGE
 *   php scripts/ci/assert-suite-floor.php junit.xml
 *
 * The floor lives in scripts/ci/suite-floor.json so that raising it is a
 * one-line, reviewable diff.
 */

declare(strict_types=1);

$reportPath = $argv[1] ?? 'junit.xml';
$floorPath = __DIR__.'/suite-floor.json';

if (! is_file($reportPath)) {
    fwrite(STDERR, "::error::JUnit report not found: {$reportPath}\n");
    exit(1);
}

if (! is_file($floorPath)) {
    fwrite(STDERR, "::error::Suite floor not found: {$floorPath}\n");
    exit(1);
}

/** @var array{tests: int, assertions: int} $floor */
$floor = json_decode((string) file_get_contents($floorPath), true, 512, JSON_THROW_ON_ERROR);

$xml = @simplexml_load_file($reportPath);

if ($xml === false) {
    fwrite(STDERR, "::error::JUnit report is not valid XML: {$reportPath}\n");
    exit(1);
}

$attributes = $xml->testsuite->attributes();

$tests = (int) ($attributes['tests'] ?? 0);
$assertions = (int) ($attributes['assertions'] ?? 0);
$failures = (int) ($attributes['failures'] ?? 0);
$errors = (int) ($attributes['errors'] ?? 0);
$skipped = (int) ($attributes['skipped'] ?? 0);

$problems = [];

if ($tests < $floor['tests']) {
    $problems[] = sprintf(
        'test count DROPPED: %d < %d (-%d). Deleting a test narrows the oracle.',
        $tests,
        $floor['tests'],
        $floor['tests'] - $tests
    );
}

if ($assertions < $floor['assertions']) {
    $problems[] = sprintf(
        'assertion count DROPPED: %d < %d (-%d). The oracle is asserting less than it was.',
        $assertions,
        $floor['assertions'],
        $floor['assertions'] - $assertions
    );
}

if ($failures > 0) {
    $problems[] = sprintf('%d failing test(s)', $failures);
}

if ($errors > 0) {
    $problems[] = sprintf('%d errored test(s)', $errors);
}

if ($problems !== []) {
    foreach ($problems as $problem) {
        fwrite(STDERR, "::error::{$problem}\n");
    }
    exit(1);
}

fwrite(
    STDOUT,
    sprintf(
        "suite floor OK — %d tests, %d assertions (floor: %d/%d), %d skipped\n",
        $tests,
        $assertions,
        $floor['tests'],
        $floor['assertions'],
        $skipped
    )
);

exit(0);
