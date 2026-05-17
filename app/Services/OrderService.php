<?php

namespace App\Services;

use App\Models\MaterialOrder;
use Carbon\Carbon;

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
     */
    public function decrementStock(MaterialOrder $order)
    {
        if ($order->is_stock_decremented) {
            return false;
        }

        foreach ($order->items as $item) {
            if ($item->material) {
                $item->material->decrement('stock', $item->quantity);
            }
        }

        $order->update(['is_stock_decremented' => true]);

        return true;
    }

    /**
     * Restore quantities to material stock (e.g. on cancellation).
     */
    public function incrementStock(MaterialOrder $order)
    {
        if (! $order->is_stock_decremented) {
            return false;
        }

        foreach ($order->items as $item) {
            if ($item->material) {
                $item->material->increment('stock', $item->quantity);
            }
        }

        $order->update(['is_stock_decremented' => false]);

        return true;
    }
}
