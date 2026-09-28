<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectSchedule;
use App\Models\ProjectDelay;
use Illuminate\Support\Facades\DB;

class ProjectScheduleService
{
    /**
     * Get or initialize schedules for a project.
     */
    public function getProjectTimeline(Project $project)
    {
        $phases = ['management', 'legal', 'design', 'build', 'materials', 'handover'];
        
        $schedules = $project->schedules()->get()->keyBy('phase_slug');
        $reportCounts = $project->reports()
            ->select('phase_slug', DB::raw('count(*) as count'))
            ->groupBy('phase_slug')
            ->pluck('count', 'phase_slug');

        foreach ($phases as $phase) {
            if (!$schedules->has($phase)) {
                $newPhase = ProjectSchedule::create([
                    'project_id' => $project->id,
                    'phase_slug' => $phase,
                    'status' => 'pending',
                    'progress_percentage' => 0
                ]);
                $schedules->put($phase, $newPhase);
            }
            // Attach report count
            $schedules[$phase]->report_count = $reportCounts->get($phase, 0);
        }

        $delays = $project->delays()->orderBy('logged_at', 'desc')->get();
        $unlinkedReports = $project->reports()
            ->whereNull('phase_slug')
            ->with('creator')
            ->orderBy('created_at', 'desc')
            ->get();

        return [
            'schedules' => $schedules->values(),
            'delays' => $delays,
            'unlinked_reports' => $unlinkedReports,
            'summary' => $this->calculateSummary($project, $schedules)
        ];
    }

    /**
     * Log a project delay AND cascade-shift the target dates of the delayed
     * phase plus every subsequent phase by the logged number of days. The
     * pre-delay baseline is preserved in original_target_end_date the first
     * time a phase is shifted.
     */
    public function logDelay(Project $project, array $data)
    {
        return DB::transaction(function () use ($project, $data) {
            $delay = ProjectDelay::create([
                'project_id' => $project->id,
                'phase_slug' => $data['phase_slug'],
                'days' => $data['days'],
                'reason' => $data['reason'],
                'category' => $data['category'] ?? 'external',
                'logged_at' => $data['logged_at'] ?? now()
            ]);

            // Canonical phase order, matching getProjectTimeline().
            $phaseOrder = ['management', 'legal', 'design', 'build', 'materials', 'handover'];
            $startIndex = array_search($data['phase_slug'], $phaseOrder, true);

            if ($startIndex !== false) {
                $days = (int) $data['days'];
                $affectedPhases = array_slice($phaseOrder, $startIndex);

                $schedules = ProjectSchedule::where('project_id', $project->id)
                    ->whereIn('phase_slug', $affectedPhases)
                    ->get();

                foreach ($schedules as $schedule) {
                    if ($schedule->target_end_date && !$schedule->original_target_end_date) {
                        $schedule->original_target_end_date = $schedule->target_end_date;
                    }
                    if ($schedule->target_start_date) {
                        $schedule->target_start_date = \Carbon\Carbon::parse($schedule->target_start_date)->addDays($days);
                    }
                    if ($schedule->target_end_date) {
                        $schedule->target_end_date = \Carbon\Carbon::parse($schedule->target_end_date)->addDays($days);
                    }
                    $schedule->shifted_days = (int) $schedule->shifted_days + $days;
                    $schedule->save();
                }

                // Notify owner and assigned PM (pm_id stores the PM's USER id).
                $recipients = array_unique(array_filter([$project->user_id, $project->pm_id]));
                foreach ($recipients as $userId) {
                    Notification::create([
                        'user_id' => $userId,
                        'type' => 'schedule_delayed',
                        'title' => 'Timeline Updated',
                        'body' => "A {$days}-day delay on the {$data['phase_slug']} phase shifted the project timeline. Reason: {$data['reason']}",
                        'data' => ['project_id' => $project->id],
                    ]);
                }
            }

            return $delay;
        });
    }

    private function calculateSummary($project, $schedules)
    {
        $completed = $schedules->filter(fn($s) => $s->status === 'completed')->count();
        $total = $schedules->count();

        // Find current phase
        $current = $schedules->where('status', 'active')->first() ?? 
                   $schedules->where('status', 'pending')->first();

        // Milestone-weighted completion: phases are weighted by their milestone
        // count so a 20-milestone build phase doesn't count the same as a
        // 1-milestone legal phase. Phases without milestones fall back to a
        // single unit based on their status.
        $milestones = $project->milestones()
            ->selectRaw("phase_context, count(*) as total, sum(case when approval_status = 'approved' or is_completed = 1 then 1 else 0 end) as done")
            ->groupBy('phase_context')
            ->get()
            ->keyBy('phase_context');

        $weightedTotal = 0;
        $weightedDone = 0;

        foreach ($schedules as $schedule) {
            $row = $milestones->get($schedule->phase_slug);
            $phaseTotal = $row ? (int) $row->total : 0;

            if ($phaseTotal > 0) {
                $weightedTotal += $phaseTotal;
                $weightedDone += (int) $row->done;
            } else {
                $weightedTotal += 1;
                $weightedDone += $schedule->status === 'completed' ? 1 : 0;
            }
        }

        return [
            'completion_percentage' => $weightedTotal > 0 ? round(($weightedDone / $weightedTotal) * 100) : 0,
            'phases_done' => $completed,
            'total_phases' => $total,
            'current_phase' => $current ? $current->phase_slug : null,
            'total_delay_days' => $project->delays()->sum('days')
        ];
    }
}
