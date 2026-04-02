<?php

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\House;
use App\Http\Resources\HouseResource;
use Illuminate\Http\Request;

$houseId = 19;
$house = House::with(['housePic', 'room.roomPic', 'user'])->find($houseId);

if (!$house) {
    echo "House $houseId not found.\n";
    exit;
}

$resource = new HouseResource($house);
$request = Request::create('/api/houses/'.$houseId, 'GET');
$response = $resource->toResponse($request);

echo json_encode(json_decode($response->getContent(), true), JSON_PRETTY_PRINT);
