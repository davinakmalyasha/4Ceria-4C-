<?php

use App\Support\Schema\ColumnDefault;
use App\Support\Schema\EnumValues;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| B21 — the ENUM helper must not eat the column's other properties
|--------------------------------------------------------------------------
|
| `EnumValues::addValues()` restates a column with `MODIFY COLUMN`, and
| `MODIFY COLUMN` restates the ENTIRE column definition. So anything the new
| statement does not mention is dropped — and the first version of the helper
| mentioned only the value list.
|
| Six ENUM columns had lost their DEFAULT as a result:
|
|   project_addendums.status     was 'pending_approval'
|   material_orders.status        was 'pending'
|   bids_arsitek.status           was 'pending'
|   bids_kontraktor.status        was 'pending'
|   bids_notaris.status           was 'pending'
|   bids_interior.status          was 'pending'
|
| It was invisible because every application INSERT sets these columns
| explicitly, so nothing broke loudly; the reproducible schema and the live
| schema AGREED with each other and disagreed with the base migration, which
| still declared `->default('pending_approval')`. The PostgreSQL target
| declares the default too, so the two engines drifted into different schemas
| for the same columns.
|
| WHY THIS TEST READS RATHER THAN ALTERS
| --------------------------------------
| `ALTER TABLE` commits implicitly in MySQL, so a test that ALTERed a table
| could not be rolled back and would leave the schema permanently changed —
| and the test suite's contract is that every test is rolled back. So the
| behaviour is asserted against the DEFINITION the helper generates, which is
| the thing that actually decides whether a default survives, and against the
| live columns' current properties, which is the thing that decides whether
| the damage is still there.
|
*/

uses(Tests\TestCase::class);

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * The column and the default its BASE migration declared.
 *
 * @return array<string, string>
 */
function enumDefaultExpectations(): array
{
    return [
        'project_addendums' => 'pending_approval',
        'material_orders' => 'pending',
        'bids_arsitek' => 'pending',
        'bids_kontraktor' => 'pending',
        'bids_notaris' => 'pending',
        'bids_interior' => 'pending',
    ];
}

it('keeps the default on every ENUM column that has one', function () {
    foreach (enumDefaultExpectations() as $table => $expected) {
        expect(ColumnDefault::current($table, 'status'))
            ->toBe($expected, "{$table}.status lost its default");
    }
});

it('generates a definition that keeps the default, the nullability and the comment', function () {
    // A NULLABLE column with a default.
    $nullable = EnumValues::definition('bids_arsitek', 'status', ['pending', 'accepted']);
    expect($nullable)->toContain("DEFAULT 'pending'")
        ->and($nullable)->toContain(' NULL');

    // A NOT NULL column with a default. `MODIFY COLUMN` without `NOT NULL`
    // drops the attribute, which would silently make a non-nullable column
    // nullable.
    $notNull = EnumValues::definition('arsiteks', 'verification_status', ['pending', 'verified']);
    expect($notNull)->toContain("DEFAULT 'pending'")
        ->and($notNull)->toContain(' NOT NULL');
});

it('keeps the value list in order and only ever appends', function () {
    $current = EnumValues::current('bids_arsitek', 'status');

    // The definition is built from the value list the caller passes, so the
    // helper cannot reorder anything the caller hands it.
    $definition = EnumValues::definition('bids_arsitek', 'status', array_merge($current, ['a_new_value']));

    expect($definition)->toStartWith("ENUM('".implode("','", $current)."'")
        ->and($definition)->toContain("'a_new_value'");
});

it('reports the current default of a column that has one, and null for one that has not', function () {
    expect(ColumnDefault::current('bids_arsitek', 'status'))->toBe('pending');

    // `team_members.owner_role` is an ENUM with no default: the base
    // migration never declared one.
    expect(ColumnDefault::current('team_members', 'owner_role'))->toBeNull();
});

it('agrees with the server about every ENUM column the helper has touched', function () {
    // The helper and the server must not disagree about what the schema is.
    // This is the assertion that would have caught B21 the day it happened:
    // it compares the definition the helper WOULD install against the
    // column that is actually there.
    $columns = DB::select(
        "SELECT TABLE_NAME AS t, COLUMN_NAME AS c
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND DATA_TYPE = 'enum'
           AND TABLE_NAME IN ('project_addendums','material_orders','bids_arsitek',
                              'bids_kontraktor','bids_notaris','bids_interior',
                              'arsiteks','team_members','firm_members')
           AND COLUMN_NAME = 'status'"
    );

    expect($columns)->not->toBeEmpty();

    foreach ($columns as $column) {
        $current = EnumValues::current($column->t, $column->c);
        $default = ColumnDefault::current($column->t, $column->c);

        // The definition the helper would install, with the value list
        // UNCHANGED — so the only differences left are the properties.
        $definition = EnumValues::definition($column->t, $column->c, $current);

        if ($default === null) {
            expect($definition)->not->toContain('DEFAULT')
                ->toBe("{$column->t}.{$column->c} would gain a default it does not have");
        } else {
            expect($definition)->toContain("DEFAULT '{$default}'");
        }
    }
});
