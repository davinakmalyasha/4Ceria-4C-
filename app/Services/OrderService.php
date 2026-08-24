<?php

namespace App\Services;

use App\Models\MaterialOrder;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class OrderService
{
    /**
     * Automatically complete orders that have been delivered for more than 3 days.
     * This ensures the fulfillment cycle is closed without manual intervention.
     */
    public function autoCompleteOrders()
    {
        $expirationDate = Carbon::now()->subDays(3);

        $expiredOrders = MaterialOrder::where('status', 'delivered')
            ->where('delivered_at', '<=', $expirationDate)
            ->get();

        foreach ($expiredOrders as $order) {
            // Ensure stock is decremented before completing (if not already)
            $this->decrementStock($order);

            $order->update([
                'status' => 'completed',
                'completed_at' => Carbon::now(),
                'notes' => ($order->notes ? $order->notes."\n" : '').'[System] Automatically completed after 3 days of arrival.',
            ]);
        }

        return $expiredOrders->count();
    }

    /**
     * Deduct ordered quantities from material stock.
     * Concurrency-safe: the guard flag is claimed atomically BEFORE any stock
     * movement, and everything runs in one transaction so a mid-loop failure
     * rolls back both the stock changes and the flag.
     */
    public function decrementStock(MaterialOrder $order)
    {
        return DB::transaction(function () use ($order) {
            // Atomic claim: only ONE concurrent caller can flip the flag 0 -> 1.
            $claimed = MaterialOrder::where('id', $order->id)
                ->where('is_stock_decremented', false)
                ->update(['is_stock_decremented' => true]);

            if (!$claimed) {
                return false; // Already decremented by another process.
            }

            foreach ($order->items as $item) {
                if ($item->material) {
                    $item->material->decrement('stock', $item->quantity);
                }
            }

            return true;
        });
    }

    /**
     * Restore quantities to material stock (e.g. on cancellation).
     */
    public function incrementStock(MaterialOrder $order)
    {
        return DB::transaction(function () use ($order) {
            // Same atomic pattern in reverse: only restore exactly once.
            $claimed = MaterialOrder::where('id', $order->id)
                ->where('is_stock_decremented', true)
                ->update(['is_stock_decremented' => false]);

            if (!$claimed) {
                return false;
            }

            foreach ($order->items as $item) {
                if ($item->material) {
                    $item->material->increment('stock', $item->quantity);
                }
            }

            return true;
        });
    }
}
