<?php

/**
 * compute-php.php — the PHP side of the JSON encoding differential.
 *
 * Encodes every case of the corpus with PHP's `json_encode` and the DEFAULT
 * flags, which is what Laravel's `response()->json()` uses (`new
 * JsonResponse($data, $status, $headers, 0)`).
 *
 * The output is the BYTES, so the comparison is a byte comparison. A
 * comparison that parsed the JSON first would miss every difference the
 * corpus exists to find.
 *
 * USAGE
 *   php tools/json/compute-php.php --corpus=tools/json/corpus.json --out=.tmp/json-php.json
 */

$root = dirname(__DIR__, 2);

$options = getopt('', ['corpus::', 'out::']);

$corpusPath = $options['corpus'] ?? $root.'/tools/json/corpus.json';
$outPath = $options['out'] ?? $root.'/.tmp/json-php.json';

$raw = file_get_contents($corpusPath);

if ($raw === false) {
    fwrite(STDERR, "::error::could not read the corpus: {$corpusPath}\n");
    exit(1);
}

$corpus = json_decode($raw, true);

if (!is_array($corpus) || !isset($corpus['cases'])) {
    fwrite(STDERR, "::error::{$corpusPath} is not a corpus\n");
    exit(1);
}

/**
 * The PHP value a case stands for.
 *
 * The corpus describes values in a JSON-safe way, and this rebuilds them as
 * the PHP types they are meant to be — a float stays a float, an integer
 * stays an integer, and an ordered object becomes a PHP ARRAY, whose key
 * order is the insertion order.
 */
function caseValue(array $case)
{
    switch ($case['kind']) {
        case 'string':
            return $case['value'];

        case 'int':
            return (int) $case['value'];

        case 'float':
            return (float) $case['value'];

        case 'literal':
            return $case['value'];

        case 'array':
            return $case['value'];

        case 'object':
            $out = [];

            foreach ($case['entries'] as [$key, $value]) {
                $out[$key] = $value;
            }

            return $out;
    }

    return null;
}

$results = [];

foreach ($corpus['cases'] as $index => $case) {
    $value = caseValue($case);

    // The default flags. This is what `response()->json()` uses, and the
    // exception handler is the only place in the application that differs.
    $encoded = json_encode($value);

    $results[] = [
        'index' => $index,
        // `json_encode` returns FALSE for NAN and INF, and for invalid UTF-8.
        // Those are recorded as null so the failure is visible rather than
        // silently becoming the string "false".
        'encoded' => $encoded === false ? null : $encoded,
        'failed' => $encoded === false,
    ];
}

if (!is_dir(dirname($outPath))) {
    mkdir(dirname($outPath), 0755, true);
}

file_put_contents($outPath, json_encode(['cases' => $results]));

fwrite(STDOUT, 'wrote '.count($results)." PHP JSON answers to {$outPath}\n");
