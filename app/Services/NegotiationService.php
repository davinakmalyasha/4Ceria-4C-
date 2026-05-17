<?php

namespace App\Services;

use App\Models\BidNegotiationLog;
use Illuminate\Support\Facades\Auth;

class NegotiationService
{
    /**
     * Log a negotiation round with a snapshot and change detection.
     */
    public function logRound($bid, array $newData, ?string $note)
    {
        $user = Auth::user();
        $oldData = [
            'price' => $bid->price,
            'fee_type' => $bid->fee_type,
            'proposed_termins' => $bid->proposed_termins,
            'proposed_milestones' => $bid->proposed_milestones,
        ];

        $changes = $this->detectChanges($oldData, $newData);
        $roundNumber = ($bid->negotiation_count ?? 0) + 1;

        return BidNegotiationLog::create([
            'bid_id' => $bid->id,
            'bid_type' => get_class($bid),
            'user_id' => $user->id,
            'round_number' => $roundNumber,
            'snapshot' => $oldData, // Store the state BEFORE this new proposal
            'note' => $note,
            'changes_detected' => $changes,
        ]);
    }

    /**
     * Detect specific changes between old and new proposal data.
     */
    private function detectChanges(array $old, array $new): array
    {
        $changes = [];

        if ($old['price'] != $new['price']) {
            $changes[] = [
                'field' => 'price',
                'old' => $old['price'],
                'new' => $new['price'],
                'message' => "Changed price from " . number_format($old['price']) . " to " . number_format($new['price'])
            ];
        }

        if ($old['fee_type'] != $new['fee_type']) {
            $changes[] = [
                'field' => 'fee_type',
                'old' => $old['fee_type'],
                'new' => $new['fee_type'],
                'message' => "Changed fee structure to " . strtoupper($new['fee_type'])
            ];
        }

        // Simple comparison for arrays
        if (json_encode($old['proposed_termins']) !== json_encode($new['proposed_termins'])) {
            $changes[] = [
                'field' => 'payment_schedule',
                'message' => "Updated payment phases and percentages"
            ];
        }

        if (json_encode($old['proposed_milestones']) !== json_encode($new['proposed_milestones'])) {
            $changes[] = [
                'field' => 'milestones',
                'message' => "Revised project milestones"
            ];
        }

        return $changes;
    }
}
