<?php

namespace App\Http\Controllers;

use App\Models\MaterialQuote;
use App\Models\Project;
use App\Services\DisputeService;
use App\Services\ProjectFinancialService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

class MaterialQuoteController extends Controller
{
    public function index()
    {
        $user = Auth::user();
        $query = MaterialQuote::with(['supplier', 'project', 'user']);

        // Enhanced visibility: if user is a supplier, show both quotes they SENT and quotes they RECEIVED
        if ($user->role_type === 'supplier' && $user->supplier) {
            $query->where(function ($q) use ($user) {
                $q->where('supplier_id', $user->supplier->id)
                    ->orWhere('user_id', $user->id);
            });
        } else {
            // Regular users only see quotes they sent
            $query->where('user_id', $user->id);
        }

        $quotes = $query->orderBy('created_at', 'desc')->limit(100)->get();

        return response()->json([
            'success' => true,
            'data' => $quotes,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'supplier_id' => 'required|exists:suppliers,id',
            'project_id' => 'nullable|exists:projects,id',
            'items' => 'required|array',
            'items.*.material_id' => 'required|exists:materials,id',
            'items.*.name' => 'required|string',
            'items.*.price_at_quote' => 'required|numeric',
            'items.*.qty' => 'required|numeric|min:1',
            'items.*.unit' => 'required|string',
            'items.*.requirement_id' => 'nullable|exists:project_requirements,id',
            'delivery_address' => 'required|string',
            'address_detail' => 'nullable|string',
            'note' => 'nullable|string',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
            'delivery_method' => 'nullable|string',
        ]);

        $totalAmount = collect($validated['items'])->sum(function ($item) {
            return $item['price_at_quote'] * $item['qty'];
        });

        // L6 FIX: a quote may only be linked to a project the requester owns
        // (or where they are an active sub-professional) — otherwise any user
        // could forge a link to someone else's project.
        if (!empty($validated['project_id'])) {
            $ownsProject = \App\Models\Project::where('id', $validated['project_id'])
                ->where('user_id', Auth::id())
                ->exists();
            $isSubPro = \App\Models\ProjectSubProfessional::where('project_id', $validated['project_id'])
                ->where('user_id', Auth::id())
                ->where('status', 'active')
                ->exists();
            if (!$ownsProject && !$isSubPro) {
                return response()->json(['success' => false, 'message' => 'You can only request quotes for your own projects.'], 403);
            }
        }

        $quote = MaterialQuote::create([
            'user_id' => Auth::id(),
            'supplier_id' => $validated['supplier_id'],
            'project_id' => $validated['project_id'] ?? null,
            'items' => $validated['items'],
            'delivery_address' => $validated['delivery_address'],
            'address_detail' => $validated['address_detail'] ?? null,
            'delivery_method' => $validated['delivery_method'] ?? 'Supplier Fleet',
            'total_amount' => $totalAmount,
            'status' => 'pending',
            'note' => $validated['note'] ?? null,
            'latitude' => $validated['latitude'] ?? null,
            'longitude' => $validated['longitude'] ?? null,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Quote request recorded successfully.',
            'data' => $quote->load(['supplier', 'project']),
        ], 201);
    }

    public function requestPayment(Request $request, MaterialQuote $quote)
    {
        $user = Auth::user();
        if ($user->role_type !== 'supplier' || !$user->supplier || $quote->supplier_id !== $user->supplier->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'shipping_cost' => 'required|numeric|min:0',
            'delivery_method' => 'required|string',
            'total_weight' => 'nullable|string',
        ]);

        $quote->update([
            'shipping_cost' => $validated['shipping_cost'],
            'delivery_method' => $validated['delivery_method'],
            'total_weight' => $validated['total_weight'] ?? $quote->total_weight,
            'status' => 'awaiting_payment',
        ]);

        return response()->json(['success' => true, 'message' => 'Payment requested from buyer.', 'data' => $quote]);
    }

    /**
     * The BUYER uploads a transfer receipt for the quote.
     *
     * Added 2026-09-29. `markAsPaid` had always required a `payment_proof_path`
     * — correctly, since a supplier must not self-declare its own quote paid —
     * but `material_quotes` had no such column and nothing wrote one. The guard
     * therefore blocked the only payment transition a quote had, and a material
     * quote could never be paid at all.
     *
     * The equivalent ORDER flow already worked this way (buyer uploads,
     * supplier confirms in `verifyPayment`). This brings the quote flow onto the
     * same footing rather than weakening the guard that was right.
     */
    public function uploadPaymentProof(Request $request, MaterialQuote $quote)
    {
        $user = Auth::user();

        // Only the buyer, or the PM acting for the project, may attach a receipt.
        $isPm = $user->role_type === 'project_manager'
            && $quote->project
            && (int) $quote->project->pm_id === (int) $user->id;

        if ($quote->user_id !== $user->id && !$isPm) {
            return response()->json(['message' => 'Only the buyer can upload a payment proof.'], 403);
        }

        // `awaiting_payment` is the only state where a payment is expected. Once
        // the supplier has confirmed, a second receipt is not a correction — it
        // is an attempt to re-open a settled payment.
        if ($quote->status !== 'awaiting_payment') {
            return response()->json([
                'message' => "This quote is not awaiting payment (current: {$quote->status}).",
            ], 422);
        }

        $validated = $request->validate([
            'payment_proof' => 'required|file|mimes:jpg,jpeg,png,webp,pdf|max:5120',
        ]);

        // PRIVATE vault disk, NOT `public`.
        //
        // A bank transfer receipt exposes account numbers, the payer's name and
        // often a running balance. The ORDER flow stored these on the
        // world-readable `public` disk, so a receipt URL was guessable or
        // shareable and stayed live forever. See the sibling method below for
        // the same change applied to orders.
        $path = $validated['payment_proof']->store(
            'payment_proofs',
            config('filesystems.vault_disk', 'railway')
        );

        $quote->update(['payment_proof_path' => $path]);

        \App\Models\Notification::create([
            'user_id' => $quote->supplier->user_id,
            'type' => 'quote_payment_proof',
            'title' => 'Payment Proof Uploaded',
            'body' => "The buyer uploaded a payment proof for quote #{$quote->id}. Please verify it to proceed.",
            'data' => ['material_quote_id' => $quote->id],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Payment proof uploaded. Waiting for supplier verification.',
            'data' => $quote->fresh(),
        ]);
    }

    /**
     * The SUPPLIER confirms the buyer's proof — the transition that actually
     * moves the money.
     *
     * 2026-09-29. This previously set `status = 'paid'` and stopped. On a
     * project-bound quote that meant:
     *
     *   * no `project_budget_transactions` row, so the disbursement was invisible
     *     to `available`, to `paidTotal` and to every financial figure — while
     *     the quote's own ORDER counterpart already posted to the ledger;
     *   * no dispute freeze, so money kept moving on a project under arbitration;
     *   * no affordability check, so a quote could commit escrow the project
     *     did not hold.
     *
     * Mirrors MaterialOrderController::verifyPayment so the two procurement
     * paths cannot diverge a third time.
     */
    public function markAsPaid(Request $request, MaterialQuote $quote)
    {
        $user = Auth::user();
        if ($user->role_type !== 'supplier' || !$user->supplier || $quote->supplier_id !== $user->supplier->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // SECURITY: a supplier could self-declare its own quote paid with no
        // money ever transferred. Keep the guard; it is now satisfiable because
        // uploadPaymentProof exists.
        if (empty($quote->payment_proof_path)) {
            return response()->json([
                'message' => 'A payment proof is required before this quote can be marked as paid.',
            ], 422);
        }

        if ($quote->status === 'paid') {
            return response()->json([
                'message' => 'This quote has already been marked as paid.',
            ], 422);
        }

        $notes = $request->validate([
            'payment_notes' => 'nullable|string|max:1000',
        ])['payment_notes'] ?? null;

        // total_amount + shipping_cost, exactly as the ORDER flow charges, and
        // as exact integer minor units rather than two floats.
        $amount = Money::fromColumn($quote->total_amount)
            ->add(Money::fromColumn($quote->shipping_cost));

        try {
            $project = $quote->project_id ? Project::find($quote->project_id) : null;

            if ($project) {
                // Frozen while a dispute is open.
                app(DisputeService::class)->assertNoOpenDispute($project);

                $financial = app(ProjectFinancialService::class);

                if ($amount->isPositive() && ! $financial->recordPayment(
                    $project,
                    $amount,
                    "Payment: Material Quote #{$quote->id}",
                    MaterialQuote::class,
                    $quote->id
                )) {
                    return response()->json([
                        'message' => 'Project budget is insufficient for this material payment. Available: Rp '
                            .number_format($financial->available($project), 0, ',', '.').'.',
                    ], 422);
                }
            }

            $quote->update([
                'status' => 'paid',
                'paid_at' => now(),
                'payment_verified_by' => $user->id,
                'payment_verified_at' => now(),
                'payment_notes' => $notes,
            ]);
        } catch (\Exception $e) {
            Log::error('Material quote payment confirmation failed', [
                'quote_id' => $quote->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Quote marked as paid.',
            'data' => $quote->fresh(),
        ]);
    }

    public function postDeliveryJob(Request $request, MaterialQuote $quote)
    {
        $user = Auth::user();
        if ($user->role_type !== 'supplier' || !$user->supplier || $quote->supplier_id !== $user->supplier->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'shipping_cost' => 'required|numeric|min:0',
            'total_weight' => 'nullable|string|max:100',
            'internal_notes' => 'nullable|string',
        ]);

        \DB::beginTransaction();
        try {
            $quote->update([
                'delivery_method' => 'Hire Platform Courier',
                'shipping_cost' => $validated['shipping_cost'],
                'total_weight' => $validated['total_weight'] ?? $quote->total_weight,
                'status' => 'awaiting_courier',
            ]);

            \DB::table('delivery_jobs')->insert([
                'quote_id' => $quote->id,
                'pickup_address' => ($user->supplier->store_name ?? 'Store').' — '.($user->supplier->address ?? 'No address set').($user->supplier->detail_location ? ' ('.$user->supplier->detail_location.')' : ''),
                'dropoff_address' => $quote->delivery_address,
                'agreed_fee' => $validated['shipping_cost'],
                'estimated_weight' => $validated['total_weight'] ?? $quote->total_weight,
                'status' => 'pending',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            \DB::commit();

            return response()->json(['success' => true, 'message' => 'Delivery job posted.', 'data' => $quote]);
        } catch (\Exception $e) {
            \DB::rollBack();

            return response()->json(['message' => 'Failed to post job.'], 500);
        }
    }

    public function approve(Request $request, MaterialQuote $quote)
    {
        $user = Auth::user();
        if ($user->role_type !== 'supplier' || !$user->supplier || $quote->supplier_id !== $user->supplier->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'shipping_cost' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'delivery_method' => 'nullable|string',
            'total_weight' => 'nullable|string',
        ]);

        $shippingCost = $validated['shipping_cost'] ?? $quote->shipping_cost ?? 0;
        $deliveryMethod = $validated['delivery_method'] ?? $quote->delivery_method ?? 'Supplier Delivery';

        if ($quote->status === 'approved') {
            return response()->json(['message' => 'Quote already approved'], 422);
        }

        \DB::beginTransaction();
        try {
            // RACE GUARD: re-check INSIDE the transaction with a row lock so two
            // concurrent approvals cannot both pass the pre-check and create
            // duplicate orders + delivery jobs.
            $freshQuote = \App\Models\MaterialQuote::where('id', $quote->id)->lockForUpdate()->first();
            if (!$freshQuote || $freshQuote->status === 'approved') {
                \DB::rollBack();
                return response()->json(['message' => 'Quote already approved'], 422);
            }
            $quote = $freshQuote;

            // 1. Update Quote Status
            $quote->update(['status' => 'approved']);

            $distanceKm = 0;
            $calculatedShippingCost = $shippingCost;

            if ($deliveryMethod === 'Hire Platform Courier' && $quote->latitude && $quote->longitude && $user->supplier->latitude && $user->supplier->longitude) {
                // Haversine Formula for Distance Calculation
                $lat1 = deg2rad($user->supplier->latitude);
                $lon1 = deg2rad($user->supplier->longitude);
                $lat2 = deg2rad($quote->latitude);
                $lon2 = deg2rad($quote->longitude);

                $dLat = $lat2 - $lat1;
                $dLon = $lon2 - $lon1;

                $a = sin($dLat / 2) * sin($dLat / 2) + cos($lat1) * cos($lat2) * sin($dLon / 2) * sin($dLon / 2);
                $c = 2 * asin(sqrt($a));
                $radius = 6371; // Earth's radius in km

                $straightDistance = $radius * $c;
                $distanceKm = $straightDistance * 1.3; // 1.3x routing multiplier

                // Pricing Rule: Rp 50.000 for first 5km, Rp 4.000 per extra km
                $baseFee = 50000;
                if ($distanceKm > 5) {
                    $extraDistance = $distanceKm - 5;
                    $calculatedShippingCost = $baseFee + ceil($extraDistance * 4000);
                } else {
                    $calculatedShippingCost = $baseFee;
                }
            }

            // 2. Create formal MaterialOrder
            $order = \App\Models\MaterialOrder::create([
                'user_id' => $quote->user_id,
                'supplier_id' => $quote->supplier_id,
                'project_id' => $quote->project_id,
                'status' => 'pending',
                'total_price' => $quote->total_amount + $calculatedShippingCost,
                'shipping_cost' => $calculatedShippingCost,
                'delivery_method' => $deliveryMethod,
                'whatsapp_order_id' => 'ORD-'.strtoupper(bin2hex(random_bytes(4))),
                'notes' => $validated['notes'] ?? $quote->note,
                'delivery_address' => $quote->delivery_address,
                'address_detail' => $quote->address_detail,
                'latitude' => $quote->latitude,
                'longitude' => $quote->longitude,
                'total_weight' => $validated['total_weight'] ?? $quote->total_weight,
            ]);

            // 3. Create items from Quote items JSON
            foreach ($quote->items as $item) {
                \App\Models\MaterialOrderItem::create([
                    'order_id' => $order->id,
                    'material_id' => $item['material_id'],
                    'requirement_id' => $item['requirement_id'] ?? null,
                    'quantity' => $item['qty'],
                    'price_at_order' => $item['price_at_quote'],
                ]);
            }

            // 4. If Platform Delivery, automatically queue the DeliveryJob for Couriers
            if ($deliveryMethod === 'Hire Platform Courier') {
                \DB::table('delivery_jobs')->insert([
                    'quote_id' => $quote->id,
                    'order_id' => $order->id,
                    'pickup_address' => ($user->supplier->store_name ?? 'Store').' — '.($user->supplier->address ?? 'No address set'),
                    'dropoff_address' => $quote->delivery_address,
                    'status' => 'pending',
                    'agreed_fee' => $calculatedShippingCost,
                    'estimated_weight' => $validated['total_weight'] ?? $quote->total_weight ?? 'N/A',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            \DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Quote approved and order created.',
                'order' => $order->load('items.material'),
            ]);
        } catch (\Exception $e) {
            \DB::rollBack();
            \Log::error('Quote approval failed: '.$e->getMessage(), ['exception' => $e]);

            return response()->json(['message' => 'Failed to approve quote. Please try again.'], 500);
        }
    }

    public function getDeliveryJobs(Request $request)
    {
        $user = \Illuminate\Support\Facades\Auth::user();
        if ($user->role_type !== 'supplier') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $jobs = \DB::table('delivery_jobs')
            ->join('material_quotes', 'delivery_jobs.quote_id', '=', 'material_quotes.id')
            ->leftJoin('users as courier', 'delivery_jobs.logistics_id', '=', 'courier.id')
            ->leftJoin('courier_profiles', 'courier.id', '=', 'courier_profiles.user_id')
            ->leftJoin('phone_user', function ($join) {
                $join->on('courier.id', '=', 'phone_user.id_user')
                    ->whereRaw('phone_user.id = (select id from phone_user where id_user = courier.id limit 1)');
            })
            ->where('material_quotes.supplier_id', $user->supplier->id)
            ->select(
                'delivery_jobs.*',
                'material_quotes.delivery_address',
                'material_quotes.total_amount',
                'courier.id as driver_user_id',
                'courier.name as driver_name',
                'phone_user.contact as driver_phone',
                'courier_profiles.vehicle_type',
                'courier_profiles.license_plate'
            )
            ->orderBy('delivery_jobs.created_at', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $jobs]);
    }
}
