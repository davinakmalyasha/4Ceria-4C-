<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ADDITIVE ONLY — composite indexes for the per-request hot paths.
 *
 * Every index below is purely additive: no column is added, dropped, retyped
 * or re-ordered, and no existing index is modified, so this migration cannot
 * change query results, lose data, or lock a table for a rewrite. It only
 * gives the optimizer covering/leftmost-prefix candidates for queries that
 * already filter on the leading column and sort or range-scan on the second:
 *
 *   - chat_messages / conversations : chat thread pagination ("latest page
 *     of this conversation") — every poll previously sorted the whole thread.
 *   - notifications                 : the unread badge query.
 *   - project_activity_logs         : per-project activity feed.
 *   - bids_*                        : "my bids, newest first" per professional
 *     role, and the payment-verification sweeps that scan payment_status.
 *   - project_budget_transactions   : budget summary grouped by type.
 *   - project_snag_items             : scanned by `snags:escalate-overdue`
 *     (due_at < now, escalated_at IS NULL) — previously a full table scan.
 *   - project_addendums              : recommended-bid lookup on accept.
 *
 * Names are explicit so the same prefix can never collide with Laravel's
 * auto-generated `<table>_<columns>_index`, and so down() can drop exactly
 * what up() added.
 *
 * Pre-verified ABSENT against the 4ceria schema before writing this file (all
 * 23 name/column pairs checked in information_schema.STATISTICS; the only
 * pre-existing single-column indexes on the bid professional FKs are
 * `<table>_<col>_index`, which remain — a composite does not replace them).
 * The guards below keep the migration idempotent and safe to re-run anyway.
 */
return new class extends Migration
{
    /**
     * table => list of [indexName, [columns...]]
     */
    private function hotPathIndexes(): array
    {
        return [
            // Chat: latest page of a conversation.
            'chat_messages' => [
                ['chat_messages_conv_created_idx', ['conversation_id', 'created_at']],
            ],

            // Chat: inbox listings for either participant.
            'conversations' => [
                ['conversations_user_two_last_message_idx', ['user_two_id', 'last_message_at']],
                ['conversations_user_one_last_message_idx', ['user_one_id', 'last_message_at']],
            ],

            // Notification badge.
            'notifications' => [
                ['notifications_user_created_idx', ['user_id', 'created_at']],
            ],

            // Per-project activity feed.
            'project_activity_logs' => [
                ['project_activity_logs_project_created_idx', ['project_id', 'created_at']],
            ],

            // "My bids, newest first" per professional role. NOTE: the FK
            // column is structural_id / mep_id on those two tables (not
            // structural_engineer_id / mep_engineer_id) — verified against
            // information_schema and app/Models.
            'bids_arsitek' => [
                ['bids_arsitek_arsitek_created_idx', ['arsitek_id', 'created_at']],
                ['bids_arsitek_payment_status_idx', ['payment_status']],
            ],
            'bids_kontraktor' => [
                ['bids_kontraktor_kontraktor_created_idx', ['kontraktor_id', 'created_at']],
                ['bids_kontraktor_payment_status_idx', ['payment_status']],
            ],
            'bids_notaris' => [
                ['bids_notaris_notaris_created_idx', ['notaris_id', 'created_at']],
                ['bids_notaris_payment_status_idx', ['payment_status']],
            ],
            'bids_interior' => [
                ['bids_interior_interior_created_idx', ['interior_id', 'created_at']],
                ['bids_interior_payment_status_idx', ['payment_status']],
            ],
            'bids_project_manager' => [
                ['bids_pm_pm_created_idx', ['pm_id', 'created_at']],
                ['bids_pm_payment_status_idx', ['payment_status']],
            ],
            'bids_structural' => [
                ['bids_structural_structural_created_idx', ['structural_id', 'created_at']],
                ['bids_structural_payment_status_idx', ['payment_status']],
            ],
            'bids_mep' => [
                ['bids_mep_mep_created_idx', ['mep_id', 'created_at']],
                ['bids_mep_payment_status_idx', ['payment_status']],
            ],

            // Budget summary grouped by transaction type.
            'project_budget_transactions' => [
                ['budget_tx_project_type_idx', ['project_id', 'transaction_type']],
            ],

            // Daily `snags:escalate-overdue` sweep.
            'project_snag_items' => [
                ['project_snag_items_due_at_idx', ['due_at']],
                ['project_snag_items_escalated_at_idx', ['escalated_at']],
            ],

            // Recommended-bid lookup when a project accepts an addendum.
            'project_addendums' => [
                ['project_addendums_recommended_bid_idx', ['recommended_bid_id']],
            ],
        ];
    }

    public function up(): void
    {
        foreach ($this->hotPathIndexes() as $table => $indexes) {
            if (!Schema::hasTable($table)) {
                continue;
            }

            foreach ($indexes as [$indexName, $columns]) {
                if ($this->indexExists($table, $indexName)) {
                    continue;
                }

                Schema::table($table, function (Blueprint $t) use ($columns, $indexName) {
                    $t->index($columns, $indexName);
                });
            }
        }
    }

    public function down(): void
    {
        foreach ($this->hotPathIndexes() as $table => $indexes) {
            if (!Schema::hasTable($table)) {
                continue;
            }

            foreach ($indexes as [$indexName, $columns]) {
                if (!$this->indexExists($table, $indexName)) {
                    continue;
                }

                Schema::table($table, function (Blueprint $t) use ($indexName) {
                    $t->dropIndex($indexName);
                });
            }
        }
    }

    private function indexExists(string $table, string $indexName): bool
    {
        return collect(Schema::getIndexes($table))->pluck('name')->contains($indexName);
    }
};
