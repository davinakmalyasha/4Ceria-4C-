<?php

/**
 * Remove duplicated `use` statements from a file.
 *
 * Written because a PowerShell `[regex]::Replace($t, $p, $r, 1)` intended as
 * "replace once" binds the 4th argument to the `RegexOptions` OVERLOAD, not to
 * `count` — so it replaced every occurrence and produced two identical imports,
 * which is a fatal ("name is already in use") that `php -l` does catch but which
 * is tedious to fix by hand across eleven files.
 *
 *     php scripts/dedupe-use.php <file> [<file> ...]
 */

$changed = 0;

foreach (array_slice($argv, 1) as $path) {
    if (! is_file($path)) {
        fwrite(STDERR, "no such file: {$path}\n");
        continue;
    }

    $src = file_get_contents($path);
    $seen = [];
    $out = [];

    foreach (preg_split('/(?<=\n)/', $src) as $line) {
        // Only top-level `use X;` / `use X as Y;` statements, not `use` inside a
        // closure body or a trait import.
        if (preg_match('/^use\s+[A-Za-z0-9_\\\\]+(\s+as\s+[A-Za-z0-9_]+)?;/', $line)) {
            $key = strtolower(trim($line));

            if (isset($seen[$key])) {
                continue; // drop the duplicate
            }

            $seen[$key] = true;
        }

        $out[] = $line;
    }

    $result = implode('', $out);

    if ($result !== $src) {
        file_put_contents($path, $result);
        echo "deduped: {$path}\n";
        $changed++;
    }
}

echo $changed === 0 ? "nothing to dedupe.\n" : "{$changed} file(s) deduped.\n";