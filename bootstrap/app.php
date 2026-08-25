<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

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
    })->create();
