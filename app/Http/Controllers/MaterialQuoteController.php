<?php

namespace App\Http\Controllers;

use App\Models\MaterialQuote;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

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

        $quotes = $query->orderBy('created_at', 'desc')->get();

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

    public function markAsPaid(Request $request, MaterialQuote $quote)
    {
        $user = Auth::user();
        if ($user->role_type !== 'supplier' || !$user->supplier || $quote->supplier_id !== $user->supplier->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $quote->update(['status' => 'paid']);

        return response()->json(['success' => true, 'message' => 'Quote marked as paid.', 'data' => $quote]);
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

            return response()->json(['message' => 'Failed to approve quote: '.$e->getMessage()], 500);
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
