<?php

namespace App\Console\Commands;

use App\Models\Notification;
use App\Models\ProjectSnagItem;
use Illuminate\Console\Command;

class EscalateOverdueSnagsCommand extends Command
{
    protected $signature = 'snags:escalate-overdue';

    protected $description = 'Notify participants about snag/defect items past their SLA deadline and mark them escalated';

    public function handle(): int
    {
        $items = ProjectSnagItem::with('project')
            ->whereIn('status', ['open', 'in_progress'])
            ->whereNull('escalated_at')
            ->whereNotNull('due_at')
            ->where('due_at', '<', now())
            ->get();

        $count = 0;

        foreach ($items as $item) {
            $project = $item->project;
            if (!$project) {
                continue;
            }

            $recipients = array_filter([$project->user_id, $project->pm_id]);

            $assignedUserId = $item->assigned_role === 'interior'
                ? optional($project->interior)->user_id
                : optional($project->kontraktor)->user_id;

            if ($assignedUserId) {
                $recipients[] = $assignedUserId;
            }

            foreach (array_unique(array_filter($recipients)) as $userId) {
                Notification::create([
                    'user_id' => $userId,
                    'type' => 'snag_overdue',
                    'title' => 'Defect Past Deadline',
                    'body' => "\"{$item->title}\" ({$item->severity}) on project \"{$project->title}\" is past its SLA deadline.",
                    'data' => ['project_id' => $project->id, 'snag_id' => $item->id],
                ]);
            }

            $item->update(['escalated_at' => now()]);
            $count++;
        }

        $this->info("Escalated {$count} overdue snag item(s).");

        return self::SUCCESS;
    }
}
