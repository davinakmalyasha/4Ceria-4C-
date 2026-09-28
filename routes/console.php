<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

/*
|--------------------------------------------------------------------------
| Scheduled work
|--------------------------------------------------------------------------
| `onOneServer()` is REQUIRED here, not optional polish: the Docker image runs
| `while true; do php artisan schedule:run; sleep 60; done` in supervisord, so
| every replica executes every task. Without the guard, N replicas sent N
| duplicate `snag_overdue` notifications and double-completed material orders.
| `withoutOverlapping()` additionally protects against a slow run overlapping
| its own next tick.
|
| `onOneServer()` needs a cache lock — the production cache store is Redis, so
| this works in prod. Locally (file cache) Laravel falls back to a process lock.
*/

\Illuminate\Support\Facades\Schedule::command('app:auto-complete-orders')
    ->daily()
    ->onOneServer()
    ->withoutOverlapping(30);

// Snag/defect SLA: escalate items past their severity deadline once.
\Illuminate\Support\Facades\Schedule::command('snags:escalate-overdue')
    ->dailyAt('07:00')
    ->onOneServer()
    ->withoutOverlapping(30);

// PERF: keep hot tables (notifications, tokens, failed jobs) from growing
// forever. Notification::prunable() targets read-and-older-than-90d rows.
\Illuminate\Support\Facades\Schedule::command('model:prune')
    ->dailyAt('03:10')
    ->onOneServer();

\Illuminate\Support\Facades\Schedule::command('queue:prune-failed --hours=48')
    ->dailyAt('03:20')
    ->onOneServer();

\Illuminate\Support\Facades\Schedule::command('sanctum:prune-expired --hours=24')
    ->dailyAt('03:30')
    ->onOneServer();
