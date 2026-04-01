<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$user = App\Models\User::where('role_type', 'arsitek')->first();
echo "User ID: " . $user->id . "\n";

$arsitek = \App\Models\Arsitek::where('user_id', $user->id)->first();
echo "Arsitek Profile Exists: " . ($arsitek ? 'Yes' : 'No') . "\n";

$query = App\Models\Project::withCount(['bidsArsitek', 'bidsKontraktor']);

$query->where(function ($q) use ($arsitek) {
    // Return 'open' or 'accepted_kontraktor' where target_role includes arsitek
    $q->where(function($subQ) {
        $subQ->whereIn('status', ['open', 'accepted_kontraktor'])
             ->whereIn('target_role', ['both', 'arsitek']);
    });
    
    // OR if the arsitek is explicitly hired to the project already
    if ($arsitek) {
        $q->orWhere('selected_arsitek_id', $arsitek->id);
    }
});
$query->latest();

echo "SQL: " . $query->toSql() . "\n";
echo "Count: " . $query->count() . "\n";

$projects = $query->get();
foreach ($projects as $p) {
    echo "- Project " . $p->id . ": target_role=" . $p->target_role . " status=" . $p->status . "\n";
}
