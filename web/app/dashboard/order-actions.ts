'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Move a material order through its lifecycle.
 *
 * The API is `PUT/PATCH /material-orders/{id}`, but a multipart body must be a
 * POST with `_method=PUT` (PHP does not parse multipart on PUT). One action
 * therefore serves both JSON-only transitions and the dispatch-documentation
 * upload. The controller owns the role/state gate: supplier pending→processing,
 * processing→shipping (or ready_for_pickup for platform courier), shipping→
 * delivered; buyer delivered→completed and pre-processing cancellation.
 */
export async function updateOrderStatus(formData: FormData): Promise<void> {
    const id = Number(formData.get('order_id'));
    const status = String(formData.get('status') ?? '');
    const allowed = [
        'pending',
        'processing',
        'ready_for_pickup',
        'awaiting_payment',
        'paid',
        'shipping',
        'delivered',
        'completed',
        'cancelled',
    ];

    if (!Number.isInteger(id) || id <= 0 || !allowed.includes(status)) {
        return;
    }

    const body = new FormData();
    body.set('_method', 'PUT');
    body.set('status', status);

    const notes = String(formData.get('notes') ?? '').trim();
    if (notes !== '') {
        body.set('notes', notes);
    }

    const documentation = formData.get('delivery_documentation');
    if (documentation instanceof File && documentation.size > 0) {
        body.set('delivery_documentation', documentation);
    }

    try {
        await apiFetch(`/material-orders/${id}`, { method: 'POST', body });
    } catch (error) {
        if (error instanceof ApiFailure) {
            redirect(`/dashboard/orders?error=${encodeURIComponent(error.message)}`);
        }

        throw error;
    }

    revalidatePath('/dashboard/orders');
    revalidatePath('/dashboard/material-orders');
}

/**
 * Verify the buyer's transfer receipt and mark the order paid.
 *
 * Supplier-only; the controller refuses orders with no proof, refunded/cancelled
 * orders, and funnels the money through the ledger (project-linked orders) and
 * the dispute freeze. The UI exposes it only while a proof exists and the order
 * has not moved past payment.
 */
export async function verifyOrderPayment(formData: FormData): Promise<void> {
    const id = Number(formData.get('order_id'));

    if (!Number.isInteger(id) || id <= 0) {
        return;
    }

    try {
        await apiFetch(`/material-orders/${id}/verify-payment`, { method: 'POST' });
    } catch (error) {
        if (error instanceof ApiFailure) {
            redirect(`/dashboard/orders?error=${encodeURIComponent(error.message)}`);
        }

        throw error;
    }

    revalidatePath('/dashboard/orders');
    revalidatePath('/dashboard/material-orders');
    revalidatePath('/dashboard');
}
