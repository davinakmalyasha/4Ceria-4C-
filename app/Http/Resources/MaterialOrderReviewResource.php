<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A supplier-facing review, with NOTHING of the buyer's order attached.
 *
 * WHY A RESOURCE AND NOT A SANITISER
 * -----------------------------------
 * `MaterialOrderReviewController::getBySupplier()` eager-loaded
 * `order.items.material` and then hid keys on ONE relation:
 *
 *     $sensitive = ['email', 'bank_account_number', ...];
 *     $reviews->getCollection()->each(fn ($r) => $r->user?->makeHidden($sensitive));
 *
 * Same denylist-on-the-wrong-object shape as the public professional directories.
 * `MaterialOrder` has no `$hidden` at all, so every review carried the buyer's
 * whole order, and therefore, for EVERY buyer of that supplier:
 *
 *   delivery_address    their home or site address
 *   address_detail      the free-text version of it
 *   user_id             the buyer's account id
 *   latitude/longitude  the delivery coordinates
 *   total_price,
 *   shipping_cost       what they paid
 *   whatsapp_order_id   an external messaging thread id
 *   payment_proof_path  a path to their bank transfer receipt
 *   delivery_documentation_path
 *   notes,
 *   verification_notes  the platform's internal assessment of them
 *
 * `GET /api/suppliers/{id}/reviews` is reachable by ANY AUTHENTICATED user, and
 * the reviewer-facing endpoint is not the only consumer of this payload, so this
 * was a disclosure of buyer addresses, coordinates and payment receipts to every
 * other registered account -- a competitor included. It would also widen every
 * time a column was added to `material_orders`.
 *
 * WHAT A REVIEW ACTUALLY IS
 * -------------------------
 * A rating, a comment, optional images, and when it was left. The reviewer's
 * display name is kept because a review without an author is not review, and the
 * order is reduced to the two things a prospective buyer is actually deciding on:
 * what they ordered, and what they paid for it.
 *
 * An ALLOWLIST, so the next column added to `material_orders` is private by
 * default.
 */
class MaterialOrderReviewResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $order = $this->resource->order;

        return [
            'id' => $this->resource->id,
            'rating' => $this->resource->rating,
            'comment' => $this->resource->comment,
            'image_path' => $this->resource->image_path,
            'image_paths' => $this->resource->image_paths,
            'created_at' => $this->resource->created_at,

            // Delivery feedback is part of the review, not the buyer's business.
            'delivery_rating' => $this->resource->delivery_rating,
            'delivery_comment' => $this->resource->delivery_comment,
            'delivery_image_paths' => $this->resource->delivery_image_paths,

            // Display name only. Never email, never account identifiers.
            'reviewer' => $this->when(
                $this->resource->relationLoaded('user') && $this->resource->user,
                fn () => [
                    'id' => $this->resource->user->id,
                    'name' => $this->resource->user->name,
                    'pic' => $this->resource->user->pic,
                ]
            ),

            // ONLY what a prospective buyer needs: what was bought, and what it
            // cost. No address, no coordinates, no receipts, no internal notes.
            'order' => $this->when(
                $order,
                fn () => [
                    // `material_order_items` holds only material_id / quantity /
                    // price_at_order -- the readable name lives on `material`,
                    // which the controller eager-loads. Reading a column that does
                    // not exist throws under shouldBeStrict, so it is read from the
                    // relation rather than assumed.
                    'items' => collect($order->items ?? [])
                        ->map(fn ($item) => [
                            'material_id' => $item->material_id ?? null,
                            'name' => $item->material?->name ?? null,
                            'qty' => $item->quantity ?? null,
                            'price_at_order' => $item->price_at_order ?? null,
                        ])
                        ->all(),
                    'total_price' => $order->total_price,
                ]
            ),
        ];
    }
}