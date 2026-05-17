<?php

namespace App\Http\Controllers;

use App\Models\MaterialOrder;
use App\Services\OrderService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class MaterialOrderController extends Controller
{
    protected $orderService;

    public function __construct(OrderService $orderService)
    {
        $this->orderService = $orderService;
    }

    public function index()
    {
        // 3-Day Auto-Completion Policy (Lazy Check)
        $this->orderService->autoCompleteOrders();

        $user = Auth::user();
        $query = MaterialOrder::with(['supplier', 'user', 'project', 'items.material', 'review', 'deliveryJob.logistics.phoneNumber']);

        if ($user->role_type === 'supplier' && $user->supplier) {
            $query->where(function ($q) use ($user) {
                $q->where('supplier_id', $user->supplier->id)
                    ->orWhere('user_id', $user->id);
            });
        } else {
            $query->where('user_id', $user->id);
        }

        $orders = $query->orderBy('created_at', 'desc')->get();

        return response()->json([
            'success' => true,
            'data' => $orders,
        ]);
    }

    public function show(MaterialOrder $materialOrder)
    {
        $user = Auth::user();

        // Ensure user is part of the order
        if ($materialOrder->user_id !== $user->id && ($user->role_type !== 'supplier' || $materialOrder->supplier_id !== $user->supplier->id)) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json([
            'success' => true,
            'data' => $materialOrder->load(['supplier', 'user', 'project', 'items.material']),
        ]);
    }

    public function update(Request $request, MaterialOrder $materialOrder)
    {
        $user = Auth::user();
        $isSupplier = $user->role_type === 'supplier' && $materialOrder->supplier_id === $user->supplier?->id;
        $isBuyer = $materialOrder->user_id === $user->id;

        $validated = $request->validate([
            'status' => 'required|in:pending,processing,ready_for_pickup,awaiting_payment,paid,shipping,delivered,completed,cancelled',
            'notes' => 'nullable|string',
            'delivery_documentation' => 'nullable|image|max:5120', // Max 5MB
        ]);

        $newStatus = $validated['status'];

        // Authorization Rules:
        // 1. Suppliers can update to any status except 'completed' (unless they are also the buyer)
        // 2. Buyers can ONLY update to 'completed' and ONLY if the status is currently 'delivered'
        if ($isBuyer && $newStatus === 'completed' && $materialOrder->status === 'delivered') {
            // Authorized
        } elseif ($isSupplier) {
            // Authorized (though normally suppliers shouldn't complete the order, the buyer should)
        } else {
            return response()->json(['message' => 'Unauthorized to update this status'], 403);
        }

        $updateData = [
            'status' => $validated['status'],
        ];

        if ($validated['status'] === 'paid' && ! $materialOrder->paid_at) {
            $updateData['paid_at'] = now();
        } elseif ($validated['status'] === 'ready_for_pickup' && ! $materialOrder->ready_for_pickup_at) {
            $updateData['ready_for_pickup_at'] = now();
        } elseif ($validated['status'] === 'shipping' && ! $materialOrder->shipped_at) {
            $updateData['shipped_at'] = now();
        } elseif ($validated['status'] === 'delivered' && ! $materialOrder->delivered_at) {
            $updateData['delivered_at'] = now();
        } elseif ($validated['status'] === 'completed' && ! $materialOrder->completed_at) {
            $updateData['completed_at'] = now();
        }

        if ($request->has('notes')) {
            $updateData['notes'] = $validated['notes'];
        }

        if ($request->hasFile('delivery_documentation')) {
            $path = $request->file('delivery_documentation')->store('delivery_docs', 'public');
            $updateData['delivery_documentation_path'] = $path;
        }

        $oldStatus = $materialOrder->status;
        $materialOrder->update($updateData);

        // --- STAGE 2: INVENTORY SYNC ---
        // If status changed to 'delivered', sync to project site inventory
        if ($newStatus === 'delivered' && $oldStatus !== 'delivered') {
            foreach ($materialOrder->items as $item) {
                if ($item->requirement_id) {
                    $requirement = \App\Models\ProjectRequirement::find($item->requirement_id);
                    if ($requirement) {
                        $requirement->increment('quantity_on_site', $item->quantity);
                    }
                }
            }
        }

        // Handle Stock Management
        $decrementStatuses = ['paid', 'processing', 'ready_for_pickup', 'shipping', 'delivered', 'completed'];
        if (in_array($validated['status'], $decrementStatuses)) {
            $this->orderService->decrementStock($materialOrder);
        } elseif ($validated['status'] === 'cancelled') {
            $this->orderService->incrementStock($materialOrder);
        }

        return response()->json([
            'success' => true,
            'message' => 'Order updated successfully.',
            'data' => $materialOrder->load(['supplier', 'user', 'project', 'items.material', 'items.requirement']),
        ]);
    }
}
