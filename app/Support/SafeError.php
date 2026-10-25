<?php

namespace App\Support;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Validation\ValidationException;
use PDOException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * What may be shown to a client, and what may not.
 *
 * THE DEFECT
 * ----------
 * Thirty-five catch blocks across the API controllers echoed
 * `$e->getMessage()` straight into the response body. The codebase's own
 * comment described the intent:
 *
 *     // DISPUTE FREEZE: 422 so the catch below surfaces the message to the
 *     // client (it only echoes $e->getMessage() for code 422).
 *
 * The intent was right and the enforcement was missing. A `QueryException`'s
 * message is the FULL SQL STATEMENT WITH ITS BINDINGS:
 *
 *     SQLSTATE[HY000]: General error: 1 Duplicate entry 'bids_arsitek-7-1'
 *     for key 'bids_arsitek.bids_arsitek_project_id_arsitek_id_unique'
 *     (Connection: mysql, Host: 10.0.1.7, Port: 3306, Database: 4ceria,
 *      SQL: insert into `bids_arsitek` (`project_id`, `arsitek_id`, ...) values
 *      (7, 1, ...))
 *
 * Four of those sites ALSO took the HTTP status from `$e->getCode()`, which
 * for a `QueryException` is the SQLSTATE STRING 'HY000'. `response()->json($x,
 * 'HY000')` is not a valid status: Symfony casts it to an int, `intval('HY000')`
 * is 0, and the response becomes a 0 — which no client can interpret.
 *
 * THE RULE
 * -------
 * A message is shown to the client only when it was WRITTEN FOR the client.
 *
 * That is true for:
 *   - a validation failure (the field-level errors);
 *   - an authentication or authorisation failure;
 *   - an HTTP exception (404, 403, 429 — Symfony's own wording);
 *   - a plain exception carrying a 4xx code, which in this codebase is the
 *     convention for a BUSINESS message: `throw new Exception('This addendum
 *     has already been processed.', 422)`.
 *
 * It is NOT true for:
 *   - a `QueryException` or a `PDOException` — the SQL and the bindings;
 *   - a PHP `Error` — a type error, an argument count error;
 *   - a `ModelNotFoundException` — it names the model class and the id;
 *   - anything whose code is not a valid HTTP status.
 *
 * Everything else gets a generic message, and the detail goes to the log,
 * where it belongs.
 */
final class SafeError
{
    /**
     * The HTTP status to answer with.
     *
     * NEVER the raw exception code: for a `QueryException` that is the
     * SQLSTATE string ('HY000'), and `intval('HY000')` is 0 — so the response
     * status became 0 and the client could not interpret it at all.
     *
     * @param  int  $fallback  Used when the exception carries no usable code.
     */
    public static function status(Throwable $e, int $fallback = 500): int
    {
        $code = $e->getCode();

        if (is_int($code) && $code >= 400 && $code < 600) {
            return $code;
        }

        // `getCode()` is typed as int, but a `QueryException` carries the
        // SQLSTATE string, so the value is not always an int. `is_int()`
        // above rejects it, and the fallback is used.
        return $fallback;
    }

    /**
     * The message to show the client.
     */
    public static function message(Throwable $e): string
    {
        if (self::isClientSafe($e)) {
            return $e->getMessage();
        }

        return self::generic(self::status($e));
    }

    /**
     * A message with no internal detail in it.
     */
    public static function generic(int $status = 500): string
    {
        if ($status >= 400 && $status < 500) {
            return 'The request could not be completed.';
        }

        return 'An unexpected error occurred. Please try again.';
    }

    /**
     * Was this exception's message written for the client?
     */
    public static function isClientSafe(Throwable $e): bool
    {
        // The SQL and the bindings. Always.
        if ($e instanceof QueryException || $e instanceof PDOException) {
            return false;
        }

        // A PHP error: a type error, an argument count error, a bad method
        // call. The message is a stack trace in prose.
        if ($e instanceof \Error) {
            return false;
        }

        // It names the model class and the id that was not found.
        if ($e instanceof ModelNotFoundException) {
            return false;
        }

        // Laravel's own client-facing failures.
        if ($e instanceof ValidationException
            || $e instanceof AuthenticationException
            || $e instanceof AuthorizationException
            || $e instanceof HttpExceptionInterface
        ) {
            return true;
        }

        // The codebase's convention: a plain exception with a 4xx code is a
        // business message, written for the client.
        $code = $e->getCode();

        return is_int($code) && $code >= 400 && $code < 500;
    }
}
