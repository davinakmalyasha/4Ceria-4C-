<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class QueryTelemetryMiddleware
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Don't log or intercept for preflight OPTIONS requests
        if ($request->isMethod('OPTIONS')) {
            return $next($request);
        }

        // Enable query log
        $startTime = microtime(true);
        DB::enableQueryLog();

        $response = $next($request);

        // Fetch query details
        $queryLog = DB::getQueryLog();
        $queryCount = count($queryLog);
        $totalQueryTime = array_sum(array_column($queryLog, 'time')); // in milliseconds

        // Flush and disable logging to prevent memory build-up
        DB::flushQueryLog();
        DB::disableQueryLog();

        $elapsedTime = (microtime(true) - $startTime) * 1000; // in milliseconds

        // Set telemetry headers on the response object
        if (method_exists($response, 'headers') && $response->headers !== null) {
            $response->headers->set('X-Query-Count', (string) $queryCount);
            $response->headers->set('X-Query-Time-Ms', (string) round($totalQueryTime, 2));
            $response->headers->set('X-Response-Time-Ms', (string) round($elapsedTime, 2));
            $response->headers->set('Access-Control-Expose-Headers', 'X-Query-Count, X-Query-Time-Ms, X-Response-Time-Ms');
        }

        return $response;
    }
}
