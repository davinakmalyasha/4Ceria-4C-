<?php

/**
 * One-off codemod: replace every copy-pasted "hired professional" comparison
 * with a call to App\Support\Hire::matches().
 *
 * The pattern being removed is the vulnerable one:
 *
 *     (int) $project->selected_arsitek_id === (int) $user->arsitek?->id
 *     $project->selected_arsitek_id === $user->arsitek?->id
 *     (int) $project->selected_interior_id === (int) optional($user->interior_profile)->id
 *
 * because when both sides are absent it evaluates true.
 *
 * Run from the repository root:
 *
 *     php scripts/codemod-hire-matches.php            # dry run, prints a plan
 *     php scripts/codemod-hire-matches.php --apply    # writes
 */

$root = dirname(__DIR__);
$apply = in_array('--apply', $argv, true);

// role => [ project column, user relation accessor as written in the source ]
$roles = [
    'arsitek' => ['selected_arsitek_id', 'arsitek'],
    'kontraktor' => ['selected_kontraktor_id', 'kontraktor'],
    'interior' => ['selected_interior_id', 'interior_profile'],
    'notaris' => ['selected_notaris_id', 'notaris_profile'],
    'structural' => ['structural_id', 'structural_engineer'],
    'mep' => ['mep_id', 'mep_engineer'],
];

// The user variable name differs per file: $user, $u, Auth::user().
$userVars = ['$user', '$u', 'Auth::user()'];

$files = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($root . '/app', FilesystemIterator::SKIP_DOTS)
);

$changedFiles = 0;
$changedLines = 0;

// This codemod and the trait describe the pattern they replace, in their
// docblocks. Rewriting those would corrupt the explanation of the bug.
$skip = [
    realpath(__FILE__),
    realpath($root . '/app/Support/Hire.php'),
    realpath($root . '/app/Traits/HandlesProjectAuthorization.php'),
];

foreach ($files as $file) {
    if ($file->getExtension() !== 'php') {
        continue;
    }

    $path = $file->getPathname();

    if (in_array(realpath($path), $skip, true)) {
        continue;
    }

    $original = file_get_contents($path);
    $updated = $original;

    foreach ($roles as $role => [$column, $relation]) {
        foreach ($userVars as $uv) {
            $escaped = preg_quote($uv, '/');

            // (int) $project->COL === (int) $uv->REL?->id
            $patterns = [
                // (int) $project->COL === (int) $uv->REL?->id
                "/\(int\)\s*\\\$project->{$column}\s*===\s*\(int\)\s*({$escaped})->{$relation}\?->id/",
                // $project->COL === $uv->REL?->id
                "/\\\$project->{$column}\s*===\s*({$escaped})->{$relation}\?->id/",
                // (int) $project->COL === (int) optional($uv->REL)->id
                "/\(int\)\s*\\\$project->{$column}\s*===\s*\(int\)\s*optional\(({$escaped})->{$relation}\)->id/",
                // (int)$project->COL === (int)$uv->REL?->id   (no spaces)
                "/\(int\)\s*\\\$project->{$column}\s*===\s*\(int\)\s*({$escaped})->{$relation}\?->id/",
            ];

            foreach ($patterns as $pattern) {
                $replacement = "Hire::matches(\$project, $1, '{$role}')";
                $count = 0;
                $new = preg_replace($pattern, $replacement, $updated, -1, $count);
                if ($count > 0) {
                    $updated = $new;
                }
            }
        }
    }

    if ($updated === $original) {
        continue;
    }

    $changedFiles++;
    $delta = substr_count($updated, 'Hire::matches') - substr_count($original, 'Hire::matches');
    $changedLines += $delta;

    echo str_pad(basename($path), 46) . " +{$delta} replacement(s)\n";

    if ($apply) {
        file_put_contents($path, $updated);
    }
}

echo "\n{$changedFiles} file(s), {$changedLines} replacement(s).\n";
echo $apply ? "WRITTEN.\n" : "DRY RUN — pass --apply to write.\n";