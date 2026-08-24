<?php
// Detection-only script (safe, read-only): counts duplicate ledger rows and duplicate bids.
require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$kernel->bootstrap();

echo "ledger dup groups: " . DB::table('project_budget_transactions')
    ->selectRaw('project_id, reference_model, reference_id, COUNT(*) as c')
    ->whereNotNull('reference_model')
    ->groupBy('project_id', 'reference_model', 'reference_id')
    ->havingRaw('c > 1')
    ->get()
    ->count() . PHP_EOL;

$tables = [
    'bids_arsitek' => 'arsitek_id',
    'bids_kontraktor' => 'kontraktor_id',
    'bids_notaris' => 'notaris_id',
    'bids_interior' => 'interior_id',
    'bids_project_manager' => 'pm_id',
    'bids_structural' => 'structural_id',
    'bids_mep' => 'mep_id',
];
foreach ($tables as $t => $col) {
    try {
        $n = DB::table($t)
            ->selectRaw("project_id, {$col}, COUNT(*) as c")
            ->groupBy('project_id', $col)
            ->havingRaw('c > 1')
            ->get()
            ->count();
        echo "{$t} dup groups: {$n}" . PHP_EOL;
    } catch (\Exception $e) {
        echo "{$t}: ERR " . substr($e->getMessage(), 0, 80) . PHP_EOL;
    }
}
