<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add `termination_pending` to the projects.status enum.
     *
     * WHY: `ProjectMutualTerminationController::initiate()` writes
     * `status => 'termination_pending'`, but the value was never present in
     * the column's ENUM. Under MySQL strict mode (config/database.php
     * `strict => true`) that write raises error 1265 "Data truncated", so the
     * whole amicable-exit flow 500'd on initiate — and with it
     * `FreezeWorkspaceIfTerminationPending` (which keys off exactly this
     * status) could never fire, and the dispute-escalation path
     * (`escalate` requires a `rejected` termination) was unreachable.
     *
     * ADDITIVE ONLY: existing rows are untouched, no data is rewritten.
     *
     * NOTE: `contract_pending` / `planning` appear in some `whereIn` status
     * lists (ProjectController feed filters, ProjectResource helpers) but no
     * code path ever WRITES them to projects.status — they are bid-level
     * states. They are deliberately NOT added here; adding permanently
     * unreachable enum values would create phantom states.
     */
    public function up(): void
    {
        if (! Schema::hasTable('projects') || ! Schema::hasColumn('projects', 'status')) {
            return;
        }

        $type = Schema::getColumnType('projects', 'status');

        if (is_string($type) && stripos($type, 'enum') === false) {
            // Column is no longer an ENUM (varchar + CHECK) — nothing to do.
            return;
        }

        if (is_string($type) && str_contains($type, "'termination_pending'")) {
            return; // already present
        }

        $current = (string) DB::selectOne(
            "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'status'"
        )->t;

        if (! preg_match("/^enum\((.*)\)$/i", $current, $m)) {
            return;
        }

        $values = array_map(
            fn ($v) => trim(trim($v), "'"),
            str_getcsv($m[1], ',', "'", '"')
        );

        if (in_array('termination_pending', $values, true)) {
            return;
        }

        // Insert next to the lifecycle neighbours for readability.
        $insertAfter = 'in_progress';
        $idx = array_search($insertAfter, $values, true);
        if ($idx === false) {
            $values[] = 'termination_pending';
        } else {
            array_splice($values, $idx + 1, 0, ['termination_pending']);
        }

        $sql = "ALTER TABLE projects MODIFY COLUMN status ENUM("
            . implode(',', array_map(fn ($v) => "'" . addslashes($v) . "'", $values))
            . ") NOT NULL DEFAULT 'open'";

        DB::statement($sql);
    }

    public function down(): void
    {
        if (! Schema::hasTable('projects') || ! Schema::hasColumn('projects', 'status')) {
            return;
        }

        $current = (string) DB::selectOne(
            "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'status'"
        )->t;

        if (! preg_match("/^enum\((.*)\)$/i", $current, $m) || ! str_contains($current, "'termination_pending'")) {
            return;
        }

        $values = array_map(
            fn ($v) => trim(trim($v), "'"),
            str_getcsv($m[1], ',', "'", '"')
        );

        // Refuse to roll back while live rows depend on the value.
        if (DB::table('projects')->where('status', 'termination_pending')->exists()) {
            return;
        }

        $values = array_values(array_filter($values, fn ($v) => $v !== 'termination_pending'));

        DB::statement(
            "ALTER TABLE projects MODIFY COLUMN status ENUM("
            . implode(',', array_map(fn ($v) => "'" . addslashes($v) . "'", $values))
            . ") NOT NULL DEFAULT 'open'"
        );
    }
};
