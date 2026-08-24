<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\BidArsitek;
use App\Models\BidKontraktor;
use App\Models\BidNotaris;
use App\Models\BidInterior;
use App\Models\BidProjectManager;
use App\Models\BidStructural;
use App\Models\BidMep;

$models = [
    BidArsitek::class,
    BidKontraktor::class,
    BidNotaris::class,
    BidInterior::class,
    BidProjectManager::class,
    BidStructural::class,
    BidMep::class
];

foreach ($models as $model) {
    $count = $model::where('status', 'negotiating')
        ->where('negotiation_count', 0)
        ->update(['negotiation_count' => 1]);
    if ($count > 0) {
        echo "Updated $count bids in $model\n";
    }
}
