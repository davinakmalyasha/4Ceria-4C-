<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Record WHO moved money on every ledger row.
 *
 * WHY
 * ---
 * `project_budget_transactions` had no actor column. Four write sites create
 * rows — `ProjectFinancialService::deductBudget`, `DisputeService`,
 * `ProjectController` and `ProjectPhaseService` — and none passed an actor.
 *
 * The consequence is worst on the most sensitive movement in the system. A
 * `refund` row, written by dispute arbitration, could not answer "which admin
 * issued this refund?". The only nearby record is prose in
 * `project_activity_logs`, and even that exists on only SOME paths
 * (`payment_released`, `payment_stages_settled`, `payment_triggered`). The
 * `verifyProof`, material order, material quote and vendor-import paths wrote
 * nothing at all about who acted.
 *
 * So the append-only audit trail could not be attributed. For arbitration —
 * whose job is establishing who did what — that is a structural gap, and it is
 * not recoverable after the fact.
 *
 * NULLABLE ON PURPOSE
 * -------------------
 * Not every row has a human behind it. A settlement run by a scheduled command,
 * a reconciliation repair, or a system-generated opening balance has no actor,
 * and forcing one would mean inventing a user id. NULL means "no human actor",
 * which is itself information; a fabricated id would not be.
 *
 * `actor_role` is denormalised alongside the id because the answer to "was this
 * an admin acting within their authority, or the owner self-releasing their own
 * payment?" depends on the ROLE AT THE TIME, and a user's role_type can change
 * later. Reading the current role from the users table would answer a different
 * question than the one being asked.
 *
 * ADDITIVE ONLY
 * -------------
 * Two nullable columns, nothing narrowed, so this is in-place and cannot
 * invalidate a row or abort the `migrate --force` that runs on every replica
 * start.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('project_budget_transactions')) {
            return;
        }

        Schema::table('project_budget_transactions', function (Blueprint $table) {
            if (! Schema::hasColumn('project_budget_transactions', 'actor_user_id')) {
                // NOT a foreign key, deliberately. This column is an immutable
                // historical record: if a user is later deleted, the fact that
                // they moved the money must survive. A FK with
                // onDelete('set null') would erase it, and a plain FK would
                // block the delete. Same reasoning as `project_activity_logs`.
                $table->unsignedBigInteger('actor_user_id')
                    ->nullable()
                    ->after('transaction_date')
                    ->comment('User who caused this movement. NULL = no human actor (system/scheduled/reconciliation).');
            }

            if (! Schema::hasColumn('project_budget_transactions', 'actor_role')) {
                // The role AT THE TIME of the movement, denormalised: role_type
                // can change later, and "was this within their authority" is a
                // question about the past.
                $table->string('actor_role', 64)
                    ->nullable()
                    ->after('actor_user_id');
            }
        });

        // Index for "what did this user do", which is the first question asked of
        // an audit trail. Composite because it is always scoped to a project.
        if (! Schema::hasIndex('project_budget_transactions', ['project_id', 'actor_user_id'])) {
            Schema::table('project_budget_transactions', function (Blueprint $table) {
                $table->index(['project_id', 'actor_user_id'], 'budget_tx_project_actor_index');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('project_budget_transactions')) {
            return;
        }

        // Dropping the index FIRST. It leads with project_id, which is the
        // backing store of the project FK on this table, so dropping it in the
        // other order risks MySQL 1553 — the trap AGENTS.md documents.
        if (Schema::hasIndex('project_budget_transactions', ['project_id', 'actor_user_id'])) {
            Schema::table('project_budget_transactions', function (Blueprint $table) {
                $table->dropIndex('budget_tx_project_actor_index');
            });
        }

        $present = array_values(array_filter(
            ['actor_user_id', 'actor_role'],
            fn (string $column) => Schema::hasColumn('project_budget_transactions', $column)
        ));

        if ($present !== []) {
            Schema::table('project_budget_transactions', function (Blueprint $table) use ($present) {
                $table->dropColumn($present);
            });
        }
    }
};