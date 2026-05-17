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

    public function up(): void
    {
        foreach ($this->tables as $table) {
            Schema::table($table, function (Blueprint $t) use ($table) {
                if (!Schema::hasColumn($table, 'entity_type')) {
                    $t->enum('entity_type', ['individual', 'company'])->default('individual')->after('foto');
                }
                if (!Schema::hasColumn($table, 'company_name')) {
                    $t->string('company_name', 255)->nullable()->after('entity_type');
                }
                if (!Schema::hasColumn($table, 'company_license')) {
                    $t->string('company_license', 255)->nullable()->after('company_name');
                }
            });
        }
    }

    public function down(): void
    {
        foreach ($this->tables as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropColumn(['entity_type', 'company_name', 'company_license']);
            });
        }
    }
};
