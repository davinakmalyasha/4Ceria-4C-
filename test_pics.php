<?php

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\HousePic;
use App\Models\House;

$houseId = 19;
$house = House::with('housePic')->find($houseId);

if (!$house) {
    echo "House $houseId not found.\n";
    exit;
}

echo "House ID: " . $house->id . " - " . $house->name . "\n";
echo "House Pics Count: " . $house->housePic->count() . "\n";

foreach ($house->housePic as $p) {
    echo "ID: " . $p->id . ", Dir: " . $p->dir . "\n";
}
