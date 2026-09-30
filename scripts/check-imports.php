<?php

/**
 * One-off checker: every file calling `Hire::` must import it or use the FQCN.
 *
 * A codemod can insert `Hire::matches(...)` without adding the `use` statement,
 * which is a fatal at runtime and completely invisible to `php -l`. Run after
 * any codemod that introduces a new class reference.
 *
 *     php scripts/check-imports.php
 *
 * Deliberately scoped to ONE class. A general unresolved-reference checker
 * reports hundreds of false positives, because same-namespace classes, base
 * classes and prose inside docblocks all look like unqualified references — and
 * a checker with 271 false positives is a checker nobody runs.
 *
 * Exits non-zero when something is missing, so it can be a CI step.
 */

$root = dirname(__DIR__);
$target = 'Hire';
$missing = 0;

$files = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($root . '/app', FilesystemIterator::SKIP_DOTS)
);

foreach ($files as $file) {
    if ($file->getExtension() !== 'php') {
        continue;
    }

    $path = $file->getPathname();
    $src = file_get_contents($path);

    // Skip the class itself and anything that does not call it.
    if (! str_contains($src, $target . '::')) {
        continue;
    }

    $basename = basename($path);

    if (in_array($basename, ['Hire.php'], true)) {
        continue;
    }

    $hasImport = (bool) preg_match('/^use\s+App\\\\Support\\\\Hire;/m', $src);
    $usesFqn = (bool) preg_match('/\\\\App\\\\Support\\\\Hire::/', $src);

    if ($hasImport || $usesFqn) {
        continue;
    }

    // Strip comments so a mention inside a docblock is not counted as a call.
    $code = preg_replace('~/\*.*?\*/~s', '', $src);
    $code = preg_replace('~//[^\n]*~', '', $code);

    // A call in code, as opposed to only being named in prose.
    if (! preg_match('/\b' . $target . '::(matches|canAccess|isOwnerOrAssignedPm|profileIdFor|knownRoles)\s*\(/', $code)) {
        continue;
    }

    echo str_pad($basename, 46) . " calls {$target}:: with no import\n";
    $missing++;
}

echo $missing === 0
    ? "All Hire:: calls resolve.\n"
    : "{$missing} file(s) missing the import.\n";

exit($missing === 0 ? 0 : 1);