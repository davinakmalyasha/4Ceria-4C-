<?php

/**
 * compute-php.php — the PHP half of the money differential.
 *
 * Runs the LEGACY `App\Support\Money` over the same corpus the Go
 * implementation runs over, and writes the answers out. `tools/money/compare.mjs`
 * diffs the two.
 *
 * WHY THE LEGACY IMPLEMENTATION IS THE REFERENCE
 * ----------------------------------------------
 * The Go package is a port of this class, and the Laravel application is what
 * the port replaces. So the PHP answers are the ones the running system
 * produces today, and they are the reference — a Go answer that differs is a
 * behaviour change in the rewrite, whatever the Go code intends.
 *
 * USAGE
 *   php tools/money/compute-php.php --corpus=tools/money/corpus.json --out=.tmp/money-php.json
 */

require __DIR__.'/../../vendor/autoload.php';

use App\Support\Money;

$options = getopt('', ['corpus::', 'out::']);

$corpusPath = $options['corpus'] ?? 'tools/money/corpus.json';
$outPath = $options['out'] ?? '.tmp/money-php.json';

$document = json_decode((string) file_get_contents($corpusPath), true, 512, JSON_THROW_ON_ERROR);

$results = [];

foreach ($document['cases'] as $case) {
    $result = [
        'op' => $case['op'],
        'amount' => $case['amount'],
    ];

    try {
        $money = Money::of($case['amount']);

        $result['decimal'] = $money->toDecimal();

        switch ($case['op']) {
            case 'percentage':
                $value = $money->percentage($case['percentage']);
                $result['decimal'] = $value->toDecimal();
                $result['original'] = $money->toDecimal();
                break;

            case 'split':
                $parts = $money->split((int) $case['parts']);
                $result['original'] = $money->toDecimal();
                $result['parts'] = array_map(fn (Money $part) => $part->toDecimal(), $parts);
                break;

            case 'allocate':
                $parts = $money->allocate($case['weights']);
                $result['original'] = $money->toDecimal();
                $result['parts'] = array_map(fn (Money $part) => $part->toDecimal(), $parts);
                break;

            case 'multiply':
                $result['original'] = $money->toDecimal();
                $result['factor'] = $case['factor'];
                $result['decimal'] = $money->multiplyBy((float) $case['factor'])->toDecimal();
                break;

            default:
                $result['error'] = 'unknown operation: '.$case['op'];
        }
    } catch (Throwable $e) {
        // The decimal is UNSET: the operation failed, so there is no answer,
        // and leaving the pre-operation value in place would make a failure
        // look like a disagreement about the ORIGINAL amount.
        unset($result['decimal']);
        $result['error'] = $e->getMessage();
    }

    $results[] = $result;
}

$directory = dirname($outPath);

if (! is_dir($directory)) {
    mkdir($directory, 0755, true);
}

file_put_contents(
    $outPath,
    json_encode(['engine' => 'php', 'cases' => $results], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n",
);

fwrite(STDOUT, sprintf("computed %d cases -> %s\n", count($results), $outPath));
