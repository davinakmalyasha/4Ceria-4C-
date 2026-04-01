<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

foreach(['bids_arsitek', 'bids_kontraktor'] as $tbl) { 
    $keys = DB::select("SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='4c-build' AND TABLE_NAME='$tbl' AND REFERENCED_TABLE_NAME IS NOT NULL"); 
    echo $tbl . ":\n";
    foreach($keys as $k) {
        echo " - " . $k->CONSTRAINT_NAME . " (" . $k->COLUMN_NAME . " -> " . $k->REFERENCED_TABLE_NAME . "." . $k->REFERENCED_COLUMN_NAME . ")\n";
    }
}
