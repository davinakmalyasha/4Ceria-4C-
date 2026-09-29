<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\SpaController;

// All non-API web traffic routes to the strictly typed React SPA
Route::get('/login', [SpaController::class, 'index'])->name('login');

// Handle static document templates explicitly (with path traversal prevention)
Route::get('/templates/{filename}', [SpaController::class, 'showTemplate']);

Route::get('/', [SpaController::class, 'index']);

Route::get('storage/{path}', [\App\Http\Controllers\StorageFallbackController::class, 'handle'])
    ->where('path', '.*');

// AGENTS.md trap #7 — REAL FIX.
//
// `bootstrap/app.php::shouldRenderJsonWhen($request->is('api/*'))` only fixes
// the EXCEPTION path (a 404/500 inside a matched api route renders JSON). It
// does nothing for an api path that matches NO route at all, because the
// catch-all below swallowed it and returned the SPA shell with 200 text/html.
// Verified before this change:
//
//   GET /api/nope-not-real  => 200 text/html   (full SPA document)
//   GET /api/               => 200 text/html   (full SPA document)
//
// Consequences: the SPA's axios client cannot distinguish "typo'd or renamed
// endpoint" from "success", `getApiErrorMessage` reads a non-existent
// `message` key, and — worst — a route removed or renamed on the API while an
// older SPA build is still live degrades silently instead of 404ing.
//
// The catch-all is therefore constrained to non-api paths, and an explicit
// JSON fallback answers the rest. The lookahead has no ^ or $ because Symfony
// already anchors the compiled pattern.
Route::get('/{any}', [SpaController::class, 'index'])
    ->where('any', '^(?!api(?:/|$)).*$');

Route::any('/api/{any}', function (Illuminate\Http\Request $request) {
    return response()->json([
        'message' => 'API endpoint not found.',
        'path' => '/' . $request->path(),
    ], 404);
})->where('any', '.*');

