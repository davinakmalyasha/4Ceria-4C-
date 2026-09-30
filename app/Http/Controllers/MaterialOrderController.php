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

    /**
     * Buyer uploads a transfer receipt for the order. Closes the
     * honor-system gap where suppliers self-declared orders as paid while
     * user-facing docs promised an escrow-style confirm step.
     */
    public function uploadPaymentProof(Request $request, MaterialOrder $materialOrder)
    {
        $user = Auth::user();
        if ($materialOrder->user_id !== $user->id && !(($user->role_type === 'project_manager') && ((int) $materialOrder->project?->pm_id === (int) $user->id))) {
            return response()->json(['message' => 'Only the buyer can upload a payment proof.'], 403);
        }

        if (!in_array($materialOrder->status, ['pending', 'awaiting_payment'])) {
            return response()->json(['message' => "This order is not awaiting payment (current: {$materialOrder->status})."], 422);
        }

        $validated = $request->validate([
            'payment_proof' => 'required|file|mimes:jpg,jpeg,png,webp,pdf|max:5120',
        ]);

        // PRIVATE vault disk, NOT `public` (2026-09-29).
        //
        // A bank transfer receipt exposes account numbers, the payer's name and
        // often a running balance. These were being written to the
        // world-readable `public` disk, so a receipt URL was guessable or
        // shareable and stayed live indefinitely. The project-document path
        // already used `vault_disk` for exactly this class of file.
        $path = $request->file('payment_proof')->store(
            'payment_proofs',
            config('filesystems.vault_disk', 'railway')
        );
        $materialOrder->update([
            'payment_proof_path' => $path,
        ]);

        \App\Models\Notification::create([
            'user_id' => $materialOrder->supplier->user_id,
            'type' => 'order_payment_proof',
            'title' => 'Payment Proof Uploaded',
            'body' => "The buyer uploaded a payment proof for order #{$materialOrder->id}. Please verify it to proceed.",
            'data' => ['material_order_id' => $materialOrder->id],
        ]);

        return response()->json(['success' => true, 'message' => 'Payment proof uploaded. Waiting for supplier verification.', 'data' => $materialOrder]);
    }

    /**
     * Supplier verifies the uploaded proof and marks the order paid.
     *
     * 2026-09-23: this transition wrote NO `project_budget_transactions` row
     * and never consulted the dispute freeze, so (a) material procurement was
     * completely invisible to the escrow affordability check and (b) money
     * could keep moving on a project under dispute. Both are now enforced;
     * project-bound orders share the ledger with every other payment.
     */
    public function verifyPayment(MaterialOrder $materialOrder)
    {
        $user = Auth::user();
        if ($user->role_type !== 'supplier' || $materialOrder->supplier_id !== $user->supplier?->id) {
            return response()->json(['message' => 'Only the seller of this order can verify its payment.'], 403);
        }

        if (!$materialOrder->payment_proof_path) {
            return response()->json(['message' => 'No payment proof has been uploaded yet.'], 422);
        }
        if (in_array($materialOrder->status, ['paid', 'shipping', 'delivered', 'completed'])) {
            return response()->json(['message' => 'This order is already marked as paid.'], 422);
        }

        try {
            $project = $materialOrder->project_id
                ? \App\Models\Project::find($materialOrder->project_id)
                : null;

            if ($project) {
                // Payments are frozen while a dispute is open.
                app(\App\Services\DisputeService::class)->assertNoOpenDispute($project);

                $financial = app(\App\Services\ProjectFinancialService::class);
                $amount = (float) ($materialOrder->total_price ?? 0) + (float) ($materialOrder->shipping_cost ?? 0);

                if ($amount > 0 && ! $financial->recordPayment(
                    $project,
                    $amount,
                    "Payment: Material Order #{$materialOrder->id}",
                    'MaterialOrder',
                    $materialOrder->id
                )) {
                    return response()->json([
                        'message' => 'Project budget is insufficient for this material payment. Available: Rp '
                            .number_format($financial->available($project), 0, ',', '.').'.',
                    ], 422);
                }
            }

            $materialOrder->update([
                'status' => 'paid',
                'paid_at' => now(),
            ]);
        } catch (\Exception $e) {
            \Log::error('Material order payment verification failed', [
                'order_id' => $materialOrder->id,
                'error' => $e->getMessage(),
            ]);

            $code = (int) $e->getCode();
            if ($code >= 400 && $code < 600) {
                return response()->json(['message' => $e->getMessage()], $code);
            }

            return response()->json(['success' => false, 'message' => 'Payment verification failed.'], 500);
        }

        $this->orderService->decrementStock($materialOrder);

        if ($materialOrder->user_id !== $user->id) {
            \App\Models\Notification::create([
                'user_id' => $materialOrder->user_id,
                'type' => 'payment_verified',
                'title' => 'Material Payment Verified',
                "body" => "Your payment for order #{$materialOrder->id} has been verified. Processing will begin shortly.",
                'data' => ['material_order_id' => $materialOrder->id],
            ]);
        }

        return response()->json(['success' => true, 'message' => 'Payment verified.', 'data' => $materialOrder]);
    }

    public function update(Request $request, MaterialOrder $materialOrder)
    {
        $user = Auth::user();
        $isSupplier = $user->role_type === 'supplier' && $materialOrder->supplier_id === $user->supplier?->id;
        $isBuyer = $materialOrder->user_id === $user->id;

        $validated = $request->validate([
            'status' => 'required|in:pending,processing,ready_for_pickup,awaiting_payment,paid,shipping,delivered,completed,cancelled',
            'notes' => 'nullable|string',
            'delivery_documentation' => 'nullable|mimes:jpg,jpeg,png,webp|max:5120', // Max 5MB; explicit mimes — SVG rejected (stored XSS)
        ]);

        $newStatus = $validated['status'];

        // Authorization Rules:
        // 1. Suppliers can update to any status except 'completed' (unless they are also the buyer)
        // 2. Buyers can complete after delivery, or cancel BEFORE processing
        // 3. 'paid' now requires an uploaded proof (verifyPayment is preferred);
        //    suppliers can no longer blind-self-declare payment
        if ($isBuyer && $newStatus === 'completed' && $materialOrder->status === 'delivered') {
            // Authorized
        } elseif ($isBuyer && $newStatus === 'cancelled' && in_array($materialOrder->status, ['pending', 'awaiting_payment'])) {
            // Authorized: pre-processing cancellation
        } elseif ($isSupplier && $newStatus === 'cancelled' && in_array($materialOrder->status, ['pending', 'awaiting_payment', 'processing'])) {
            // Supplier may cancel an unshipped order
        } elseif ($isSupplier && $newStatus !== 'paid') {
            // Authorized (though normally suppliers shouldn't complete the order, the buyer should)
        } elseif ($isSupplier && $newStatus === 'paid' && $materialOrder->payment_proof_path) {
            // Verifying an uploaded proof
        } else {
            return response()->json(['message' => 'Unauthorized to update this status'], 403);
        }

        // 2026-09-23: the status route can also flip an order to 'paid', which
        // bypassed the ledger and the dispute freeze that verifyPayment now
        // enforces. Funnel it through the same single path so exactly one
        // ledger row can ever exist for an order.
        if ($validated['status'] === 'paid' && $materialOrder->status !== 'paid') {
            if ($materialOrder->payment_proof_path) {
                return $this->verifyPayment($materialOrder);
            }

            return response()->json(['message' => 'A payment proof is required to mark this order paid.'], 422);
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
