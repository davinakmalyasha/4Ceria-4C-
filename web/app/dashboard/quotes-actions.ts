'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * Material-quote money lifecycle.
 *
 * request-payment and mark-paid are supplier-only; payment-proof is the
 * buyer/PM; approve is the supplier creating the formal order. The API remains
 * the authority on every gate and on the shipping tariff cap.
 */

function fail(error: unknown): never {
    if (error instanceof ApiFailure) {
        redirect(`/dashboard/quotes?error=${encodeURIComponent(error.message)}`);
    }

    throw error;
}

function quoteId(formData: FormData): number | null {
    const id = Number(formData.get('quote_id'));
    return Number.isInteger(id) && id > 0 ? id : null;
}

export async function requestQuotePayment(formData: FormData): Promise<void> {
    const id = quoteId(formData);
    const shipping = String(formData.get('shipping_cost') ?? '').trim();
    const method = String(formData.get('delivery_method') ?? '').trim();
    const weight = String(formData.get('total_weight') ?? '').trim();

    if (id === null || shipping === '' || method === '') {
        return;
    }

    try {
        await apiFetch(`/material-quotes/${id}/request-payment`, {
            method: 'PUT',
            body: JSON.stringify({
                shipping_cost: shipping,
                delivery_method: method,
                total_weight: weight === '' ? null : weight,
            }),
        });
    } catch (error) {
        fail(error);
    }

    revalidatePath('/dashboard/quotes');
}

export async function uploadQuoteProof(formData: FormData): Promise<void> {
    const id = quoteId(formData);
    const proof = formData.get('payment_proof');
    if (id === null || !(proof instanceof File) || proof.size === 0) {
        return;
    }

    const body = new FormData();
    body.set('payment_proof', proof);

    try {
        await apiFetch(`/material-quotes/${id}/payment-proof`, { method: 'POST', body });
    } catch (error) {
        fail(error);
    }

    revalidatePath('/dashboard/quotes');
}

export async function markQuotePaid(formData: FormData): Promise<void> {
    const id = quoteId(formData);
    const notes = String(formData.get('payment_notes') ?? '').trim();
    if (id === null) {
        return;
    }

    const payload: Record<string, unknown> = {};
    if (notes !== '') {
        payload.payment_notes = notes;
    }

    try {
        await apiFetch(`/material-quotes/${id}/mark-paid`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
    } catch (error) {
        fail(error);
    }

    revalidatePath('/dashboard/quotes');
}

export async function approveQuote(formData: FormData): Promise<void> {
    const id = quoteId(formData);
    const shipping = String(formData.get('shipping_cost') ?? '').trim();
    const method = String(formData.get('delivery_method') ?? '').trim();
    const weight = String(formData.get('total_weight') ?? '').trim();
    const notes = String(formData.get('notes') ?? '').trim();

    if (id === null) {
        return;
    }

    const payload: Record<string, unknown> = {};
    if (shipping !== '') payload.shipping_cost = shipping;
    if (method !== '') payload.delivery_method = method;
    if (weight !== '') payload.total_weight = weight;
    if (notes !== '') payload.notes = notes;

    try {
        await apiFetch(`/material-quotes/${id}/approve`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    } catch (error) {
        fail(error);
    }

    revalidatePath('/dashboard/quotes');
    revalidatePath('/dashboard/material-orders');
    revalidatePath('/dashboard/orders');
    revalidatePath('/dashboard/delivery-jobs');
}

/**
 * Hire the platform courier for a quote.
 *
 * `POST /material-quotes/{id}/post-delivery-job` forces
 * `delivery_method = Hire Platform Courier`, moves the quote to
 * `awaiting_courier` and inserts a pending `delivery_jobs` row the courier
 * radar can claim. The supplier may discount below the platform tariff but
 * never exceed it (or the goods value when the platform cannot price it).
 */
export async function postQuoteDeliveryJob(formData: FormData): Promise<void> {
    const id = quoteId(formData);
    const shipping = String(formData.get('shipping_cost') ?? '').trim();
    const weight = String(formData.get('total_weight') ?? '').trim();
    const notes = String(formData.get('internal_notes') ?? '').trim();

    if (id === null || shipping === '') {
        return;
    }

    const payload: Record<string, unknown> = { shipping_cost: shipping };
    if (weight !== '') payload.total_weight = weight;
    if (notes !== '') payload.internal_notes = notes;

    try {
        await apiFetch(`/material-quotes/${id}/post-delivery-job`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    } catch (error) {
        fail(error);
    }

    revalidatePath('/dashboard/quotes');
    revalidatePath('/dashboard/job-radar');
    revalidatePath('/dashboard/delivery-jobs');
}
