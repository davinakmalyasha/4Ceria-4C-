import { formatIDR, titleCase } from '@/lib/format';

/**
 * Native payments panel.
 *
 * `GET /projects/{id}/payment-termins` returns the stages with their milestone
 * relation; this server component renders them grouped by the professional
 * role they pay, with the retained share and the lifecycle status. No request
 * leaves the server, and the numbers are exact decimal strings from the API.
 */

export interface TerminRow {
    id: number;
    role_type?: string | null;
    label?: string | null;
    percentage?: string | null;
    amount?: string | null;
    retention_amount?: string | null;
    retention_released_amount?: string | null;
    net_amount?: string | null;
    trigger_description?: string | null;
    status?: string | null;
    verification_notes?: string | null;
    notes?: string | null;
    paid_at?: string | null;
    milestone?: { id?: number; title?: string; approval_status?: string | null } | null;
}

function statusClasses(status: string | null | undefined): string {
    switch (status) {
        case 'paid':
            return 'bg-emerald-50 text-emerald-600';
        case 'verifying':
            return 'bg-amber-50 text-amber-700';
        case 'void':
            return 'bg-neutral-100 text-neutral-400 line-through';
        default:
            return 'bg-neutral-100 text-neutral-600';
    }
}

function minorOf(text: string | null | undefined): bigint {
    // Exact minor-unit parse for the header totals: truncates past 2 decimals,
    // never floats. Mirrors Go parseMinor.
    let s = String(text ?? '0').trim();
    if (s === '') {
        return 0n;
    }
    s = s.replace(/[\s_  ]/g, '');
    let neg = false;
    if (s.startsWith('-')) {
        neg = true;
        s = s.slice(1);
    } else if (s.startsWith('+')) {
        s = s.slice(1);
    }
    const dot = s.indexOf('.');
    let whole = dot >= 0 ? s.slice(0, dot) : s;
    let frac = dot >= 0 ? s.slice(dot + 1) : '';
    if (!/^\d+$/.test(whole) || (frac !== '' && !/^\d+$/.test(frac))) {
        return 0n;
    }
    if (frac.length > 2) {
        frac = frac.slice(0, 2);
    }
    while (frac.length < 2) {
        frac += '0';
    }
    let minor = BigInt(whole === '' ? '0' : whole) * 100n + BigInt(frac);
    return neg ? -minor : minor;
}

function formatMinor(minor: bigint): string {
    const neg = minor < 0n;
    const abs = neg ? -minor : minor;
    const whole = (abs / 100n).toString();
    let grouped = '';
    for (let i = 0; i < whole.length; i++) {
        if (i > 0 && (whole.length - i) % 3 === 0) {
            grouped += '.';
        }
        grouped += whole[i];
    }
    return (neg ? '-Rp ' : 'Rp ') + grouped;
}

export function PaymentsPanel({ termins }: { termins: TerminRow[] }) {
    // Exact header totals in minor units (no floats). Paid uses the NET that
    // was actually disbursed (the gross was never paid out); retained shows
    // what is still HELD (retention minus what the release sweeper paid out).
    let totalMinor = 0n;
    let retainedHeldMinor = 0n;
    let releasedMinor = 0n;
    let paidNetMinor = 0n;
    for (const termin of termins) {
        totalMinor += minorOf(termin.amount);
        const retention = minorOf(termin.retention_amount);
        const released = minorOf(termin.retention_released_amount);
        retainedHeldMinor += retention - released;
        releasedMinor += released;
        if (termin.status === 'paid') {
            // Prefer the persisted net; fall back to gross minus retention
            // for legacy rows with no split.
            const net = termin.net_amount != null && String(termin.net_amount).trim() !== '' && minorOf(termin.net_amount) > 0n
                ? minorOf(termin.net_amount)
                : minorOf(termin.amount) - retention;
            paidNetMinor += net;
        }
    }
    const inFlight = termins.filter((termin) => termin.status === 'verifying').length;

    const groups = new Map<string, TerminRow[]>();
    for (const termin of [...termins].sort((a, b) => a.id - b.id)) {
        const role = termin.role_type ?? 'other';
        const rows = groups.get(role) ?? [];
        rows.push(termin);
        groups.set(role, rows);
    }

    return (
        <section>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Payments</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Every payment stage, who it pays, and what is being held back.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {termins.length} {termins.length === 1 ? 'stage' : 'stages'}
                </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-8">
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Planned</p>
                    <p className="mt-2 text-xl font-black text-neutral-900">{formatMinor(totalMinor)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Paid</p>
                    <p className="mt-2 text-xl font-black text-emerald-600">{formatMinor(paidNetMinor)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Retention held</p>
                    <p className="mt-2 text-xl font-black text-neutral-900">{formatMinor(retainedHeldMinor)}</p>
                    {releasedMinor > 0n && (
                        <p className="mt-1 text-[11px] text-neutral-500">Released {formatMinor(releasedMinor)}</p>
                    )}
                </div>
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">In verification</p>
                    <p className="mt-2 text-xl font-black text-neutral-900">{inFlight}</p>
                </div>
            </div>

            {termins.length === 0 ? (
                <div className="bg-white rounded-2xl border border-neutral-200 p-8 text-sm text-neutral-500">
                    No payment stages yet. The owner and the hired PM build the schedule before work
                    starts.
                </div>
            ) : (
                <div className="space-y-8">
                    {[...groups.entries()].map(([role, rows]) => (
                        <div key={role}>
                            <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                                {titleCase(role)} · {rows.length}
                            </h2>
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {rows.map((termin) => (
                                    <article key={termin.id} className="bg-white rounded-2xl border border-neutral-200 p-5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <h3 className="text-sm font-black text-neutral-900">{termin.label}</h3>
                                                {termin.milestone?.title && (
                                                    <p className="text-[11px] text-neutral-500 mt-0.5">
                                                        {termin.milestone.title}
                                                    </p>
                                                )}
                                            </div>
                                            <span
                                                className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${statusClasses(termin.status)}`}
                                            >
                                                {titleCase(termin.status)}
                                            </span>
                                        </div>

                                        <div className="mt-4 flex items-baseline justify-between gap-3">
                                            <p className="text-lg font-black text-neutral-900">{formatIDR(termin.amount)}</p>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                                {termin.percentage ? `${termin.percentage}%` : '—'}
                                            </p>
                                        </div>

                                        <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                                            <div className="flex justify-between">
                                                <dt className="text-neutral-500">Retained</dt>
                                                <dd className="font-semibold text-neutral-700">{formatIDR(termin.retention_amount)}</dd>
                                            </div>
                                            <div className="flex justify-between">
                                                <dt className="text-neutral-500">Net</dt>
                                                <dd className="font-semibold text-neutral-700">{formatIDR(termin.net_amount)}</dd>
                                            </div>
                                        </dl>

                                        {termin.trigger_description && (
                                            <p className="mt-3 text-[11px] leading-relaxed text-neutral-600">
                                                {termin.trigger_description}
                                            </p>
                                        )}
                                        {termin.notes && (
                                            <p className="mt-2 text-[11px] text-neutral-500">{termin.notes}</p>
                                        )}
                                        {termin.verification_notes && (
                                            <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                                                {termin.verification_notes}
                                            </p>
                                        )}
                                        {termin.paid_at && (
                                            <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-emerald-600">
                                                Paid {termin.paid_at.slice(0, 10)}
                                            </p>
                                        )}
                                    </article>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
