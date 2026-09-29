<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use ReflectionClass;
use ReflectionMethod;
use Throwable;

/**
 * Asserts that a from-scratch `migrate` actually produces the schema the
 * application code expects.
 *
 * WHY THIS EXISTS
 * ---------------
 * 37 of the 240 migrations in this repository were recorded as applied while
 * their `up()` was an empty stub, carrying a docblock that read
 * "NO-OP: columns/tables consolidated into base migrations". The consolidation
 * was never performed. Because the stubs are in the `migrations` table, Laravel
 * never re-runs them, so the divergence was permanent and invisible:
 *
 *   - 26 columns referenced by live models did not exist in the database,
 *     concentrated in the entire logistics/supply vertical (`material_orders`
 *     9, `material_quotes` 6, `material_order_reviews` 5, `suppliers` 3,
 *     `delivery_jobs` 2, `material_order_items` 1).
 *   - `Model::shouldBeStrict(! isProduction())` turns each of those reads into
 *     a 500 in development and a silent `null` in production.
 *   - Nothing detected it, because the test suite ran against an
 *     already-drifted database and no step ever compared a from-scratch
 *     migration against the models.
 *
 * Run against a THROWAWAY database this command reproduces that failure mode
 * and reports every missing column, so a migration that claims to add a
 * column but does not fails the build instead of the app.
 *
 * USAGE
 *   php artisan schema:verify                    # verify the current connection
 *   php artisan schema:verify --migrate-fresh    # drop all tables, migrate, verify
 */
class VerifySchemaCommand extends Command
{
    protected $signature = 'schema:verify
        {--migrate-fresh : Drop every table and re-run all migrations from scratch first}
        {--model=* : Limit the check to the given model class names}
        {--relations : Also verify that relation foreign keys resolve to real columns}';

    protected $description = 'Assert the migrated schema contains every column the Eloquent models declare';

    /**
     * Columns that live on a model but are not real database columns.
     *
     * Eloquent treats these as attributes without touching the database, so
     * their absence is correct rather than a drift finding.
     *
     * @var list<string>
     */
    private const PSEUDO_ATTRIBUTES = [
        // Deliberate alias kept for the SPA's benefit; there is no such column.
        'alias',
    ];

    /**
     * Relation method suffixes that return a HasOne*-style association whose
     * foreign key lives on the PARENT, not on this model.
     *
     * @var list<string>
     */
    private const RELATION_SUFFIXES_TO_SKIP = [
        // `$project->somethingCount` is a `withCount` pseudo-column.
        'count',
    ];

    public function handle(): int
    {
        if (! Schema::hasTable('migrations')) {
            $this->error('The `migrations` table does not exist. Run `php artisan migrate` first.');

            return self::FAILURE;
        }

        if ($this->option('migrate-fresh')) {
            if (! $this->confirmDestructiveFresh()) {
                $this->warn('Aborted.');

                return self::FAILURE;
            }

            $this->components->info('Dropping all tables and re-running migrations from scratch...');
            DB::statement('SET FOREIGN_KEY_CHECKS=0');
            $this->call('migrate:fresh', ['--force' => true, '--no-interaction' => true]);
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }

        $models = $this->discoverModels();

        if ($models === []) {
            $this->error('No Eloquent models found under app/Models.');

            return self::FAILURE;
        }

        $this->components->info(sprintf('Checking %d models against the migrated schema...', count($models)));

        $missing = [];
        $checkedColumns = 0;
        $skippedTables = [];

        foreach ($models as $class) {
            $short = class_basename($class);

            /** @var Model $model */
            $model = new $class;
            $table = $model->getTable();

            if (! Schema::hasTable($table)) {
                $skippedTables[] = $short;
                $missing[] = [$short, '*', "table `{$table}` does not exist"];
                continue;
            }

            $columns = $this->declaredColumns($model);

            if ($columns === []) {
                continue;
            }

            $present = Schema::getColumnListing($table);
            $present = array_flip($present);

            foreach ($columns as $attribute) {
                $checkedColumns++;

                if (in_array($attribute, self::PSEUDO_ATTRIBUTES, true)) {
                    continue;
                }

                if (! isset($present[$attribute])) {
                    $missing[] = [$short, $attribute, "missing on `{$table}`"];
                }
            }
        }

        $relationFindings = $this->option('relations')
            ? $this->verifyRelations($models)
            : [];

        $castFindings = $this->verifyDecimalCasts($models);

        $this->newLine();
        $this->components->twoColumnDetail('<info>Models checked</info>', (string) count($models));
        $this->components->twoColumnDetail('<info>Attributes checked</info>', (string) $checkedColumns);
        $this->components->twoColumnDetail('<info>Models with no table</info>', (string) count($skippedTables));

        $allFindings = array_merge($missing, $relationFindings, $castFindings);

        if ($allFindings === []) {
            $this->newLine();
            $this->components->info('Schema is consistent with the models.');

            return self::SUCCESS;
        }

        $this->newLine();
        $this->components->error(sprintf(
            '%d schema/model %s found.',
            count($allFindings),
            count($allFindings) === 1 ? 'discrepancy' : 'discrepancies'
        ));
        $this->newLine();

        foreach ($allFindings as [$short, $attribute, $problem]) {
            $this->line(sprintf('  <fg=red>%s</> . <fg=yellow>%s</>  %s', $short, $attribute, $problem));
        }

        $this->newLine();
        $this->components->warn(
            'A migration in database/migrations/ is recorded as applied but does not create what it claims. '
            .'Search for a stub whose up() is empty and whose docblock says "consolidated into base migrations".'
        );

        return self::FAILURE;
    }

    /**
     * Every database-backed attribute a model declares, from the two places a
     * column name is allowed to appear: `$fillable` (mass assignment) and
     * `$casts` (type coercion). A name in either list is code that will read
     * or write a real column.
     *
     * @return list<string>
     */
    private function declaredColumns(Model $model): array
    {
        $declared = array_merge(
            $model->getFillable(),
            array_keys($model->getCasts()),
        );

        $declared = array_filter($declared, static function ($attribute) {
            // Guard clauses (`password` is not a column) and the
            // Laravel-standard `created_at`/`updated_at` shape both still
            // count if declared, so only shape-based filtering happens here.
            return is_string($attribute) && $attribute !== '';
        });

        return array_values(array_unique($declared));
    }

    /**
     * Verify that a belongsTo/hasOne relation's foreign key resolves to a real
     * column. This is what catches `projects.pm_id` (a USER id) being
     * associated with `ProjectManager` (a PROFILE table) — the id convention
     * trap AGENTS.md documents as trap #2.
     *
     * @param  list<class-string<Model>>  $models
     * @return list<array{0: string, 1: string, 2: string}>
     */
    private function verifyRelations(array $models): array
    {
        $findings = [];

        foreach ($models as $class) {
            $short = class_basename($class);
            $reflection = new ReflectionClass($class);
            $table = (new $class)->getTable();

            foreach ($reflection->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
                if ($method->getNumberOfParameters() > 0 || $method->isStatic()) {
                    continue;
                }

                $name = $method->getName();

                if (str_starts_with($name, 'get') || str_starts_with($name, 'to')) {
                    continue;
                }

                foreach (self::RELATION_SUFFIXES_TO_SKIP as $suffix) {
                    if (Str::endsWith($name, $suffix)) {
                        continue 2;
                    }
                }

                try {
                    $relation = $class->{$name}();
                } catch (Throwable) {
                    // A relation that cannot even be constructed is a different
                    // class of bug; not this check's business.
                    continue;
                }

                if (! $relation instanceof Relation) {
                    continue;
                }

                // A belongsTo/hasOne reads `<parent>.<singular relation name>_id`.
                $foreignKey = $relation->getForeignKeyName();

                if (! Schema::hasTable($table)) {
                    continue;
                }

                if (! Schema::hasColumn($table, $foreignKey)) {
                    $findings[] = [$short, "{$name}()", "foreign key `{$table}.{$foreignKey}` does not exist"];
                }
            }
        }

        return $findings;
    }

    /**
     * Every `decimal` column a model touches must be cast, and the right cast
     * depends on the column's scale.
     *
     * An uncast `decimal` comes back from the driver as a PHP string, so every
     * read is a string and every comparison is a string comparison. 44 money
     * columns were in that state until
     * `2026_09_29_000002_normalise_money_columns` normalised their types and
     * this check became the gate that keeps them cast.
     *
     * Scale decides the correct cast, and conflating the two would be worse than
     * not checking at all:
     *
     *   scale 2  -> money. `decimal:2`, so the value is a fixed-point STRING
     *                and arithmetic goes through App\Support\Money.
     *   scale >2 -> NOT money. A coordinate (`decimal(10,7)`) or a ratio.
     *                `float` is correct here; `decimal:2` would silently
     *                destroy four digits of a latitude.
     *
     * @param  list<class-string<Model>>  $models
     * @return list<array{0: string, 1: string, 2: string}>
     */
    private function verifyDecimalCasts(array $models): array
    {
        $findings = [];

        foreach ($models as $class) {
            $short = class_basename($class);
            $table = (new $class)->getTable();

            if (! Schema::hasTable($table)) {
                continue;
            }

            $casts = (new $class)->getCasts();

            foreach ($this->decimalColumns($table) as $column => $scale) {
                if (isset($casts[$column])) {
                    continue;
                }

                $findings[] = $scale === 2
                    ? [$short, $column, "money column on `{$table}` has no cast — add `'decimal:2'` and read it through App\\Support\\Money"]
                    : [$short, $column, "scale-{$scale} decimal on `{$table}` has no cast — a coordinate or ratio, so add `'float'`; `decimal:2` would lose {$scale} digits of precision"];
            }
        }

        return $findings;
    }

    /**
     * Every `decimal` column on a table, mapped to its scale.
     *
     * @return array<string, int>
     */
    private function decimalColumns(string $table): array
    {
        $database = DB::getDatabaseName();

        $rows = DB::select(
            'SELECT COLUMN_NAME AS name, NUMERIC_SCALE AS scale
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND DATA_TYPE = \'decimal\'
             ORDER BY ORDINAL_POSITION',
            [$database, $table]
        );

        $columns = [];

        foreach ($rows as $row) {
            $columns[(string) $row->name] = (int) $row->scale;
        }

        return $columns;
    }

    /**
     * @return list<class-string<Model>>
     */
    private function discoverModels(): array
    {
        $path = app_path('Models');

        if (! is_dir($path)) {
            return [];
        }

        $classes = [];

        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($path)) as $file) {
            if (! $file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }

            $relative = Str::after($file->getPathname(), app_path() . DIRECTORY_SEPARATOR);
            $class = 'App\\' . str_replace(['/', '\\', '.php'], ['\\', '\\', ''], $relative);

            if (! class_exists($class) || ! is_subclass_of($class, Model::class)) {
                continue;
            }

            $requested = $this->option('model');

            if ($requested !== [] && ! in_array($class, $requested, true) && ! in_array(class_basename($class), $requested, true)) {
                continue;
            }

            $classes[] = $class;
        }

        sort($classes);

        return $classes;
    }

    private function confirmDestructiveFresh(): bool
    {
        $database = (string) config('database.connections.mysql.database');

        if ($this->hasOption('no-interaction') || ! $this->input->isInteractive()) {
            return true;
        }

        return $this->confirm(
            "This DROPS every table in `{$database}` and re-migrates. Continue?",
            false
        );
    }
}
