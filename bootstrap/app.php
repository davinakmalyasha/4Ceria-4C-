<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Railway terminates TLS at its edge; without trusting the proxy,
        // every request shares the edge IP and rate-limit buckets collapse
        // into one global bucket (login lockout DoS, wrong audit IPs).
        // SECURITY: pin to TRUSTED_PROXIES (CIDR list) in production — "*"
        // lets clients spoof X-Forwarded-For and rotate throttle buckets.
        // Local dev falls back to "*" so artisan serve / octane keep working.
        $trustedProxies = env('TRUSTED_PROXIES');
        if (!empty($trustedProxies)) {
            $middleware->trustProxies(at: array_map('trim', explode(',', $trustedProxies)));
        } else {
            $middleware->trustProxies(at: '*');
        }
        $middleware->web(append: [
            \App\Http\Middleware\SecurityHeaders::class,
        ]);
        $middleware->api(append: [
            \App\Http\Middleware\SecurityHeaders::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class.':api',
        ]);
        $middleware->alias([
            'role' => \Spatie\Permission\Middleware\RoleMiddleware::class,
            'permission' => \Spatie\Permission\Middleware\PermissionMiddleware::class,
            'role_or_permission' => \Spatie\Permission\Middleware\RoleOrPermissionMiddleware::class,
            'admin' => \App\Http\Middleware\AdminMiddleware::class,
            'freeze_pending_termination' => \App\Http\Middleware\FreezeWorkspaceIfTerminationPending::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Always render JSON for API routes instead of falling back to HTML error pages
        $exceptions->shouldRenderJsonWhen(fn ($request) => $request->is('api/*') || $request->expectsJson());

        // Honour an intentional 4xx in a domain exception's code.
        //
        // The money services raise rejections as `throw new \Exception($msg,
        // 422)` — that is the established convention here, and roughly twenty
        // call sites depend on it. Laravel does NOT translate that: an exception
        // that is not an HttpException renders as 500, so every one of those
        // rejections reached the client as "Internal Server Error" unless the
        // calling controller happened to wrap the call in its own try/catch.
        // Two of them did, and the other eighteen did not — the same logical
        // rejection therefore returned 422 or 500 depending on which controller
        // happened to be involved, and the client could not tell a genuine
        // server fault from a correct business-rule refusal.
        //
        // This was found the hard way, twice in a row: B3 (the termin-plan
        // bounds) and B5 (the vendor-import escrow bound) each needed a local
        // try/catch added purely to convert a 422 into a 422. Fixing it once,
        // here, removes that class of bug instead of patching it per controller.
        //
        // Deliberately narrow:
        //   - `is_int` matters, because PDOException and friends carry STRING
        //     codes like '23000' and must still render as 500;
        //   - the range is clamped to 400..499, so a genuine unexpected failure
        //     (code 0, or a 5xx) is never reclassified as a client error and
        //     never has its message leaked to the client.
        $exceptions->render(function (Throwable $e, $request) {
            $code = $e->getCode();

            if ($e instanceof Symfony\Component\HttpKernel\Exception\HttpExceptionInterface) {
                return null; // already a well-formed HTTP response
            }

            if (! is_int($code) || $code < 400 || $code > 499) {
                return null; // a real fault — let Laravel report it as a 500
            }

            return response()->json([
                'message' => $e->getMessage(),
            ], $code);
        });
    })->create();
