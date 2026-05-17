<?php

namespace App\Traits;

use App\Models\BidNegotiationLog;

trait HasNegotiationHistory
{
    public function negotiationLogs()
    {
        return $this->morphMany(BidNegotiationLog::class, 'bid')->orderBy('round_number', 'desc');
    }
}
