<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectReport;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ProjectReportService
{
    /**
     * Create a new project report.
     */
    public function createReport(Project $project, array $data, int $userId): ProjectReport
    {
        return DB::transaction(function () use ($project, $data, $userId) {
            $report = new ProjectReport();
            $report->project_id = $project->id;
            $report->created_by = $userId;
            $report->summary = $data['summary'];
            $report->progress_percentage = $data['progress_percentage'] ?? 0;
            $report->budget_health = $data['budget_health'] ?? 'on_track';
            $report->phase_slug = $data['phase_slug'] ?? null;
            
            $photoPaths = [];
            if (isset($data['photos']) && is_array($data['photos'])) {
                foreach ($data['photos'] as $photo) {
                    $path = $photo->store("projects/{$project->id}/reports/photos", 'public');
                    $photoPaths[] = $path;
                }
            }
            $report->site_photos = $photoPaths;

            $attachmentPaths = [];
            if (isset($data['attachments']) && is_array($data['attachments'])) {
                foreach ($data['attachments'] as $file) {
                    $path = $file->store("projects/{$project->id}/reports/docs", 'public');
                    $attachmentPaths[] = [
                        'name' => $file->getClientOriginalName(),
                        'path' => $path,
                        'size' => $file->getSize()
                    ];
                }
            }
            $report->attachments = $attachmentPaths;

            $report->published_at = now();
            $report->save();

            return $report;
        });
    }

    /**
     * Update an existing project report.
     */
    public function updateReport(ProjectReport $report, array $data): ProjectReport
    {
        return DB::transaction(function () use ($report, $data) {
            if (isset($data['summary'])) $report->summary = $data['summary'];
            if (isset($data['progress_percentage'])) $report->progress_percentage = $data['progress_percentage'];
            if (isset($data['budget_health'])) $report->budget_health = $data['budget_health'];
            if (isset($data['phase_slug'])) $report->phase_slug = $data['phase_slug'];

            if (isset($data['photos']) && is_array($data['photos'])) {
                $photoPaths = $report->site_photos ?? [];
                foreach ($data['photos'] as $photo) {
                    $path = $photo->store("projects/{$report->project_id}/reports/photos", 'public');
                    $photoPaths[] = $path;
                }
                $report->site_photos = $photoPaths;
            }

            if (isset($data['attachments']) && is_array($data['attachments'])) {
                $attachmentPaths = $report->attachments ?? [];
                foreach ($data['attachments'] as $file) {
                    $path = $file->store("projects/{$report->project_id}/reports/docs", 'public');
                    $attachmentPaths[] = [
                        'name' => $file->getClientOriginalName(),
                        'path' => $path,
                        'size' => $file->getSize()
                    ];
                }
                $report->attachments = $attachmentPaths;
            }

            $report->save();
            return $report;
        });
    }

    /**
     * Delete a report.
     */
    public function deleteReport(ProjectReport $report)
    {
        return DB::transaction(function () use ($report) {
            // Delete files
            if ($report->site_photos) {
                foreach ($report->site_photos as $photo) {
                    Storage::disk('public')->delete($photo);
                }
            }
            if ($report->attachments) {
                foreach ($report->attachments as $file) {
                    Storage::disk('public')->delete($file['path']);
                }
            }
            return $report->delete();
        });
    }
}
