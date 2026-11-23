'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * The professional side of the bid lifecycle.
 *
 * These actions keep the browser away from the API's bearer token: the form
 * posts here, `apiFetch` attaches the httpOnly session server-side, and the
 * API's validation message is carried back in the URL.
 */

function failureMessage(error: unknown): string {
    if (error instanceof ApiFailure) {
        const firstField = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
        return firstField ?? error.message;
    }

    return 'The action could not be completed. Please try again.';
}

export async function submitBid(formData: FormData): Promise<void> {
    const projectId = String(formData.get('project_id') ?? '');
    if (!/^\d+$/.test(projectId)) {
        redirect('/dashboard/projects');
    }

    const body = {
        price: String(formData.get('price') ?? '').trim(),
        proposal: String(formData.get('proposal') ?? '').trim(),
        estimated_duration: String(formData.get('estimated_duration') ?? '1').trim(),
        duration_unit: String(formData.get('duration_unit') ?? 'weeks'),
        fee_type: String(formData.get('fee_type') ?? 'fixed'),
    };

    try {
        await apiFetch(`/projects/${projectId}/bids`, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    } catch (error) {
        redirect(`/projects/${projectId}/overview?error=${encodeURIComponent(failureMessage(error))}`);
    }

    revalidatePath(`/projects/${projectId}`);
    revalidatePath('/dashboard/my-bids');
    redirect(`/projects/${projectId}/overview?submitted=1`);
}

async function inviteAction(formData: FormData, action: 'accept' | 'reject'): Promise<void> {
    const projectId = String(formData.get('project_id') ?? '');
    const bidId = String(formData.get('bid_id') ?? '');
    const bidType = String(formData.get('bid_type') ?? '');

    if (!/^\d+$/.test(projectId) || !/^\d+$/.test(bidId) || bidType === '') {
        redirect('/dashboard/my-bids');
    }

    try {
        await apiFetch(`/projects/${projectId}/bids/${bidId}/${action}-invite`, {
            method: 'POST',
            body: JSON.stringify({ bid_type: bidType }),
        });
    } catch (error) {
        redirect(`/dashboard/my-bids?error=${encodeURIComponent(failureMessage(error))}`);
    }

    revalidatePath('/dashboard/my-bids');
    revalidatePath(`/projects/${projectId}`);
    redirect(`/dashboard/my-bids?updated=${action}`);
}

export async function acceptInvite(formData: FormData): Promise<void> {
    await inviteAction(formData, 'accept');
}

export async function rejectInvite(formData: FormData): Promise<void> {
    await inviteAction(formData, 'reject');
}

/**
 * Sign the SPK for an accepted bid. The demo contract is one stage at 100% of
 * the negotiated value; the API accepts any schedule that totals 100%.
 */
export async function signContract(formData: FormData): Promise<void> {
    const projectId = String(formData.get('project_id') ?? '');
    const bidId = String(formData.get('bid_id') ?? '');
    const bidType = String(formData.get('bid_type') ?? '');
    const amount = String(formData.get('amount') ?? '').trim();
    const signature = String(formData.get('signature') ?? '');
    const bankType = String(formData.get('bank_type') ?? '').trim();
    const bankNo = String(formData.get('bank_account_no') ?? '').trim();
    const bankName = String(formData.get('bank_account_name') ?? '').trim();

    if (
        !/^\d+$/.test(projectId) ||
        !/^\d+$/.test(bidId) ||
        bidType === '' ||
        amount === '' ||
        signature === ''
    ) {
        redirect(`/dashboard/my-bids?error=${encodeURIComponent('Draw your signature before signing.')}`);
    }

    try {
        await apiFetch(`/projects/${projectId}/bids/${bidId}/sign-contract`, {
            method: 'POST',
            body: JSON.stringify({
                bid_type: bidType,
                termins: [{ label: 'Full contract value', percentage: '100', amount }],
                milestones: [],
                signature,
                bank_type: bankType,
                bank_account_no: bankNo,
                bank_account_name: bankName,
            }),
        });
    } catch (error) {
        redirect(`/dashboard/my-bids?error=${encodeURIComponent(failureMessage(error))}`);
    }

    revalidatePath('/dashboard/my-bids');
    revalidatePath(`/projects/${projectId}`);
    redirect(`/dashboard/my-bids?updated=signed`);
}
