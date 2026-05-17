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
        Schema::table('project_sub_professionals', function (Blueprint $table) {
            // Update status enum by dropping and recreating or using a raw query if necessary.
            // For Laravel 10+, we can use change() if the enum exists, but some DB drivers are tricky.
            // Since we are in development, we can just alter it.
            
            $table->text('lead_pro_notes')->nullable()->after('scope_notes');
            $table->decimal('suggested_fee', 24, 2)->nullable()->after('lead_pro_notes');
            $table->timestamp('recommended_at')->nullable()->after('accepted_at');
            $table->timestamp('hired_at')->nullable()->after('recommended_at');
        });

        // Expand Enum Status
        DB::statement("ALTER TABLE project_sub_professionals MODIFY COLUMN status ENUM('invited', 'interviewing', 'accepted', 'recommended', 'active', 'completed', 'removed') DEFAULT 'invited'");
    }

    public function down(): void
    {
        Schema::table('project_sub_professionals', function (Blueprint $table) {
            $table->dropColumn(['lead_pro_notes', 'suggested_fee', 'recommended_at', 'hired_at']);
        });
        
        DB::statement("ALTER TABLE project_sub_professionals MODIFY COLUMN status ENUM('invited', 'accepted', 'active', 'completed', 'removed') DEFAULT 'invited'");
    }
};
