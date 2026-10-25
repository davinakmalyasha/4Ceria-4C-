<?php

use App\Support\SafeError;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\QueryException;
use Illuminate\Validation\ValidationException;

/*
|--------------------------------------------------------------------------
| A database failure must never reach the client
|--------------------------------------------------------------------------
|
| Regression suite for the audit finding that thirty-five catch blocks across
| the API controllers echoed `$e->getMessage()` straight into the response.
|
| WHAT LEAKS
| ----------
| A `QueryException`'s message is the FULL SQL STATEMENT WITH ITS BINDINGS:
|
|     SQLSTATE[HY000]: General error: 1 Duplicate entry 'bids_arsitek-7-1'
|     for key 'bids_arsetik.bids_arsitek_project_id_arsitek_id_unique'
|     (Connection: mysql, Host: 10.0.1.7, Port: 3306, Database: 4ceria,
|      SQL: insert into `bids_arsitek` (`project_id`, `arsitek_id`, ...) values
|      (7, 1, ...))
|
| That is the table layout, the connection topology and the row contents, to
| anyone who can make the request fail.
|
| THE OTHER HALF
| --------------
| Four sites also took the HTTP STATUS from `$e->getCode()`. For a
| `QueryException` that is the SQLSTATE STRING — '21000', 'HY000' — not an
| integer. `response()->json($payload, '21000')` is not a status code, and
| `intval('21000')` is 0.
|
| THE RULE
| --------
| A message reaches the client only when it was WRITTEN for the client:
| a validation failure, an authentication or authorisation failure, an HTTP
| exception, or a plain exception carrying a 4xx code — which in this
| codebase is the convention for a business message.
|
| Everything else gets a generic message, and the detail goes to the log.
|
*/

uses(Tests\TestCase::class);

/**
 * The violation the static gate looks for: a raw `->getMessage()` inside a
 * response payload.
 *
 * @return list<array{0: string, 1: int}>
 */
function rawGetMessageInResponses(string $file): array
{
    $tokens = token_get_all((string) file_get_contents($file));
    $count = count($tokens);
    $violations = [];

    // Every call whose ARGUMENTS could carry a response payload:
    // `response(...)` and `->json(...)`.
    for ($i = 0; $i < $count; $i++) {
        $token = $tokens[$i];

        if (! is_array($token) || $token[0] !== T_STRING) {
            continue;
        }

        $isResponse = $token[1] === 'response';
        $isJson = $token[1] === 'json'
            && $i > 0
            && is_array($tokens[$i - 1])
            && $tokens[$i - 1][0] === T_OBJECT_OPERATOR;

        if (! $isResponse && ! $isJson) {
            continue;
        }

        // The argument span: from the '(' to its matching ')'.
        $depth = 0;
        $start = null;
        $end = null;

        for ($j = $i; $j < $count; $j++) {
            $text = is_array($tokens[$j]) ? $tokens[$j][1] : $tokens[$j];

            if ($text === '(') {
                if ($depth === 0) {
                    $start = $j;
                }
                $depth++;
            } elseif ($text === ')') {
                $depth--;

                if ($depth === 0) {
                    $end = $j;
                    break;
                }
            }
        }

        if ($start === null || $end === null) {
            continue;
        }

        for ($k = $start; $k < $end; $k++) {
            $inner = $tokens[$k];

            if (is_array($inner)
                && $inner[0] === T_OBJECT_OPERATOR
                && isset($tokens[$k + 1])
                && is_array($tokens[$k + 1])
                && $tokens[$k + 1][1] === 'getMessage'
            ) {
                $violations[] = [$token[1], $inner[2]];
            }
        }
    }

    return $violations;
}

it('never puts a raw exception message into a response', function () {
    $directory = app_path('Http/Controllers');
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory));

    $violations = [];
    $scanned = 0;

    foreach ($files as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'php') {
            continue;
        }

        $scanned++;

        foreach (rawGetMessageInResponses($file->getPathname()) as $violation) {
            $violations[] = sprintf(
                '%s:%d — a raw ->getMessage() inside %s()',
                str_replace(base_path().DIRECTORY_SEPARATOR, '', $file->getPathname()),
                $violation[1],
                $violation[0]
            );
        }
    }

    expect($scanned)->toBeGreaterThan(50);

    // A message may only reach the client through SafeError.
    expect($violations)->toBe([], implode("\n", $violations));
});

it('does not echo a database failure, and does not use the SQLSTATE as a status', function () {
    $queryException = new QueryException(
        'mysql',
        'select * from `bids_arsitek` where `project_id` = ? and `arsitek_id` = ?',
        [7, 1],
        new PDOException('SQLSTATE[HY000]: General error: 1 Duplicate entry')
    );

    // A real MySQL failure carries the SQLSTATE STRING as the code.
    $reflection = new ReflectionProperty(QueryException::class, 'code');
    $reflection->setValue($queryException, 'HY000');

    expect(SafeError::status($queryException))->toBe(500)
        ->and(SafeError::status($queryException))->not->toBe('HY000')
        ->and(SafeError::message($queryException))->not->toContain('SQLSTATE')
        ->and(SafeError::message($queryException))->not->toContain('bids_arsitek')
        ->and(SafeError::message($queryException))->not->toContain('select * from');
});

it('echoes a business message, because it was written for the client', function () {
    $business = new RuntimeException('This addendum has already been processed.', 422);

    expect(SafeError::message($business))->toBe('This addendum has already been processed.')
        ->and(SafeError::status($business))->toBe(422);
});

it('echoes a validation failure, an authentication failure and an authorisation failure', function () {
    $validation = new ValidationException(
        Illuminate\Support\Facades\Validator::make([], ['title' => 'required'])
    );

    expect(SafeError::message($validation))->not->toBe('')
        ->and(SafeError::message(new AuthenticationException()))->toBe('Unauthenticated.')
        ->and(SafeError::message(new AuthorizationException('This action is unauthorized.')))
        ->toBe('This action is unauthorized.');
});

it('does not echo a PHP error or a missing model', function () {
    $typeError = new TypeError('App\Support\Money::of(): Argument #1 ($amount) must be of type int|float|string, null given');
    $missing = new Illuminate\Database\Eloquent\ModelNotFoundException();
    $missing->setModel('App\Models\Project', [5]);

    expect(SafeError::message($typeError))->not->toContain('App\Support\Money')
        ->and(SafeError::message($missing))->not->toContain('App\Models\Project')
        ->and(SafeError::message($missing))->not->toContain('No query results');
});

it('falls back to a usable status when the exception carries none', function () {
    $exception = new RuntimeException('Something went wrong.');

    expect($exception->getCode())->toBe(0)
        ->and(SafeError::status($exception))->toBe(500)
        ->and(SafeError::status($exception, 422))->toBe(422);
});
