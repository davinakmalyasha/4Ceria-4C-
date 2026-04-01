<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "Bids Arsitek: " . \App\Models\BidArsitek::count() . "\n";
foreach(\App\Models\BidArsitek::with('project')->get() as $b) {
    echo " - Bid ID {$b->id} on Project {$b->project_id} ({$b->project->title}) by Arsitek ID {$b->arsitek_id}\n";
}

echo "\nBids Kontraktor: " . \App\Models\BidKontraktor::count() . "\n";
foreach(\App\Models\BidKontraktor::with('project')->get() as $b) {
    echo " - Bid ID {$b->id} on Project {$b->project_id} ({$b->project->title}) by Kontraktor ID {$b->kontraktor_id}\n";
}
