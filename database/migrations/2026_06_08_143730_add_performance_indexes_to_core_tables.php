<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Helper to check if index exists in MySQL
        $indexExists = function (string $table, string $indexName): bool {
            $results = DB::select("SHOW INDEX FROM `{$table}` WHERE Key_name = ?", [$indexName]);
            return count($results) > 0;
        };

        // 1. Projects table indexes
        if (!$indexExists('projects', 'projects_user_id_status_index')) {
            Schema::table('projects', function (Blueprint $table) {
                $table->index(['user_id', 'status'], 'projects_user_id_status_index');
            });
        }

        // 2. Bids Arsitek
        if (!$indexExists('bids_arsitek', 'bids_arsitek_project_id_status_index')) {
            Schema::table('bids_arsitek', function (Blueprint $table) {
                $table->index(['project_id', 'status'], 'bids_arsitek_project_id_status_index');
            });
        }
        if (!$indexExists('bids_arsitek', 'bids_arsitek_arsitek_id_index')) {
            Schema::table('bids_arsitek', function (Blueprint $table) {
                $table->index('arsitek_id', 'bids_arsitek_arsitek_id_index');
            });
        }

        // 3. Bids Kontraktor
        if (!$indexExists('bids_kontraktor', 'bids_kontraktor_project_id_status_index')) {
            Schema::table('bids_kontraktor', function (Blueprint $table) {
                $table->index(['project_id', 'status'], 'bids_kontraktor_project_id_status_index');
            });
        }
        if (!$indexExists('bids_kontraktor', 'bids_kontraktor_kontraktor_id_index')) {
            Schema::table('bids_kontraktor', function (Blueprint $table) {
                $table->index('kontraktor_id', 'bids_kontraktor_kontraktor_id_index');
            });
        }

        // 4. Bids Notaris
        if (!$indexExists('bids_notaris', 'bids_notaris_project_id_status_index')) {
            Schema::table('bids_notaris', function (Blueprint $table) {
                $table->index(['project_id', 'status'], 'bids_notaris_project_id_status_index');
            });
        }
        if (!$indexExists('bids_notaris', 'bids_notaris_notaris_id_index')) {
            Schema::table('bids_notaris', function (Blueprint $table) {
                $table->index('notaris_id', 'bids_notaris_notaris_id_index');
            });
        }

        // 5. Bids Interior
        if (!$indexExists('bids_interior', 'bids_interior_project_id_status_index')) {
            Schema::table('bids_interior', function (Blueprint $table) {
                $table->index(['project_id', 'status'], 'bids_interior_project_id_status_index');
            });
        }
        if (!$indexExists('bids_interior', 'bids_interior_interior_id_index')) {
            Schema::table('bids_interior', function (Blueprint $table) {
                $table->index('interior_id', 'bids_interior_interior_id_index');
            });
        }

        // 6. Bids Project Manager
        if (!$indexExists('bids_project_manager', 'bids_pm_project_id_status_index')) {
            Schema::table('bids_project_manager', function (Blueprint $table) {
                $table->index(['project_id', 'status'], 'bids_pm_project_id_status_index');
            });
        }
        if (!$indexExists('bids_project_manager', 'bids_pm_pm_id_index')) {
            Schema::table('bids_project_manager', function (Blueprint $table) {
                $table->index('pm_id', 'bids_pm_pm_id_index');
            });
        }

        // 7. Bids Structural
        if (!$indexExists('bids_structural', 'bids_structural_project_id_status_index')) {
            Schema::table('bids_structural', function (Blueprint $table) {
                $table->index(['project_id', 'status'], 'bids_structural_project_id_status_index');
            });
        }
        if (!$indexExists('bids_structural', 'bids_structural_structural_id_index')) {
            Schema::table('bids_structural', function (Blueprint $table) {
                $table->index('structural_id', 'bids_structural_structural_id_index');
            });
        }

        // 8. Bids MEP
        if (!$indexExists('bids_mep', 'bids_mep_project_id_status_index')) {
            Schema::table('bids_mep', function (Blueprint $table) {
                $table->index(['project_id', 'status'], 'bids_mep_project_id_status_index');
            });
        }
        if (!$indexExists('bids_mep', 'bids_mep_mep_id_index')) {
            Schema::table('bids_mep', function (Blueprint $table) {
                $table->index('mep_id', 'bids_mep_mep_id_index');
            });
        }

        // 9. Chat Messages
        if (!$indexExists('chat_messages', 'chat_msgs_conv_id_sender_id_is_read_index')) {
            Schema::table('chat_messages', function (Blueprint $table) {
                $table->index(['conversation_id', 'sender_id', 'is_read'], 'chat_msgs_conv_id_sender_id_is_read_index');
            });
        }

        // 10. Rooms
        if (!$indexExists('rooms', 'rooms_id_house_index')) {
            Schema::table('rooms', function (Blueprint $table) {
                $table->index('id_house', 'rooms_id_house_index');
            });
        }

        // 11. House Pic
        if (!$indexExists('house_pic', 'house_pic_id_house_index')) {
            Schema::table('house_pic', function (Blueprint $table) {
                $table->index('id_house', 'house_pic_id_house_index');
            });
        }

        // 12. Rooms Pic
        if (!$indexExists('rooms_pic', 'rooms_pic_id_room_index')) {
            Schema::table('rooms_pic', function (Blueprint $table) {
                $table->index('id_room', 'rooms_pic_id_room_index');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Helper to check if index exists in MySQL
        $indexExists = function (string $table, string $indexName): bool {
            $results = DB::select("SHOW INDEX FROM `{$table}` WHERE Key_name = ?", [$indexName]);
            return count($results) > 0;
        };

        // 1. Projects table
        if ($indexExists('projects', 'projects_user_id_status_index')) {
            Schema::table('projects', function (Blueprint $table) {
                $table->dropIndex('projects_user_id_status_index');
            });
        }

        // 2. Bids Arsitek
        if ($indexExists('bids_arsitek', 'bids_arsitek_project_id_status_index')) {
            Schema::table('bids_arsitek', function (Blueprint $table) {
                $table->dropIndex('bids_arsitek_project_id_status_index');
            });
        }
        if ($indexExists('bids_arsitek', 'bids_arsitek_arsitek_id_index')) {
            Schema::table('bids_arsitek', function (Blueprint $table) {
                $table->dropIndex('bids_arsitek_arsitek_id_index');
            });
        }

        // 3. Bids Kontraktor
        if ($indexExists('bids_kontraktor', 'bids_kontraktor_project_id_status_index')) {
            Schema::table('bids_kontraktor', function (Blueprint $table) {
                $table->dropIndex('bids_kontraktor_project_id_status_index');
            });
        }
        if ($indexExists('bids_kontraktor', 'bids_kontraktor_kontraktor_id_index')) {
            Schema::table('bids_kontraktor', function (Blueprint $table) {
                $table->dropIndex('bids_kontraktor_kontraktor_id_index');
            });
        }

        // 4. Bids Notaris
        if ($indexExists('bids_notaris', 'bids_notaris_project_id_status_index')) {
            Schema::table('bids_notaris', function (Blueprint $table) {
                $table->dropIndex('bids_notaris_project_id_status_index');
            });
        }
        if ($indexExists('bids_notaris', 'bids_notaris_notaris_id_index')) {
            Schema::table('bids_notaris', function (Blueprint $table) {
                $table->dropIndex('bids_notaris_notaris_id_index');
            });
        }

        // 5. Bids Interior
        if ($indexExists('bids_interior', 'bids_interior_project_id_status_index')) {
            Schema::table('bids_interior', function (Blueprint $table) {
                $table->dropIndex('bids_interior_project_id_status_index');
            });
        }
        if ($indexExists('bids_interior', 'bids_interior_interior_id_index')) {
            Schema::table('bids_interior', function (Blueprint $table) {
                $table->dropIndex('bids_interior_interior_id_index');
            });
        }

        // 6. Bids PM
        if ($indexExists('bids_project_manager', 'bids_pm_project_id_status_index')) {
            Schema::table('bids_project_manager', function (Blueprint $table) {
                $table->dropIndex('bids_pm_project_id_status_index');
            });
        }
        if ($indexExists('bids_project_manager', 'bids_pm_pm_id_index')) {
            Schema::table('bids_project_manager', function (Blueprint $table) {
                $table->dropIndex('bids_pm_pm_id_index');
            });
        }

        // 7. Bids Structural
        if ($indexExists('bids_structural', 'bids_structural_project_id_status_index')) {
            Schema::table('bids_structural', function (Blueprint $table) {
                $table->dropIndex('bids_structural_project_id_status_index');
            });
        }
        if ($indexExists('bids_structural', 'bids_structural_structural_id_index')) {
            Schema::table('bids_structural', function (Blueprint $table) {
                $table->dropIndex('bids_structural_structural_id_index');
            });
        }

        // 8. Bids MEP
        if ($indexExists('bids_mep', 'bids_mep_project_id_status_index')) {
            Schema::table('bids_mep', function (Blueprint $table) {
                $table->dropIndex('bids_mep_project_id_status_index');
            });
        }
        if ($indexExists('bids_mep', 'bids_mep_mep_id_index')) {
            Schema::table('bids_mep', function (Blueprint $table) {
                $table->dropIndex('bids_mep_mep_id_index');
            });
        }

        // 9. Chat Messages
        if ($indexExists('chat_messages', 'chat_msgs_conv_id_sender_id_is_read_index')) {
            Schema::table('chat_messages', function (Blueprint $table) {
                $table->dropIndex('chat_msgs_conv_id_sender_id_is_read_index');
            });
        }

        // 10. Rooms
        if ($indexExists('rooms', 'rooms_id_house_index')) {
            Schema::table('rooms', function (Blueprint $table) {
                $table->dropIndex('rooms_id_house_index');
            });
        }

        // 11. House Pic
        if ($indexExists('house_pic', 'house_pic_id_house_index')) {
            Schema::table('house_pic', function (Blueprint $table) {
                $table->dropIndex('house_pic_id_house_index');
            });
        }

        // 12. Rooms Pic
        if ($indexExists('rooms_pic', 'rooms_pic_id_room_index')) {
            Schema::table('rooms_pic', function (Blueprint $table) {
                $table->dropIndex('rooms_pic_id_room_index');
            });
        }
    }
};
