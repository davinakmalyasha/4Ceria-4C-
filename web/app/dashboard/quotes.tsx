import { formatIDR, titleCase } from '@/lib/format';
import { approveQuote, markQuotePaid, postQuoteDeliveryJob, requestQuotePayment, uploadQuoteProof } from './quotes-actions';

/**
 * Native quotation-history panel.
 *
 * `GET /material-quotes` returns the quotes a buyer sent (or both sides for a
 * supplier) with `supplier`, `user`, `project` and the JSON `items` array.
 * The supplier can request payment, confirm it (after the buyer's proof) and
 * approve the order; the buyer uploads the transfer receipt. Every button is a
 * server action calling the same endpoint the legacy screen used.
 */

export interface QuoteItem {
    material_id?: number;
    name?: string | null;
    price_at_quote?: string | number | null;
    qty?: number | null;
    unit?: string | null;
}

export interface MaterialQuoteRow {
    id: number;
    status?: string | null;
    total_amount?: string | null;
    shipping_cost?: string | null;
    delivery_method?: string | null;
    delivery_address?: string | null;
    address_detail?: string | null;
    note?: string | null;
    created_at?: string | null;
    total_weight?: string | null;
    payment_proof_path?: string | null;
    paid_at?: string | null;
    user?: { id?: number; name?: string | null } | null;
    supplier?: { id?: number; store_name?: string | null } | null;
    project?: { id?: number; title?: string | null } | null;
    items?: QuoteItem[] | null;
}

function statusClasses(status: string | null | undefined): string {
    switch (status) {
        case 'approved':
        case 'paid':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'rejected':
        case 'cancelled':
            return 'bg-red-50 text-red-700 border-red-200';
        case 'awaiting_payment':
            return 'bg-amber-50 text-amber-700 border-amber-200';
        default:
            return 'bg-neutral-100 text-neutral-600 border-neutral-200';
    }
}

export function QuotesPanel({
    quotes,
    viewerRole,
    error,
}: {
    quotes: MaterialQuoteRow[];
    viewerRole: string;
    error?: string;
}) {
    const isSupplier = viewerRole === 'supplier';

    return (
        <div data-native-panel="quotes" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Quotation History</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        {isSupplier
                            ? 'Quotes your store sent, and the buyers waiting on them.'
                            : 'Requests for quotation you sent to marketplace suppliers.'}
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {quotes.length} {quotes.length === 1 ? 'quote' : 'quotes'}
                </span>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            {quotes.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-10 text-center">
                    <h2 className="text-sm font-black text-neutral-900">No quotes found</h2>
                    <p className="mt-1 text-xs text-neutral-500">
                        Request a quotation from a marketplace supplier to start one.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {quotes.map((quote) => {
                        const items = quote.items ?? [];
                        return (
                            <article
                                key={quote.id}
                                data-native-quote={quote.id}
                                className="bg-white rounded-2xl border border-neutral-200 p-5"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                            Quote #{quote.id}
                                        </p>
                                        <h2 className="mt-1 text-sm font-black text-neutral-900">
                                            {isSupplier
                                                ? quote.user?.name ?? quote.delivery_address ?? 'Buyer'
                                                : quote.supplier?.store_name ?? 'Marketplace supplier'}
                                        </h2>
                                        {quote.project?.title && (
                                            <p className="mt-0.5 text-[11px] text-neutral-500">
                                                Project: {quote.project.title}
                                            </p>
                                        )}
                                    </div>
                                    <span
                                        className={`shrink-0 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider ${statusClasses(quote.status)}`}
                                    >
                                        {titleCase(quote.status)}
                                    </span>
                                </div>

                                <div className="mt-4 rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                        Items
                                    </p>
                                    <ul className="mt-1 space-y-1 text-xs text-neutral-700">
                                        {items.length === 0 && <li>No line items.</li>}
                                        {items.map((item, index) => (
                                            <li key={`${quote.id}-${index}`}>
                                                {item.qty ?? 0}× {item.name ?? 'Material'}
                                                {item.unit ? ` ${item.unit}` : ''}
                                                {item.price_at_quote != null && (
                                                    <span className="text-neutral-400">
                                                        {' '}
                                                        · {formatIDR(item.price_at_quote)}
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                                    <div>
                                        <dt className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                            Delivery site
                                        </dt>
                                        <dd className="mt-0.5 text-neutral-700">
                                            {quote.delivery_address ?? 'Personal address'}
                                            {quote.address_detail ? ` · ${quote.address_detail}` : ''}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                            Total
                                        </dt>
                                        <dd className="mt-0.5 font-bold text-neutral-900">
                                            {formatIDR(quote.total_amount)}
                                            {quote.shipping_cost && Number(quote.shipping_cost) > 0 && (
                                                <span className="text-[10px] font-semibold text-neutral-400">
                                                    {' '}+ {formatIDR(quote.shipping_cost)} shipping
                                                </span>
                                            )}
                                        </dd>
                                    </div>
                                </dl>

                                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                    {quote.delivery_method ?? 'Supplier Fleet'}
                                    {quote.created_at ? ` · ${quote.created_at.slice(0, 10)}` : ''}
                                </p>

                                {quote.note && (
                                    <p className="mt-3 text-[11px] leading-relaxed text-neutral-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                        {quote.note}
                                    </p>
                                )}

                                <div className="mt-4 border-t border-neutral-100 pt-4 space-y-3">
                                    {isSupplier ? (
                                        <>
                                            {quote.status === 'pending' && (
                                                <form action={requestQuotePayment} className="grid gap-2 sm:grid-cols-4 items-end">
                                                    <input type="hidden" name="quote_id" value={quote.id} />
                                                    <label className="block">
                                                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Shipping</span>
                                                        <input name="shipping_cost" required defaultValue={quote.shipping_cost ?? '0'} inputMode="decimal" className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs" />
                                                    </label>
                                                    <label className="block">
                                                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Method</span>
                                                        <input name="delivery_method" required defaultValue={quote.delivery_method ?? 'Supplier Fleet'} className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs" />
                                                    </label>
                                                    <label className="block">
                                                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Weight</span>
                                                        <input name="total_weight" defaultValue={quote.total_weight ?? ''} className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs" />
                                                    </label>
                                                    <button type="submit" className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700">
                                                        Request payment
                                                    </button>
                                                </form>
                                            )}

                                            {quote.status === 'awaiting_payment' &&
                                                (quote.payment_proof_path ? (
                                                    <form action={markQuotePaid} className="flex flex-wrap items-end gap-2">
                                                        <input type="hidden" name="quote_id" value={quote.id} />
                                                        <input name="payment_notes" placeholder="Payment note (optional)" className="rounded-lg border border-neutral-200 px-2 py-1.5 text-xs" />
                                                        <button type="submit" className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700">
                                                            Confirm payment
                                                        </button>
                                                    </form>
                                                ) : (
                                                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
                                                        Waiting for the buyer's transfer receipt.
                                                    </p>
                                                ))}

                                            {quote.status === 'paid' && (
                                                <form action={approveQuote} className="grid gap-2 sm:grid-cols-5 items-end">
                                                    <input type="hidden" name="quote_id" value={quote.id} />
                                                    <label className="block">
                                                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Shipping</span>
                                                        <input name="shipping_cost" defaultValue={quote.shipping_cost ?? '0'} inputMode="decimal" className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs" />
                                                    </label>
                                                    <label className="block">
                                                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Method</span>
                                                        <input name="delivery_method" defaultValue={quote.delivery_method ?? 'Supplier Fleet'} className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs" />
                                                    </label>
                                                    <label className="block">
                                                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Weight</span>
                                                        <input name="total_weight" defaultValue={quote.total_weight ?? ''} className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs" />
                                                    </label>
                                                    <label className="block">
                                                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Notes</span>
                                                        <input name="notes" className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs" />
                                                    </label>
                                                    <button type="submit" className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700">
                                                        Approve &amp; create order
                                                    </button>
                                                </form>
                                            )}

                                            {(quote.status === 'pending' || quote.status === 'awaiting_payment') && (
                                                <details>
                                                    <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900">
                                                        Hire platform courier
                                                    </summary>
                                                    <form action={postQuoteDeliveryJob} className="mt-2 grid gap-2 sm:grid-cols-4 items-end">
                                                        <input type="hidden" name="quote_id" value={quote.id} />
                                                        <label className="block">
                                                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Courier fee</span>
                                                            <input name="shipping_cost" required defaultValue={quote.shipping_cost ?? '0'} inputMode="decimal" className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs" />
                                                        </label>
                                                        <label className="block">
                                                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Total weight</span>
                                                            <input name="total_weight" defaultValue={quote.total_weight ?? ''} className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs" />
                                                        </label>
                                                        <label className="block">
                                                            <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Internal notes</span>
                                                            <input name="internal_notes" className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs" />
                                                        </label>
                                                        <button type="submit" className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700">
                                                            Post delivery job
                                                        </button>
                                                    </form>
                                                </details>
                                            )}
                                        </>
                                    ) : (
                                        quote.status === 'awaiting_payment' && (
                                            <form action={uploadQuoteProof} className="flex flex-wrap items-end gap-2">
                                                <input type="hidden" name="quote_id" value={quote.id} />
                                                <label className="block">
                                                    <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Transfer receipt</span>
                                                    <input type="file" name="payment_proof" required accept=".jpg,.jpeg,.png,.webp,.pdf" className="mt-1 block text-xs text-neutral-600 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-2 file:py-1.5 file:text-[9px] file:font-black file:uppercase file:tracking-wider file:text-white" />
                                                </label>
                                                <button type="submit" className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700">
                                                    Upload payment proof
                                                </button>
                                            </form>
                                        )
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
