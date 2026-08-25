<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

\Illuminate\Support\Facades\Schedule::command('app:auto-complete-orders')->daily();

// PERF: keep hot tables (notifications, tokens, failed jobs) from growing
// forever. Notification::prunable() targets read-and-older-than-90d rows.
\Illuminate\Support\Facades\Schedule::command('model:prune')->dailyAt('03:10');
\Illuminate\Support\Facades\Schedule::command('queue:prune-failed --hours=48')->dailyAt('03:20');
\Illuminate\Support\Facades\Schedule::command('sanctum:prune-expired --hours=24')->dailyAt('03:30');
