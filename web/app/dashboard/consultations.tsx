import { titleCase } from '@/lib/format';
import { respondConsultation } from './consultation-actions';

/**
 * Native notary consultation inbox.
 *
 * `GET /consultations` returns the bookings where the caller is the client or
 * the booked notary, with both relations loaded. The notary can confirm,
 * complete, reject or reschedule through a server action; the client sees the
 * same list read-only.
 */

export interface ConsultationUser {
    id?: number;
    name?: string | null;
    role_type?: string | null;
}

export interface ConsultationRow {
    id: number;
    notaris_id?: number | null;
    user_id?: number | null;
    schedule_date?: string | null;
    status?: string | null;
    notes?: string | null;
    created_at?: string | null;
    user?: ConsultationUser | null;
    notaris?: { id?: number; user_id?: number | null; user?: ConsultationUser | null } | null;
}

function statusClasses(status: string | null | undefined): string {
    switch (status) {
        case 'confirmed':
        case 'completed':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'cancelled':
            return 'bg-neutral-100 text-neutral-500 border-neutral-200';
        default:
            return 'bg-amber-50 text-amber-700 border-amber-200';
    }
}

function schedule(value: string | null | undefined): string {
    if (!value) return 'Schedule not set';
    return value.slice(0, 16).replace('T', ' ');
}

export function ConsultationsPanel({
    consultations,
    role,
    error,
}: {
    consultations: ConsultationRow[];
    role: string;
    error?: string;
}) {
    const isNotary = role === 'notaris';

    return (
        <div data-native-panel="consultations" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Consultation Requests</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        {isNotary
                            ? 'Bookings clients requested with you, and their schedule state.'
                            : 'Your notary consultation bookings.'}
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {consultations.length} {consultations.length === 1 ? 'booking' : 'bookings'}
                </span>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            {consultations.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-10 text-center">
                    <h2 className="text-sm font-black text-neutral-900">No consultation requests yet</h2>
                    <p className="mt-1 text-xs text-neutral-500">
                        A booking appears here when a client schedules a consultation.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {consultations.map((consultation) => {
                        const client = consultation.user;
                        return (
                            <article
                                key={consultation.id}
                                data-native-consultation={consultation.id}
                                className="bg-white rounded-2xl border border-neutral-200 p-5"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                            Booking #{consultation.id}
                                        </p>
                                        <h2 className="mt-1 text-sm font-black text-neutral-900">
                                            {client?.name ?? 'Client'}
                                        </h2>
                                        <p className="mt-0.5 text-[11px] text-neutral-500">
                                            {schedule(consultation.schedule_date)}
                                        </p>
                                    </div>
                                    <span
                                        className={`shrink-0 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider ${statusClasses(consultation.status)}`}
                                    >
                                        {titleCase(consultation.status)}
                                    </span>
                                </div>

                                {consultation.notes && (
                                    <p className="mt-3 text-[11px] leading-relaxed text-neutral-600 bg-neutral-50 border border-neutral-100 rounded-lg px-3 py-2">
                                        {consultation.notes}
                                    </p>
                                )}

                                {isNotary && (
                                    <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
                                        <div className="flex flex-wrap gap-2">
                                            {consultation.status === 'pending' && (
                                                <>
                                                    <form action={respondConsultation}>
                                                        <input type="hidden" name="id" value={consultation.id} />
                                                        <input type="hidden" name="action" value="confirm" />
                                                        <button
                                                            type="submit"
                                                            className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                                        >
                                                            Confirm
                                                        </button>
                                                    </form>
                                                    <form action={respondConsultation}>
                                                        <input type="hidden" name="id" value={consultation.id} />
                                                        <input type="hidden" name="action" value="reject" />
                                                        <button
                                                            type="submit"
                                                            className="px-3 py-1.5 rounded-lg border border-red-200 text-[10px] font-black uppercase tracking-wider text-red-600 hover:bg-red-50"
                                                        >
                                                            Reject
                                                        </button>
                                                    </form>
                                                </>
                                            )}
                                            {consultation.status === 'confirmed' && (
                                                <form action={respondConsultation}>
                                                    <input type="hidden" name="id" value={consultation.id} />
                                                    <input type="hidden" name="action" value="complete" />
                                                    <button
                                                        type="submit"
                                                        className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                                    >
                                                        Mark completed
                                                    </button>
                                                </form>
                                            )}
                                        </div>

                                        {(consultation.status === 'pending' || consultation.status === 'confirmed') && (
                                            <form action={respondConsultation} className="flex flex-wrap items-end gap-2">
                                                <input type="hidden" name="id" value={consultation.id} />
                                                <input type="hidden" name="action" value="reschedule" />
                                                <label className="block">
                                                    <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                                        Reschedule to
                                                    </span>
                                                    <input
                                                        type="datetime-local"
                                                        name="schedule_date"
                                                        required
                                                        className="mt-1 block rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-800 outline-none focus:border-neutral-900"
                                                    />
                                                </label>
                                                <input
                                                    name="notes"
                                                    placeholder="Optional note"
                                                    className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-800 outline-none focus:border-neutral-900"
                                                />
                                                <button
                                                    type="submit"
                                                    className="px-3 py-1.5 rounded-lg border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                                                >
                                                    Reschedule
                                                </button>
                                            </form>
                                        )}
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
