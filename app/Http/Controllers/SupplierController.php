<?php

namespace App\Http\Controllers;

use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;

class SupplierController extends Controller
{
    /**
     * Get list of all verified suppliers for the marketplace.
     */
    public function index(Request $request)
    {
        $cacheKey = 'suppliers_list_' . md5(json_encode($request->all()));
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);

        $query = Supplier::with(['user'])
            ->withCount(['materials' => function ($q) {
                $q->where('is_available', true);
            }])
            ->withAvg('reviews', 'rating')
            ->withCount('reviews')
            ->where('verification_status', 'verified');

        if ($request->category) {
            $query->where('category', 'like', '%'.$request->category.'%');
        }

        if ($request->search) {
            $query->where('store_name', 'like', '%'.$request->search.'%');
        }

        $data = $supportsTags
            ? \Illuminate\Support\Facades\Cache::tags(['suppliers'])->remember($cacheKey, 600, function () use ($query) {
                return $query->get();
            })
            : \Illuminate\Support\Facades\Cache::remember($cacheKey, 600, function () use ($query) {
                return $query->get();
            });

        return response()->json([
            'status' => 'success',
            'data' => $data,
        ]);
    }

    /**
     * Get details of a specific supplier.
     */
    public function show($id)
    {
        $supplier = Supplier::with([
            'user',
            'materials' => function ($q) {
                $q->where('is_available', true);
            },
            'materials.images',
            'reviews.user',
        ])
            ->withAvg('reviews', 'rating')
            ->withCount('reviews')
            ->findOrFail($id);

        // SECURITY: this route is unauthenticated — strip owner identity data
        // (email is not in User::$hidden).
        $sensitive = ['email', 'email_verified_at', 'google_id', 'two_factor_secret', 'two_factor_recovery_codes', 'bank_name', 'bank_account_number', 'bank_account_name', 'unique_code'];
        $supplier->user?->makeHidden($sensitive);
        $supplier->reviews->each(fn ($r) => $r->user?->makeHidden($sensitive));

        return response()->json([
            'status' => 'success',
            'data' => $supplier,
        ]);
    }

    /**
     * Get the authenticated supplier's own profile.
     */
    public function getProfile()
    {
        $user = Auth::user();
        if ($user->role_type !== 'supplier') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $supplier = Supplier::where('user_id', $user->id)->first();
        if (! $supplier) {
            // Create a blank profile if it doesn't exist
            $supplier = Supplier::create([
                'user_id' => $user->id,
                'store_name' => $user->name."'s Store",
                'verification_status' => 'pending',
            ]);
        }

        return response()->json([
            'status' => 'success',
            'data' => $supplier,
        ]);
    }

    /**
     * Update the authenticated supplier's profile.
     */
    public function updateProfile(Request $request)
    {
        $user = Auth::user();
        if ($user->role_type !== 'supplier') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $supplier = Supplier::where('user_id', $user->id)->firstOrFail();

        $validator = Validator::make($request->all(), [
            'store_name' => 'required|string|max:255',
            'address' => 'nullable|string',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
            'no_telp' => 'nullable|string|max:20',
            'category' => 'nullable|string|max:255',
            'bio' => 'nullable|string',
            'detail_location' => 'nullable|string',
            'foto' => 'nullable|mimes:jpg,jpeg,png,webp|max:2048',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = $request->only(['store_name', 'address', 'latitude', 'longitude', 'no_telp', 'category', 'bio', 'detail_location']);

        if ($request->hasFile('foto')) {
            $data['foto'] = $request->file('foto')->store('suppliers', 'public');
        }

        $supplier->update($data);

        return response()->json([
            'status' => 'success',
            'message' => 'Profile updated successfully',
            'data' => $supplier,
        ]);
    }
}
