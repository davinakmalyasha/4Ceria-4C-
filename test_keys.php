<?php

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\House;
use App\Http\Resources\HouseResource;
use Illuminate\Http\Request;

$houseId = 19;
$house = House::with(['housePic'])->find($houseId);

$resource = new HouseResource($house);
$request = Request::create('/api/houses/'.$houseId, 'GET');
$data = $resource->toArray($request);

echo "Type of housePic: " . gettype($data['housePic']) . "\n";
if (is_array($data['housePic'])) {
    echo "Is sequential: " . (array_keys($data['housePic']) === range(0, count($data['housePic']) - 1) ? "Yes" : "No") . "\n";
    echo "Keys: " . implode(", ", array_keys($data['housePic'])) . "\n";
}

echo json_encode($data['housePic'], JSON_PRETTY_PRINT);
