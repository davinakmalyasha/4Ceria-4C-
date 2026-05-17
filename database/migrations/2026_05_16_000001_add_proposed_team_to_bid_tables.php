<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $bidTables = ['bids_arsitek', 'bids_kontraktor'];

        foreach ($bidTables as $table) {
            Schema::table($table, function (Blueprint $t) use ($table) {
                if (!Schema::hasColumn($table, 'proposed_team')) {
                    $t->json('proposed_team')->nullable()->after('proposed_milestones');
                }
            });
        }
    }

    public function down(): void
    {
        $bidTables = ['bids_arsitek', 'bids_kontraktor'];

        foreach ($bidTables as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropColumn('proposed_team');
            });
        }
    }
};
