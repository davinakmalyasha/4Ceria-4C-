<?php
use App\Models\Project;
use App\Models\NotarisProfile;
use App\Models\ProjectMilestone;

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$project = Project::find(78);
$notary = NotarisProfile::whereHas('user', function($q) {
    $q->where('name', 'like', '%Rede%');
})->first();

if ($project && $notary && $project->bidsNotaris()->where('status', 'accepted')->exists()) {
    $bid = $project->bidsNotaris()->where('status', 'accepted')->first();
    // Clear existing to avoid duplicates
    $project->milestones()->where('type', 'legal')->delete();

    foreach ($bid->selected_services as $index => $service) {
        $title = is_array($service) ? ($service['title'] ?? 'Legal Document') : (string)$service;
        $description = is_array($service) ? ($service['description'] ?? 'Legal certificate/permit processing.') : 'Processing: ' . (string)$service;
        $price = is_array($service) ? ($service['price'] ?? 0) : 0;

        ProjectMilestone::create([
            'project_id' => $project->id, 
            'notaris_id' => $notary->user_id, 
            'title' => 'L0' . ($index + 1) . ': ' . $title, 
            'description' => $description, 
            'type' => 'legal', 
            'phase_context' => 'legal', 
            'sort_order' => $index, 
            'is_completed' => false, 
            'approval_status' => 'in_progress', 
            'content' => ['service_price' => $price]
        ]);
    }
    echo "Seeded legal milestones for project 78.\n";
} else {
    echo "Project, notary, or accepted bid not found.\n";
}
