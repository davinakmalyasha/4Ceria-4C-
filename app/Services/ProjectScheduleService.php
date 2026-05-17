<?php

namespace App\Services;

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
     * Update phase details.
     */
    public function updatePhase(ProjectSchedule $schedule, array $data)
    {
        $schedule->update($data);
        return $schedule;
    }

    /**
     * Log a project delay.
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

            // Update the target end date for this phase and subsequent phases?
            // For now, just log it. Dynamic shifting is complex for a v1.
            
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

        return [
            'completion_percentage' => $total > 0 ? round(($completed / $total) * 100) : 0,
            'phases_done' => $completed,
            'total_phases' => $total,
            'current_phase' => $current ? $current->phase_slug : null,
            'total_delay_days' => $project->delays()->sum('days')
        ];
    }
}
