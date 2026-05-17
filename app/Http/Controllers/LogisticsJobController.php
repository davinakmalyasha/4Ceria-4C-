<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class LogisticsJobController extends Controller
{
    public function availableJobs()
    {
        $user = Auth::user();
        if ($user->role_type !== 'logistics') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Fetch jobs that are pending
        $jobs = DB::table('delivery_jobs')
            ->join('material_quotes', 'delivery_jobs.quote_id', '=', 'material_quotes.id')
            ->where('delivery_jobs.status', 'pending')
            ->select('delivery_jobs.*', 'material_quotes.delivery_address', 'material_quotes.total_amount', 'material_quotes.total_weight', 'material_quotes.note')
            ->orderBy('delivery_jobs.created_at', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $jobs]);
    }

    public function acceptJob($id)
    {
        $user = Auth::user();
        if ($user->role_type !== 'logistics') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $job = DB::table('delivery_jobs')->where('id', $id)->first();
        if (! $job || $job->status !== 'pending') {
            return response()->json(['message' => 'Job no longer available or not found.'], 404);
        }

        DB::beginTransaction();
        try {
            DB::table('delivery_jobs')->where('id', $id)->update([
                'status' => 'accepted',
                'logistics_id' => $user->id,
                'updated_at' => now(),
            ]);

            DB::table('material_quotes')->where('id', $job->quote_id)->update([
                'status' => 'awaiting_payment', // Optional: move quote to next stage if it isn't an order yet.
                // Wait: the formal flow is quote->order. Before order, it's quote. If driver accepts, the buyer needs to pay. So awaiting_payment is correct for Self Order/Platform.
            ]);

            DB::commit();

            return response()->json(['success' => true, 'message' => 'Job accepted successfully.']);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json(['message' => 'Failed to accept job.'], 500);
        }
    }

    public function dashboardStats()
    {
        $user = Auth::user();
        if ($user->role_type !== 'logistics') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $available = DB::table('delivery_jobs')->where('status', 'pending')->count();
        $accepted = DB::table('delivery_jobs')->where('logistics_id', $user->id)->where('status', 'accepted')->count();
        $completed = DB::table('delivery_jobs')->where('logistics_id', $user->id)->whereIn('status', ['delivered', 'completed'])->count();
        $totalEarnings = DB::table('delivery_jobs')->where('logistics_id', $user->id)->whereIn('status', ['delivered', 'completed'])->sum('agreed_fee');

        $recentJobs = DB::table('delivery_jobs')
            ->where(function ($q) use ($user) {
                $q->where('logistics_id', $user->id)->orWhere('status', 'pending');
            })
            ->orderBy('created_at', 'desc')
            ->limit(5)
            ->get();

        return response()->json([
            'success' => true,
            'stats' => [
                'available' => $available,
                'accepted' => $accepted,
                'completed' => $completed,
                'totalEarnings' => (float) $totalEarnings,
            ],
            'recentJobs' => $recentJobs,
        ]);
    }

    public function myJobs()
    {
        $user = Auth::user();
        if ($user->role_type !== 'logistics') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $jobs = DB::table('delivery_jobs')
            ->join('material_quotes', 'delivery_jobs.quote_id', '=', 'material_quotes.id')
            ->join('suppliers', 'material_quotes.supplier_id', '=', 'suppliers.id')
            ->where('delivery_jobs.logistics_id', $user->id)
            ->select(
                'delivery_jobs.*',
                'material_quotes.delivery_address',
                'material_quotes.latitude as dropoff_lat',
                'material_quotes.longitude as dropoff_lng',
                'material_quotes.address_detail as dropoff_detail',
                'suppliers.latitude as pickup_lat',
                'suppliers.longitude as pickup_lng',
                'suppliers.detail_location as pickup_detail'
            )
            ->orderBy('delivery_jobs.updated_at', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $jobs]);
    }

    public function updateStatus(Request $request, $id)
    {
        $user = Auth::user();
        if ($user->role_type !== 'logistics') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'status' => 'required|string|in:accepted,picked_up,delivered',
            'photos' => 'nullable|array|min:1|max:3',
            'photos.*' => 'image|max:5120', // Max 5MB per image
        ]);

        $job = DB::table('delivery_jobs')->where('id', $id)->where('logistics_id', $user->id)->first();
        if (! $job) {
            return response()->json(['message' => 'Job not found or not assigned to you.'], 404);
        }

        $updateData = [
            'status' => $validated['status'],
            'updated_at' => now(),
        ];

        if ($request->hasFile('photos')) {
            $paths = [];
            $folder = $validated['status'] === 'picked_up' ? 'pickup' : 'dropoff';
            foreach ($request->file('photos') as $photo) {
                $path = $photo->store("deliveries/{$folder}", 'public');
                $paths[] = $path;
            }

            if ($validated['status'] === 'picked_up') {
                $updateData['pickup_photos'] = json_encode($paths);
            } elseif ($validated['status'] === 'delivered') {
                $updateData['delivery_photos'] = json_encode($paths);
            }
        }

        DB::table('delivery_jobs')->where('id', $id)->update($updateData);

        return response()->json([
            'success' => true,
            'message' => 'Job status updated to '.$validated['status'],
            'photos' => $paths ?? [],
        ]);
    }
}
