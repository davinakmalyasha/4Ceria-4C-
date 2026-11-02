import { formatIDR, titleCase } from '@/lib/format';
import { ConfirmSubmit } from './confirmSubmit';
import { updateOrderStatus, verifyOrderPayment } from './order-actions';

/**
 * Native material-orders panel.
 *
 * `GET /material-orders` returns the buyer's orders (or a supplier's sent and
 * received orders) with `supplier`, `user`, `project`, `items.material`,
 * `review` and the delivery job. The server renders the list and the lifecycle
 * forms; the transitions go through `order-actions.ts` (a multipart POST with
 * `_method=PUT`, which is also how the dispatch document is uploaded).
 */

export interface MaterialOrderItem {
    id: number;
    quantity?: number | null;
    price_at_order?: string | null;
    material?: { id?: number; name?: string | null } | null;
}

export interface MaterialOrderRow {
    id: number;
    whatsapp_order_id?: string | null;
    status?: string | null;
    total_price?: string | null;
    shipping_cost?: string | null;
    delivery_method?: string | null;
    delivery_address?: string | null;
    address_detail?: string | null;
    notes?: string | null;
    created_at?: string | null;
    payment_proof_path?: string | null;
    delivery_documentation_path?: string | null;
    user?: { id?: number; name?: string | null } | null;
    supplier?: { id?: number; store_name?: string | null } | null;
    project?: { id?: number; title?: string | null } | null;
    items?: MaterialOrderItem[] | null;
}

function statusClasses(status: string | null | undefined): string {
    switch (status) {
        case 'completed':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'cancelled':
        case 'refunded':
            return 'bg-neutral-100 text-neutral-500 border-neutral-200';
        case 'delivered':
        case 'paid':
            return 'bg-sky-50 text-sky-700 border-sky-200';
        default:
            return 'bg-amber-50 text-amber-700 border-amber-200';
    }
}

export function OrdersPanel({
    orders,
    viewerRole,
    error,
    title = 'Material Orders',
}: {
    orders: MaterialOrderRow[];
    viewerRole: string;
    error?: string;
    title?: string;
}) {
    const isSupplier = viewerRole === 'supplier';

    return (
        <div data-native-panel="orders" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">{title}</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        {isSupplier
                            ? 'Orders your store has received, and the buyers behind them.'
                            : 'Material orders you placed with marketplace suppliers.'}
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {orders.length} {orders.length === 1 ? 'order' : 'orders'}
                </span>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            {orders.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-10 text-center">
                    <h2 className="text-sm font-black text-neutral-900">No Active Missions</h2>
                    <p className="mt-1 text-xs text-neutral-500">
                        There are no orders matching your current criteria.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {orders.map((order) => {
                        const items = order.items ?? [];
                        return (
                            <article
                                key={order.id}
                                data-native-order={order.id}
                                className="bg-white rounded-2xl border border-neutral-200 p-5"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                            #{order.whatsapp_order_id ?? order.id}
                                        </p>
                                        <h2 className="mt-1 text-sm font-black text-neutral-900">
                                            {isSupplier
                                                ? order.user?.name ?? 'Buyer'
                                                : order.supplier?.store_name ?? 'Marketplace supplier'}
                                        </h2>
                                        {order.project?.title && (
                                            <p className="mt-0.5 text-[11px] text-neutral-500">
                                                Project: {order.project.title}
                                            </p>
                                        )}
                                    </div>
                                    <span
                                        className={`shrink-0 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider ${statusClasses(order.status)}`}
                                    >
                                        {titleCase(order.status)}
                                    </span>
                                </div>

                                <div className="mt-4 rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                        Items
                                    </p>
                                    <ul className="mt-1 space-y-1 text-xs text-neutral-700">
                                        {items.length === 0 && <li>No line items.</li>}
                                        {items.map((item) => (
                                            <li key={item.id}>
                                                {item.quantity ?? 0}× {item.material?.name ?? 'Material'}
                                                {item.price_at_order && (
                                                    <span className="text-neutral-400"> · {formatIDR(item.price_at_order)}</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                                    <div>
                                        <dt className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                            Delivery
                                        </dt>
                                        <dd className="mt-0.5 text-neutral-700">
                                            {order.delivery_method ?? 'Not set'}
                                            {order.delivery_address ? ` · ${order.delivery_address}` : ''}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                            Total
                                        </dt>
                                        <dd className="mt-0.5 font-bold text-neutral-900">
                                            {formatIDR(order.total_price)}
                                            {order.shipping_cost && Number(order.shipping_cost) > 0 && (
                                                <span className="text-[10px] font-semibold text-neutral-400">
                                                    {' '}+ {formatIDR(order.shipping_cost)} shipping
                                                </span>
                                            )}
                                        </dd>
                                    </div>
                                </dl>

                                {order.notes && (
                                    <p className="mt-3 text-[11px] leading-relaxed text-neutral-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                        {order.notes}
                                    </p>
                                )}

                                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                    {order.created_at ? order.created_at.slice(0, 10) : ''}
                                </p>

                                <div className="mt-3 border-t border-neutral-100 pt-3">
                                    {isSupplier ? (
                                        <>
                                            {order.payment_proof_path &&
                                                !['paid', 'shipping', 'delivered', 'completed', 'refunded', 'cancelled'].includes(
                                                    order.status ?? '',
                                                ) && (
                                                    <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-3">
                                                        <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                                                            Transfer proof uploaded
                                                        </p>
                                                        <p className="mt-1 text-[11px] text-indigo-700">
                                                            Verify the receipt to mark this order paid.
                                                        </p>
                                                        <form action={verifyOrderPayment} className="mt-2">
                                                            <input type="hidden" name="order_id" value={order.id} />
                                                            <ConfirmSubmit message="Verify this payment and mark the order paid?">
                                                                Verify payment
                                                            </ConfirmSubmit>
                                                        </form>
                                                    </div>
                                                )}

                                            {order.status === 'pending' && (
                                                <form action={updateOrderStatus}>
                                                    <input type="hidden" name="order_id" value={order.id} />
                                                    <input type="hidden" name="status" value="processing" />
                                                    <button
                                                        type="submit"
                                                        className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                                    >
                                                        Start processing
                                                    </button>
                                                </form>
                                            )}

                                            {order.status === 'processing' && (
                                                <form action={updateOrderStatus} className="flex flex-wrap items-end gap-2">
                                                    <input type="hidden" name="order_id" value={order.id} />
                                                    <input
                                                        type="hidden"
                                                        name="status"
                                                        value={order.delivery_method === 'Hire Platform Courier' ? 'ready_for_pickup' : 'shipping'}
                                                    />
                                                    <label className="block">
                                                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                                            Dispatch documentation (optional)
                                                        </span>
                                                        <input
                                                            type="file"
                                                            name="delivery_documentation"
                                                            accept="image/jpeg,image/png,image/webp"
                                                            className="mt-1 block text-xs text-neutral-600 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-2 file:py-1.5 file:text-[9px] file:font-black file:uppercase file:tracking-wider file:text-white"
                                                        />
                                                    </label>
                                                    <button
                                                        type="submit"
                                                        className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                                    >
                                                        {order.delivery_method === 'Hire Platform Courier' ? 'Mark ready for pickup' : 'Mark shipped'}
                                                    </button>
                                                </form>
                                            )}

                                            {order.status === 'shipping' && order.delivery_method !== 'Hire Platform Courier' && (
                                                <form action={updateOrderStatus}>
                                                    <input type="hidden" name="order_id" value={order.id} />
                                                    <input type="hidden" name="status" value="delivered" />
                                                    <ConfirmSubmit message="Mark this order delivered?">
                                                        Mark delivered
                                                    </ConfirmSubmit>
                                                </form>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {(order.status === 'pending' || order.status === 'awaiting_payment') && (
                                                <form action={updateOrderStatus}>
                                                    <input type="hidden" name="order_id" value={order.id} />
                                                    <input type="hidden" name="status" value="cancelled" />
                                                    <ConfirmSubmit message="Cancel this order?">
                                                        Cancel order
                                                    </ConfirmSubmit>
                                                </form>
                                            )}

                                            {order.status === 'delivered' && (
                                                <form action={updateOrderStatus}>
                                                    <input type="hidden" name="order_id" value={order.id} />
                                                    <input type="hidden" name="status" value="completed" />
                                                    <ConfirmSubmit message="Confirm receipt and complete this order?">
                                                        Complete order
                                                    </ConfirmSubmit>
                                                </form>
                                            )}
                                        </>
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
