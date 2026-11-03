'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';

/**
 * The hiring decisions available from the interviews board.
 *
 * Shortlist/accept/decline take `{bid_id, bid_type}`; a project-manager bid uses
 * its own `/pm-bids/{id}` endpoints (owner-only). Recommendation is the
 * lead-professional flow and needs the SUB-PROFESSIONAL row, not the bid id, so
 * the panel resolves it by bidder before rendering the form.
 */

function fail(projectId: string, error: unknown): never {
    if (error instanceof ApiFailure) {
        redirect(`/projects/${projectId}/interviews?error=${encodeURIComponent(error.message)}`);
    }

    throw error;
}

function readBid(formData: FormData): { projectId: string; bidId: number; bidType: string } | null {
    const projectId = String(formData.get('project_id') ?? '');
    const bidId = Number(formData.get('bid_id'));
    const bidType = String(formData.get('bid_type') ?? '');
    const allowed = ['arsitek', 'kontraktor', 'notaris', 'interior', 'structural', 'mep', 'project_manager'];

    if (!/^\d+$/.test(projectId) || !Number.isInteger(bidId) || bidId <= 0 || !allowed.includes(bidType)) {
        return null;
    }

    return { projectId, bidId, bidType };
}

export async function shortlistBid(formData: FormData): Promise<void> {
    const bid = readBid(formData);
    if (!bid) return;

    try {
        await apiFetch(`/projects/${bid.projectId}/shortlist-bid`, {
            method: 'POST',
            body: JSON.stringify({ bid_id: bid.bidId, bid_type: bid.bidType }),
        });
    } catch (error) {
        fail(bid.projectId, error);
    }

    revalidatePath(`/projects/${bid.projectId}/interviews`);
    revalidatePath(`/projects/${bid.projectId}/proposals`);
    revalidatePath(`/projects/${bid.projectId}/overview`);
}

export async function acceptBid(formData: FormData): Promise<void> {
    const bid = readBid(formData);
    if (!bid) return;

    try {
        if (bid.bidType === 'project_manager') {
            await apiFetch(`/projects/${bid.projectId}/pm-bids/${bid.bidId}/accept`, { method: 'POST' });
        } else {
            await apiFetch(`/projects/${bid.projectId}/accept-bid`, {
                method: 'POST',
                body: JSON.stringify({ bid_id: bid.bidId, bid_type: bid.bidType }),
            });
        }
    } catch (error) {
        fail(bid.projectId, error);
    }

    revalidatePath(`/projects/${bid.projectId}/interviews`);
    revalidatePath(`/projects/${bid.projectId}/proposals`);
    revalidatePath(`/projects/${bid.projectId}/overview`);
}

export async function declineBid(formData: FormData): Promise<void> {
    const bid = readBid(formData);
    if (!bid) return;

    try {
        if (bid.bidType === 'project_manager') {
            await apiFetch(`/projects/${bid.projectId}/pm-bids/${bid.bidId}/decline`, { method: 'POST' });
        } else {
            await apiFetch(`/projects/${bid.projectId}/decline-bid`, {
                method: 'POST',
                body: JSON.stringify({ bid_id: bid.bidId, bid_type: bid.bidType }),
            });
        }
    } catch (error) {
        fail(bid.projectId, error);
    }

    revalidatePath(`/projects/${bid.projectId}/interviews`);
    revalidatePath(`/projects/${bid.projectId}/proposals`);
    revalidatePath(`/projects/${bid.projectId}/overview`);
}

export async function recommendSpecialist(formData: FormData): Promise<void> {
    const projectId = String(formData.get('project_id') ?? '');
    const subId = Number(formData.get('sub_id'));
    const feeText = String(formData.get('suggested_fee') ?? '').trim();
    const notes = String(formData.get('lead_pro_notes') ?? '').trim();

    if (!/^\d+$/.test(projectId) || !Number.isInteger(subId) || subId <= 0 || feeText === '' || notes === '') {
        return;
    }

    try {
        await apiFetch(`/projects/${projectId}/sub-professionals/${subId}/recommend`, {
            method: 'POST',
            body: JSON.stringify({ suggested_fee: feeText, lead_pro_notes: notes }),
        });
    } catch (error) {
        fail(projectId, error);
    }

    revalidatePath(`/projects/${projectId}/interviews`);
    revalidatePath(`/projects/${projectId}/proposals`);
    revalidatePath(`/projects/${projectId}/engineering`);
}
