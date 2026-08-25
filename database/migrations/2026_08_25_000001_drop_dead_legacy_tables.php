<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Drop legacy tables whose models were removed in the Round-2 cleanup
     * (RiwayatProject, PengajuanSpesialisasi) — zero code references remain.
     */
    public function up(): void
    {
        Schema::dropIfExists('pengajuan_spesialisasi');
        Schema::dropIfExists('riwayat_projects');
    }

    public function down(): void
    {
        // No-op: these tables were dead code with no data contract.
        // Recreate via the restore_legacy_tables migration if ever needed.
    }
};
