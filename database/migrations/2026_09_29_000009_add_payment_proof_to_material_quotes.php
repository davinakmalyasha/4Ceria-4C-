<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Give `material_quotes` the payment-proof columns it is already gated on.
 *
 * WHY
 * ---
 * `MaterialQuoteController::markAsPaid` begins:
 *
 *     if (empty($quote->payment_proof_path)) {
 *         return response()->json(['message' => 'A payment proof is required ...'], 422);
 *     }
 *
 * `material_quotes` has NO `payment_proof_path` column. Nor did it have any way
 * to record who confirmed the payment or when. So:
 *
 *   * the guard read an undefined attribute — a null, or under
 *     `Model::shouldBeStrict(!isProduction())` an outright exception — and the
 *     endpoint could never succeed. A material QUOTE could therefore never be
 *     marked paid at all.
 *
 * The 2026-09-23 pass closed the honor-system hole on the sibling ORDER flow
 * (`MaterialOrderController::uploadPaymentProof` + `verifyPayment`, which
 * requires a buyer-uploaded proof and posts to the escrow ledger). The QUOTE
 * flow got the guard but not the columns that satisfy it, so the fix converted
 * a hole into a dead endpoint. Two paths, one treatment — again.
 *
 * ADDITIVE ONLY
 * -------------
 * Every column is nullable and none narrows an existing column, so this is
 * in-place and cannot invalidate a row or abort the `migrate --force` that
 * runs on every replica start.
 *
 * `status` is deliberately NOT an ENUM here. It is a plain varchar and the
 * lifecycle has more states than the ORDER flow (pending, awaiting_payment,
 * paid, awaiting_courier, shipping, delivered, completed), several written by
 * Logistics code paths that predate this column set. Introducing an ENUM would
 * mean any one of those writers could abort a migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('material_quotes')) {
            return;
        }

        Schema::table('material_quotes', function (Blueprint $table) {
            if (! Schema::hasColumn('material_quotes', 'payment_proof_path')) {
                $table->string('payment_proof_path')->nullable()->after('total_weight')
                    ->comment('Buyer-uploaded transfer receipt. Stored on the PRIVATE vault disk.');
            }

            if (! Schema::hasColumn('material_quotes', 'paid_at')) {
                $table->timestamp('paid_at')->nullable()->after('payment_proof_path');
            }

            if (! Schema::hasColumn('material_quotes', 'payment_verified_by')) {
                // The SUPPLIER USER id who confirmed the proof — not the
                // supplier profile id. Consumers must know WHO confirmed.
                $table->unsignedBigInteger('payment_verified_by')->nullable()
                    ->after('paid_at');
            }

            if (! Schema::hasColumn('material_quotes', 'payment_verified_at')) {
                $table->timestamp('payment_verified_at')->nullable()
                    ->after('payment_verified_by');
            }

            if (! Schema::hasColumn('material_quotes', 'payment_notes')) {
                $table->text('payment_notes')->nullable()->after('payment_verified_at');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('material_quotes')) {
            return;
        }

        $added = array_values(array_filter(
            ['payment_proof_path', 'paid_at', 'payment_verified_by', 'payment_verified_at', 'payment_notes'],
            fn (string $column) => Schema::hasColumn('material_quotes', $column)
        ));

        if ($added === []) {
            return;
        }

        Schema::table('material_quotes', function (Blueprint $table) use ($added) {
            $table->dropColumn($added);
        });
    }
};