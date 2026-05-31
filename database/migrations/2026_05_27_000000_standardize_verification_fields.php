<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private array $tables = [
        'arsiteks',
        'kontraktors',
        'structural_engineers',
        'mep_engineers',
        'interior_profiles',
        'notaris_profiles',
        'project_managers',
    ];

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        foreach ($this->tables as $table) {
            Schema::table($table, function (Blueprint $t) use ($table) {
                if (!Schema::hasColumn($table, 'identity_number')) {
                    $t->string('identity_number')->nullable()->after('foto');
                }
                if (!Schema::hasColumn($table, 'npwp_number')) {
                    $t->string('npwp_number')->nullable()->after('identity_number');
                }
                if (!Schema::hasColumn($table, 'siup_number')) {
                    $t->string('siup_number')->nullable()->after('npwp_number');
                }
                if (!Schema::hasColumn($table, 'file_portofolio')) {
                    $t->string('file_portofolio')->nullable()->after('foto');
                }
                if (!Schema::hasColumn($table, 'file_sertifikat')) {
                    $t->string('file_sertifikat')->nullable()->after('file_portofolio');
                }
                if (!Schema::hasColumn($table, 'npwp')) {
                    $t->string('npwp')->nullable()->after('file_sertifikat');
                }
                if (!Schema::hasColumn($table, 'siup')) {
                    $t->string('siup')->nullable()->after('npwp');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        foreach ($this->tables as $table) {
            Schema::table($table, function (Blueprint $t) use ($table) {
                $toDrop = [];
                if (Schema::hasColumn($table, 'identity_number')) {
                    $toDrop[] = 'identity_number';
                }
                if (Schema::hasColumn($table, 'npwp_number')) {
                    $toDrop[] = 'npwp_number';
                }
                if (Schema::hasColumn($table, 'siup_number')) {
                    $toDrop[] = 'siup_number';
                }
                
                if (count($toDrop) > 0) {
                    $t->dropColumn($toDrop);
                }
            });
        }
    }
};
