<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Restores the 26 columns that live in the Eloquent models but not in the
 * database.
 *
 * WHY THIS MIGRATION EXISTS
 * -------------------------
 * Sixteen migrations recorded in the `migrations` table were, and still are,
 * empty stubs carrying a docblock that read:
 *
 *     "NO-OP: Columns/tables consolidated into base migrations."
 *
 * The consolidation was never performed. Because the stubs are recorded as
 * applied, Laravel never re-runs them, so the divergence was permanent and
 * silent. The result was 26 columns referenced by live models that did not
 * exist in the schema — concentrated in the entire logistics/supply vertical:
 *
 *     MaterialOrder         9   MaterialQuote          6
 *     MaterialOrderReview   5   Supplier               3
 *     DeliveryJob           2   MaterialOrderItem      1
 *
 * Impact: `Model::shouldBeStrict(! isProduction())` in AppServiceProvider turns
 * every read of one of these into a `MissingAttributeException` (a 500) in
 * development and a silent `null` in production, so the whole
 * supplier-quote -> delivery-job -> order-review flow was non-functional
 * against a schema that matched its own migration ledger.
 *
 * WHY A SINGLE MIGRATION RATHER THAN REVIVING THE STUBS
 * -----------------------------------------------------
 * Editing a recorded stub would not help: Laravel only consults files on disk
 * for PENDING migrations, so a stub that already ran will never run again. The
 * only correct repair is one new, forward-only migration — and the stubs
 * themselves have been deleted, so the ledger no longer contains an entry whose
 * filename promises work it never did.
 *
 * The 21 stubs whose columns DO exist (project_milestones, kontraktors,
 * chat_messages, project_comments, the rating tables, bids_notaris,
 * project_requirements, projects, pm_bids) were harmless duplicates of work a
 * real migration performed; they were removed for the same reason.
 *
 * Every statement is guarded by `hasColumn` so this is safe to run against a
 * database that has already been manually repaired, and safe to re-run inside
 * a `migrate:fresh`.
 *
 * `php artisan schema:verify` is the standing gate that keeps this from
 * recurring: it fails the build if any model attribute is missing from a
 * from-scratch migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ------------------------------------------------------------------
        // material_orders — courier hand-off, geocoding and stock accounting.
        // ------------------------------------------------------------------
        if (Schema::hasTable('material_orders')) {
            Schema::table('material_orders', function (Blueprint $table) {
                // 'courier' | 'pickup' | 'self'. The legacy
                // `add_delivery_method_to_material_orders` stub and the
                // `sync_logistics_schema` stub both claimed this column.
                $this->addStringOnce($table, 'material_orders', 'delivery_method', 50);

                // When the buyer marked the order ready for the courier to
                // collect. Cast to `datetime` on the model.
                $this->addTimestampOnce($table, 'material_orders', 'ready_for_pickup_at');

                // decimal(10,7) matches `projects.latitude` / `projects.longitude`.
                $this->addDecimalOnce($table, 'material_orders', 'latitude', 10, 7);
                $this->addDecimalOnce($table, 'material_orders', 'longitude', 10, 7);

                $this->addTextOnce($table, 'material_orders', 'delivery_address');
                $this->addTextOnce($table, 'material_orders', 'address_detail');

                // Photo evidence of the hand-off, on the private `railway` disk.
                $this->addStringOnce($table, 'material_orders', 'delivery_documentation_path', 255);

                // Stock is decremented exactly once. OrderService claims the
                // flag atomically, so a duplicated decrement is impossible even
                // under a concurrent accept.
                $this->addBooleanOnce($table, 'material_orders', 'is_stock_decremented');

                $this->addDecimalOnce($table, 'material_orders', 'total_weight', 10, 2);
            });
        }

        // ------------------------------------------------------------------
        // material_quotes — the pre-order leg of the same logistics flow.
        // ------------------------------------------------------------------
        if (Schema::hasTable('material_quotes')) {
            Schema::table('material_quotes', function (Blueprint $table) {
                // NOTE: `material_orders.shipping_cost` already exists as
                // decimal(15,2) NOT NULL DEFAULT 0.00; this mirrors it.
                $this->addDecimalOnce($table, 'material_quotes', 'shipping_cost', 15, 2, '0.00');
                $this->addStringOnce($table, 'material_quotes', 'delivery_method', 50);
                $this->addDecimalOnce($table, 'material_quotes', 'latitude', 10, 7);
                $this->addDecimalOnce($table, 'material_quotes', 'longitude', 10, 7);
                $this->addTextOnce($table, 'material_quotes', 'address_detail');
                $this->addDecimalOnce($table, 'material_quotes', 'total_weight', 10, 2);
            });
        }

        // ------------------------------------------------------------------
        // material_order_reviews — two reviews per order: the supplier rating
        // the material, and the buyer rating the courier.
        // ------------------------------------------------------------------
        if (Schema::hasTable('material_order_reviews')) {
            Schema::table('material_order_reviews', function (Blueprint $table) {
                $this->addIntOnce($table, 'material_order_reviews', 'delivery_rating');
                $this->addTextOnce($table, 'material_order_reviews', 'delivery_comment');
                $this->addForeignIdOnce($table, 'material_order_reviews', 'delivery_user_id', 'users');

                // Cast to `array` on the model. Replaces the single-image
                // `image_path` column that the split-review stubs claimed.
                $this->addJsonOnce($table, 'material_order_reviews', 'image_paths');
                $this->addJsonOnce($table, 'material_order_reviews', 'delivery_image_paths');
            });
        }

        // ------------------------------------------------------------------
        // suppliers — storefront address and coordinates for the map view.
        // ------------------------------------------------------------------
        if (Schema::hasTable('suppliers')) {
            Schema::table('suppliers', function (Blueprint $table) {
                // `address` already holds the street line; this is the
                // landmark/plus-code detail shown underneath it.
                $this->addTextOnce($table, 'suppliers', 'detail_location');
                $this->addDecimalOnce($table, 'suppliers', 'latitude', 10, 7);
                $this->addDecimalOnce($table, 'suppliers', 'longitude', 10, 7);
            });
        }

        // ------------------------------------------------------------------
        // delivery_jobs — pickup and drop-off proof photos. Both cast to
        // `array` on the model.
        // ------------------------------------------------------------------
        if (Schema::hasTable('delivery_jobs')) {
            Schema::table('delivery_jobs', function (Blueprint $table) {
                $this->addJsonOnce($table, 'delivery_jobs', 'pickup_photos');
                $this->addJsonOnce($table, 'delivery_jobs', 'delivery_photos');
            });
        }

        // ------------------------------------------------------------------
        // material_order_items — links a purchased line back to the project's
        // BOM requirement it fulfilled, which is what closes the
        // requirement -> order -> restock loop.
        // ------------------------------------------------------------------
        if (Schema::hasTable('material_order_items')) {
            Schema::table('material_order_items', function (Blueprint $table) {
                $this->addForeignIdOnce($table, 'material_order_items', 'requirement_id', 'project_requirements');
            });
        }
    }

    public function down(): void
    {
        // One-way on purpose. These columns are already read by live model code
        // and by the private `railway` disk paths already written into them;
        // dropping them would destroy hand-off evidence and break the models
        // again. The forward direction is the whole point of this migration.
    }

    // -----------------------------------------------------------------------
    // Guarded column helpers
    //
    // Laravel 11 dropped doctrine/dbal, so `->change()` on an existing column
    // is unreliable and `$table->boolean()`/`->json()` on a column that may
    // already exist throws. Each helper therefore asks the schema first.
    // -----------------------------------------------------------------------

    private function addStringOnce(Blueprint $table, string $tableName, string $column, int $length): void
    {
        if (! Schema::hasColumn($tableName, $column)) {
            $table->string($column, $length)->nullable();
        }
    }

    private function addTextOnce(Blueprint $table, string $tableName, string $column): void
    {
        if (! Schema::hasColumn($tableName, $column)) {
            $table->text($column)->nullable();
        }
    }

    private function addIntOnce(Blueprint $table, string $tableName, string $column): void
    {
        if (! Schema::hasColumn($tableName, $column)) {
            $table->integer($column)->nullable();
        }
    }

    private function addTimestampOnce(Blueprint $table, string $tableName, string $column): void
    {
        if (! Schema::hasColumn($tableName, $column)) {
            $table->timestamp($column)->nullable();
        }
    }

    private function addBooleanOnce(Blueprint $table, string $tableName, string $column): void
    {
        if (! Schema::hasColumn($tableName, $column)) {
            $table->boolean($column)->default(false);
        }
    }

    private function addJsonOnce(Blueprint $table, string $tableName, string $column): void
    {
        if (! Schema::hasColumn($tableName, $column)) {
            $table->json($column)->nullable();
        }
    }

    private function addDecimalOnce(Blueprint $table, string $tableName, string $column, int $total, int $places, ?string $default = null): void
    {
        if (Schema::hasColumn($tableName, $column)) {
            return;
        }

        $definition = $table->decimal($column, $total, $places);

        if ($default !== null) {
            $definition->default($default);
        } else {
            $definition->nullable();
        }
    }

    /**
     * Adds a nullable, indexed bigint reference. Deliberately NOT a foreign key
     * constraint: a column-level FK added to a populated table fails outright
     * if any existing row already points at a missing parent, and the columns
     * are brand new so every current value is NULL. Adding the real
     * constraints is tracked as a separate, deliberate integrity pass rather
     * than smuggled in here where it could not be rolled back safely.
     */
    private function addForeignIdOnce(Blueprint $table, string $tableName, string $column, string $referencedTable): void
    {
        if (Schema::hasColumn($tableName, $column)) {
            return;
        }

        $table->unsignedBigInteger($column)->nullable()->index();
    }
};
