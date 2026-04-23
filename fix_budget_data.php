<?php

use App\Models\Project;

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';

$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "Starting Budget Data Fix...\n";

$projects = Project::whereNull('budget')->orWhere('budget', 0)->get();
$count = 0;

foreach ($projects as $project) {
    // If it's null or 0, we can't do much without user input, but setting to 0 ensures the system doesn't crash on null.
    // Usually, we'd want to keep the existing value if it's > 0.
    if (is_null($project->budget)) {
        $project->update(['budget' => 0]);
        $count++;
    }
}

echo "Fixed $count projects with null budgets.\n";
echo "Done.\n";
