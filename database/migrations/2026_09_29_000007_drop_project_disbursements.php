<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Retire `project_disbursements` in favour of `project_payment_termins`.
 *
 * The data was copied, not discarded: `2026_09_29_000006` moves every row into
 * a payment stage first, and that migration runs BEFORE this one.
 *
 * See 000006 for the full account of the three defects the duplicate
 * representation had accumulated (a Reject click that wrote `verified`; a
 * "verified" disbursement that moved no money; a create that always 422'd).
 * The short version: the read side had already moved to termin, the write side
 * had not, and nothing tested the gap.
 *
 * `down()` recreates the table from the ORIGINAL definition in
 * `2026_08_24_000001` so the schema round-trip in `scripts/verify-schema.cmd`
 * works. The table comes back EMPTY — the rows went to termin, which is the
 * point of the migration. Rolling this back on production therefore leaves you
 * with an empty legacy table and a full set of termin rows, so the correct
 * forward fix is to re-run `migrate` rather than to roll back.
 *
 * The `amount` column is `decimal(16,2)` here, not the `decimal(24,2)` that
 * `2026_09_29_000002` normalised it to, because that normalisation is
 * irreversible by design — a migration must not silently reconstruct a schema
 * an earlier migration produced. The recreated table is recreated as the
 * table is re-created, and the next run of 000002's intent is already
 * satisfied for the termin rows that now hold this money.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('project_disbursements');
    }

    public function down(): void
    {
        if (Schema::hasTable('project_disbursements')) {
            return;
        }

        Schema::create('project_disbursements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->foreignId('requested_by')->constrained('users')->onDelete('cascade');
            $table->string('title')->nullable();
            $table->text('purpose');
            $table->decimal('amount', 16, 2);
            $table->enum('status', ['pending', 'verified', 'rejected'])->default('pending');
            $table->foreignId('verified_by')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamp('verified_at')->nullable();
            $table->text('verification_notes')->nullable();
            $table->timestamps();

            $table->index(['project_id', 'status']);
        });
    }
};
