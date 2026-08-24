<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * ADDITIVE ONLY: adds missing indexes identified by the performance audit.
     * Creates no tables, alters no columns, deletes no data.
     */
    public function up(): void
    {
        // Chat inbox: where(user_one)->orWhere(user_two) full-scans without this.
        Schema::table('conversations', function (Blueprint $table) {
            if (!$this->indexExists('conversations', 'conversations_user_two_id_index')) {
                $table->index('user_two_id');
            }
        });

        // Polled unread-summary heartbeat + markAllAsRead.
        Schema::table('notifications', function (Blueprint $table) {
            if (!$this->indexExists('notifications', 'notifications_user_id_read_at_index')) {
                $table->index(['user_id', 'read_at']);
            }
        });

        // Courier job radar + my-jobs + dashboard stats.
        Schema::table('delivery_jobs', function (Blueprint $table) {
            if (!$this->indexExists('delivery_jobs', 'delivery_jobs_status_created_at_index')) {
                $table->index(['status', 'created_at']);
            }
            if (!$this->indexExists('delivery_jobs', 'delivery_jobs_logistics_id_status_index')) {
                $table->index(['logistics_id', 'status']);
            }
        });

        // Supplier/buyer order & quote lists ordered by recency.
        Schema::table('material_orders', function (Blueprint $table) {
            if (!$this->indexExists('material_orders', 'material_orders_supplier_id_status_index')) {
                $table->index(['supplier_id', 'status']);
            }
            if (!$this->indexExists('material_orders', 'material_orders_user_id_created_at_index')) {
                $table->index(['user_id', 'created_at']);
            }
        });
        Schema::table('material_quotes', function (Blueprint $table) {
            if (!$this->indexExists('material_quotes', 'material_quotes_supplier_id_status_index')) {
                $table->index(['supplier_id', 'status']);
            }
        });

        // Public house explorer: is_suspended filter + recency sort.
        Schema::table('house', function (Blueprint $table) {
            if (!$this->indexExists('house', 'house_is_suspended_created_at_index')) {
                $table->index(['is_suspended', 'created_at']);
            }
        });

        // Role dashboards: "My Projects" lookups on selector columns were full scans.
        Schema::table('projects', function (Blueprint $table) {
            foreach (['selected_arsitek_id', 'selected_kontraktor_id', 'selected_notaris_id', 'selected_interior_id', 'pm_id', 'structural_id', 'mep_id'] as $col) {
                $name = "projects_{$col}_index";
                if (!$this->indexExists('projects', $name)) {
                    $table->index($col, $name);
                }
            }
            if (!$this->indexExists('projects', 'projects_status_created_at_index')) {
                $table->index(['status', 'created_at']);
            }
        });
    }

    public function down(): void
    {
        // Intentionally minimal: dropping indexes is never required; kept for symmetry.
    }

    private function indexExists(string $table, string $indexName): bool
    {
        return collect(Schema::getIndexes($table))->pluck('name')->contains($indexName);
    }
};
