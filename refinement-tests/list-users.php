<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

foreach (App\Models\User::orderBy('id')->limit(8)->get(['id', 'email', 'role_type']) as $u) {
    echo $u->id . ' | ' . $u->email . ' | ' . $u->role_type . PHP_EOL;
}
echo 'total users: ' . App\Models\User::count() . PHP_EOL;
