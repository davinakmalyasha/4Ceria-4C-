<?php

/*
|--------------------------------------------------------------------------
| Snag list SLA policy
|--------------------------------------------------------------------------
| Days a defect may stay open before it is considered overdue and escalated
| (once) by `php artisan snags:escalate-overdue` (scheduled daily).
*/

return [
    'sla_days' => [
        'critical' => 3,
        'major' => 7,
        'minor' => 14,
    ],
];
