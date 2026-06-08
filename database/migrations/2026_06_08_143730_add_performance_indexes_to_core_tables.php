<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Projects table indexes
        Schema::table('projects', function (Blueprint $table) {
            // Check if column exists and add composite index
            $table->index(['user_id', 'status'], 'projects_user_id_status_index');
        });

        // 2. Bids Arsitek
        Schema::table('bids_arsitek', function (Blueprint $table) {
            $table->index(['project_id', 'status'], 'bids_arsitek_project_id_status_index');
            $table->index('arsitek_id', 'bids_arsitek_arsitek_id_index');
        });

        // 3. Bids Kontraktor
        Schema::table('bids_kontraktor', function (Blueprint $table) {
            $table->index(['project_id', 'status'], 'bids_kontraktor_project_id_status_index');
            $table->index('kontraktor_id', 'bids_kontraktor_kontraktor_id_index');
        });

        // 4. Bids Notaris
        Schema::table('bids_notaris', function (Blueprint $table) {
            $table->index(['project_id', 'status'], 'bids_notaris_project_id_status_index');
            $table->index('notaris_id', 'bids_notaris_notaris_id_index');
        });

        // 5. Bids Interior
        Schema::table('bids_interior', function (Blueprint $table) {
            $table->index(['project_id', 'status'], 'bids_interior_project_id_status_index');
            $table->index('interior_id', 'bids_interior_interior_id_index');
        });

        // 6. Bids Project Manager
        Schema::table('bids_project_manager', function (Blueprint $table) {
            $table->index(['project_id', 'status'], 'bids_pm_project_id_status_index');
            $table->index('pm_id', 'bids_pm_pm_id_index');
        });

        // 7. Bids Structural
        Schema::table('bids_structural', function (Blueprint $table) {
            $table->index(['project_id', 'status'], 'bids_structural_project_id_status_index');
            $table->index('structural_id', 'bids_structural_structural_id_index');
        });

        // 8. Bids MEP
        Schema::table('bids_mep', function (Blueprint $table) {
            $table->index(['project_id', 'status'], 'bids_mep_project_id_status_index');
            $table->index('mep_id', 'bids_mep_mep_id_index');
        });

        // 9. Chat Messages
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->index(['conversation_id', 'sender_id', 'is_read'], 'chat_msgs_conv_id_sender_id_is_read_index');
        });

        // 10. Rooms
        Schema::table('rooms', function (Blueprint $table) {
            $table->index('project_id', 'rooms_project_id_index');
        });

        // 11. House Pic
        Schema::table('house_pic', function (Blueprint $table) {
            $table->index('house_id', 'house_pic_house_id_index');
        });

        // 12. Rooms Pic
        Schema::table('rooms_pic', function (Blueprint $table) {
            $table->index('room_id', 'rooms_pic_room_id_index');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // 1. Projects table
        Schema::table('projects', function (Blueprint $table) {
            $table->dropIndex('projects_user_id_status_index');
        });

        // 2. Bids Arsitek
        Schema::table('bids_arsitek', function (Blueprint $table) {
            $table->dropIndex('bids_arsitek_project_id_status_index');
            $table->dropIndex('bids_arsitek_arsitek_id_index');
        });

        // 3. Bids Kontraktor
        Schema::table('bids_kontraktor', function (Blueprint $table) {
            $table->dropIndex('bids_kontraktor_project_id_status_index');
            $table->dropIndex('bids_kontraktor_kontraktor_id_index');
        });

        // 4. Bids Notaris
        Schema::table('bids_notaris', function (Blueprint $table) {
            $table->dropIndex('bids_notaris_project_id_status_index');
            $table->dropIndex('bids_notaris_notaris_id_index');
        });

        // 5. Bids Interior
        Schema::table('bids_interior', function (Blueprint $table) {
            $table->dropIndex('bids_interior_project_id_status_index');
            $table->dropIndex('bids_interior_interior_id_index');
        });

        // 6. Bids PM
        Schema::table('bids_project_manager', function (Blueprint $table) {
            $table->dropIndex('bids_pm_project_id_status_index');
            $table->dropIndex('bids_pm_pm_id_index');
        });

        // 7. Bids Structural
        Schema::table('bids_structural', function (Blueprint $table) {
            $table->dropIndex('bids_structural_project_id_status_index');
            $table->dropIndex('bids_structural_structural_id_index');
        });

        // 8. Bids MEP
        Schema::table('bids_mep', function (Blueprint $table) {
            $table->dropIndex('bids_mep_project_id_status_index');
            $table->dropIndex('bids_mep_mep_id_index');
        });

        // 9. Chat Messages
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropIndex('chat_msgs_conv_id_sender_id_is_read_index');
        });

        // 10. Rooms
        Schema::table('rooms', function (Blueprint $table) {
            $table->dropIndex('rooms_project_id_index');
        });

        // 11. House Pic
        Schema::table('house_pic', function (Blueprint $table) {
            $table->dropIndex('house_pic_house_id_index');
        });

        // 12. Rooms Pic
        Schema::table('rooms_pic', function (Blueprint $table) {
            $table->dropIndex('rooms_pic_room_id_index');
        });
    }
};
