<?php

namespace App\Support\ContractCapture;

/**
 * The normalisation rules for a recorded response body.
 *
 * WHY NORMALISE AT ALL
 * --------------------
 * The golden files are compared BYTE FOR BYTE. A body that differs by one
 * character is a difference, and most of the differences a capture would
 * produce are not about the endpoint at all — they are about WHEN the
 * capture happened.
 *
 * So the volatile parts are replaced with a placeholder, and only those.
 * Everything else — the key order, the number formatting, the escaping, the
 * shape — is compared exactly, because those ARE the contract.
 *
 * WHAT IS NORMALISED
 * ------------------
 * TIMESTAMPS. A response carries `created_at`, `updated_at`, `paid_at`,
 * `fee_agreed_at` and about sixty other timestamp keys. They are written by
 * `now()`, and they are not what the endpoint is FOR.
 *
 * The clock is frozen while the capture runs (`Carbon::setTestNow()`), so
 * the timestamps are already deterministic — but they are still normalised,
 * because the Go side would have to reproduce the exact instant, and a
 * capture that ran on a different day would then be a false failure. The
 * placeholder says "there is a timestamp here", which is the property that
 * matters.
 *
 * WHAT IS NOT NORMALISED
 * ----------------------
 * EVERYTHING ELSE. In particular:
 *
 *   - The IDS are NOT normalised. The fixture pins them, so they are the
 *     same on every machine, and an endpoint that returned the WRONG id
 *     would be caught. That is the whole point of pinning them.
 *   - The KEY ORDER is not normalised. PHP emits an array's keys in
 *     insertion order, and the Go side has to as well.
 *   - The NUMBERS are not normalised. `5500000` and `5.5e6` are the same
 *     value and different bytes, and the bytes are the contract.
 *   - The ESCAPING is not normalised. PHP escapes the forward slash and the
 *     non-ASCII characters, and the Go side has to as well.
 */
final class Normaliser
{
    /**
     * The version of the rules.
     *
     * A golden file records the version it was written with, and the
     * comparison refuses a file written with a different one — because a
     * change to the rules changes what the files MEAN, and a comparison
     * across that change would be comparing two different things.
     */
    public const VERSION = 1;

    /**
     * The placeholder that replaces a timestamp.
     */
    public const TIMESTAMP = '<timestamp>';

    /**
     * The timestamp shapes that appear in a response body.
     *
     * Each is one PHP produces:
     *
     *   2026-01-01T00:00:00.000000Z   a Carbon instance serialised by
     *                                `toJSON()`, which is UTC with
     *                                microseconds
     *   2026-01-01T00:00:00+07:00     the same, with an offset
     *   2026-01-01 00:00:00           a raw datetime column
     *   2026-01-01T00:00:00.000000+00:00   the same, with an explicit
     *                                zero offset
     */
    private const PATTERNS = [
        '/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z/',
        '/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+\d{2}:\d{2}/',
        '/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}-\d{2}:\d{2}/',
        '/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+\d{2}:\d{2}/',
        '/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/',
    ];

    /**
     * Normalise a response body.
     *
     * The body is a STRING of bytes, and it stays a string: the point is
     * that the comparison is on the bytes.
     *
     * @param  array<int, string>  $knownIds    The ids the fixture created,
     *                                           by value.
     * @param  array<int, int>  $assignedIds  The ids the DATABASE assigned —
     *                                        the rows the endpoint created.
     */
    public static function body(string $body, array $knownIds = [], array $assignedIds = []): string
    {
        foreach (self::PATTERNS as $pattern) {
            $body = (string) preg_replace($pattern, self::TIMESTAMP, $body);
        }

        return self::normaliseAssignedIds($body, $knownIds, $assignedIds);
    }

    /**
     * The placeholder that replaces an id the database assigned.
     */
    public const ASSIGNED_ID = '<id:assigned>';

    /**
     * Replace the ids the DATABASE assigned with a placeholder.
     *
     * A row the endpoint CREATES gets its id from the database's
     * auto-increment counter, and the counter is not rolled back by a
     * transaction — so the second capture of the same endpoint produced a
     * different id, and the recording was not a recording.
     *
     * The id of a CREATED row cannot be part of the byte-identical
     * contract either: the legacy application uses MySQL's auto-increment
     * and the new one uses a PostgreSQL sequence, and they will not agree.
     * What IS part of the contract is that an id is THERE, and that it is a
     * number — so the placeholder says exactly that.
     *
     * The ids are replaced BY VALUE, from the list the capture built: the
     * ids of the rows the endpoint inserted. A value-based rule over the
     * whole reserved range would be wrong, because a created id can land on
     * top of another table's fixture id — which is exactly what happened
     * with the sticky note's 900 000 057 — and the fixture gives each table
     * its own band so that cannot happen.
     *
     * The fixture's own ids are NOT replaced: they are pinned, so they are
     * the same on every machine, and an endpoint that returned the WRONG
     * one has to be caught.
     *
     * @param  array<int, string>  $knownIds
     * @param  array<int, int>  $assignedIds
     */
    private static function normaliseAssignedIds(string $body, array $knownIds, array $assignedIds): string
    {
        if ($assignedIds === []) {
            return $body;
        }

        return self::replaceAssignedIds($body, $assignedIds);
    }

    /**
     * Replace the assigned ids in a text.
     *
     * The ids are replaced as JSON TOKENS — a bare number — so a number that
     * happens to look like an id in the middle of a longer number is left
     * alone.
     *
     * @param  array<int, int>  $assignedIds
     */
    private static function replaceAssignedIds(string $text, array $assignedIds): string
    {
        return (string) preg_replace_callback(
            '/(?<![\d-])(\d+)(?![\d])/',
            static function (array $matches) use ($assignedIds): string {
                $value = (int) $matches[1];

                return in_array($value, $assignedIds, true) ? self::ASSIGNED_ID : $matches[0];
            },
            $text,
        );
    }

    /**
     * The columns that are never recorded.
     *
     * A PASSWORD HASH is not part of any contract, and a golden file is a
     * COMMITTED file: a hash in one is a hash in the repository's history
     * for ever. The fixture's hash is of a published password, but the
     * principle stands for any row the capture records.
     *
     * `remember_token` is the same: it is a credential.
     *
     * @var list<string>
     */
    private const REDACTED = ['password', 'remember_token'];

    /**
     * Normalise a side-effect row.
     *
     * The columns that carry a timestamp are replaced; the rest are left
     * exactly as they are, because the numbers ARE the record.
     *
     * @param  array<int, string>  $knownIds    The ids the fixture created,
     *                                           by value.
     * @param  array<int, int>  $assignedIds  The ids the DATABASE assigned.
     */
    public static function row(array $row, array $knownIds = [], array $assignedIds = []): array
    {
        $out = [];

        foreach ($row as $column => $value) {
            if (in_array($column, self::REDACTED, true)) {
                $out[$column] = '<redacted>';
                continue;
            }

            if (is_string($value) && self::looksLikeTimestamp($value)) {
                $out[$column] = self::TIMESTAMP;
                continue;
            }

            // An id the DATABASE assigned — the same rule as the body's.
            if (is_int($value) && $assignedIds !== [] && in_array($value, $assignedIds, true)) {
                $out[$column] = self::ASSIGNED_ID;
                continue;
            }

            // A JSON column. The id is INSIDE the JSON, as text, so the
            // value-level replacement does not reach it — and a notification
            // that names the row it is about would carry the id that
            // changes between two captures.
            if (is_string($value) && $assignedIds !== [] && self::looksLikeJson($value)) {
                $out[$column] = self::replaceAssignedIds($value, $assignedIds);
                continue;
            }

            $out[$column] = $value;
        }

        return $out;
    }

    /**
     * Does this value look like a JSON document?
     */
    private static function looksLikeJson(string $value): bool
    {
        $trimmed = ltrim($value);

        return str_starts_with($trimmed, '{') || str_starts_with($trimmed, '[');
    }

    /**
     * Does this value look like a timestamp?
     *
     * A loose test on purpose: the point is to catch the timestamp
     * COLUMNS, and a column that merely happens to start with four digits
     * and a dash is not a thing.
     */
    private static function looksLikeTimestamp(string $value): bool
    {
        foreach (self::PATTERNS as $pattern) {
            if (preg_match($pattern, $value) === 1) {
                return true;
            }
        }

        return false;
    }
}
