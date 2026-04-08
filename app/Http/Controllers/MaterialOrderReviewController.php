<?php

namespace App\Http\Controllers;

use App\Models\MaterialOrder;
use App\Models\MaterialOrderReview;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;

class MaterialOrderReviewController extends Controller
{
    /**
     * Store a new review for a completed material order.
     */
    public function store(Request $request)
    {
        $user = Auth::user();

        $validator = Validator::make($request->all(), [
            'order_id' => 'required|exists:material_orders,id',
            'rating' => 'required|integer|min:1|max:5',
            'comment' => 'nullable|string|max:1000',
            'delivery_rating' => 'nullable|integer|min:1|max:5',
            'delivery_comment' => 'nullable|string|max:1000',
            'shop_images' => 'nullable|array|max:3',
            'shop_images.*' => 'image|max:5120',
            'delivery_images' => 'nullable|array|max:3',
            'delivery_images.*' => 'image|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $order = MaterialOrder::with('deliveryJob')->findOrFail($request->order_id);

        // Security & Business Rules
        if ($order->user_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $deliveryCompleted = $order->deliveryJob && in_array($order->deliveryJob->status, ['delivered', 'completed']);
        if (!in_array($order->status, ['delivered', 'completed']) && !$deliveryCompleted) {
            return response()->json(['message' => 'Only arrived or completed orders can be reviewed.'], 400);
        }

        // Auto-sync order status if delivery job is done but order status is stale
        if ($deliveryCompleted && !in_array($order->status, ['delivered', 'completed'])) {
            $order->update(['status' => 'delivered', 'delivered_at' => now()]);
        }

        // Check if already reviewed
        $existingReview = MaterialOrderReview::where('order_id', $order->id)->first();
        if ($existingReview) {
            return response()->json(['message' => 'You have already reviewed this order.'], 400);
        }

        return DB::transaction(function () use ($request, $order, $user) {
            $shopImagePaths = [];
            if ($request->hasFile('shop_images')) {
                foreach ($request->file('shop_images') as $file) {
                    $shopImagePaths[] = $file->store('reviews/shop', 'public');
                }
            }

            $deliveryImagePaths = [];
            if ($request->hasFile('delivery_images')) {
                foreach ($request->file('delivery_images') as $file) {
                    $deliveryImagePaths[] = $file->store('reviews/delivery', 'public');
                }
            }

            $review = MaterialOrderReview::create([
                'user_id' => $user->id,
                'supplier_id' => $order->supplier_id,
                'order_id' => $order->id,
                'rating' => $request->rating,
                'comment' => $request->comment,
                'delivery_rating' => $request->delivery_rating,
                'delivery_comment' => $request->delivery_comment,
                'delivery_user_id' => $order->deliveryJob?->logistics_id,
                'image_paths' => $shopImagePaths,
                'delivery_image_paths' => $deliveryImagePaths,
            ]);

            return response()->json([
                'status' => 'success',
                'message' => 'Thank you for your feedback!',
                'data' => $review
            ]);
        });
    }

    /**
     * Get reviews for a specific supplier.
     */
    public function getBySupplier(Request $request, $supplierId)
    {
        $query = MaterialOrderReview::with(['user', 'order.items.material'])
            ->where('supplier_id', $supplierId);

        // Filter by rating (1-5)
        if ($request->rating) {
            $query->where('rating', $request->rating);
        }

        // Filter by image existence
        if ($request->has_images === 'true') {
            $query->whereNotNull('image_paths')->where('image_paths', '!=', '[]');
        }

        // Sorting
        if ($request->sort === 'rating_high') {
            $query->orderBy('rating', 'desc');
        } elseif ($request->sort === 'rating_low') {
            $query->orderBy('rating', 'asc');
        } else {
            $query->latest();
        }

        $reviews = $query->paginate(10);

        return response()->json([
            'status' => 'success',
            'data' => $reviews
        ]);
    }

    /**
     * Update an existing review.
     */
    public function update(Request $request, MaterialOrderReview $materialOrderReview)
    {
        $user = Auth::user();

        // Security: Only owner can update
        if ($materialOrderReview->user_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validator = Validator::make($request->all(), [
            'rating' => 'required|integer|min:1|max:5',
            'comment' => 'nullable|string|max:1000',
            'images' => 'nullable|array|max:3',
            'images.*' => 'image|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        return DB::transaction(function () use ($request, $materialOrderReview) {
            $updateData = [
                'rating' => $request->rating,
                'comment' => $request->comment,
            ];

            if ($request->hasFile('images')) {
                // Delete old images from storage
                if ($materialOrderReview->image_paths) {
                    foreach ($materialOrderReview->image_paths as $path) {
                        Storage::disk('public')->delete($path);
                    }
                }
                
                $imagePaths = [];
                foreach ($request->file('images') as $file) {
                    $imagePaths[] = $file->store('reviews/materials', 'public');
                }
                $updateData['image_paths'] = $imagePaths;
            }

            $materialOrderReview->update($updateData);

            return response()->json([
                'status' => 'success',
                'message' => 'Review updated successfully!',
                'data' => $materialOrderReview
            ]);
        });
    }

    /**
     * Delete a review.
     */
    public function destroy(MaterialOrderReview $materialOrderReview)
    {
        $user = Auth::user();

        // Security: Only owner can delete
        if ($materialOrderReview->user_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Delete all images from storage
        if ($materialOrderReview->image_paths) {
            foreach ($materialOrderReview->image_paths as $path) {
                Storage::disk('public')->delete($path);
            }
        }

        $materialOrderReview->delete();

        return response()->json([
            'status' => 'success',
            'message' => 'Review deleted successfully.'
        ]);
    }
}
