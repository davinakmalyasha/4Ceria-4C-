/**
 * Money-adjacent arithmetic for the procurement tracker.
 *
 * WHY THIS IS A MODULE AND NOT INLINE JSX
 * ----------------------------------------
 * The figures lived inline in `MaterialOrderTracker.tsx` and were labelled
 * "Total Spent". They were not spent money. The old single number:
 *
 *     activeOrders
 *         .filter(o => o.status !== 'cancelled')
 *         .reduce((sum, o) => sum + Number(o.total_price || 0), 0)
 *     + requirements.reduce((sum, req) => sum + Number(req.external_cost || 0), 0)
 *
 * disagreed with `ProjectFinancialService` in five ways at once:
 *
 *   1. counted `pending` and `awaiting_payment` orders, which have moved no money;
 *   2. ignored `shipping_cost`, which the escrow ledger DOES charge;
 *   3. ignored material QUOTES, which post to the ledger via
 *      `MaterialQuoteController::markAsPaid`;
 *   4. never netted a dispute refund;
 *   5. added `external_cost`, a free-text field with no ledger row at all.
 *
 * Every divergence flattered the number. A procurement headline reading well
 * while the escrow disagreed is worse than an obviously broken one, because
 * nobody investigates a figure that looks fine.
 *
 * WHAT THIS DELIBERATELY IS NOT
 * -----------------------------
 * This is NOT a second implementation of the escrow balance. It never claims to
 * be. `paidViaMarketplace()` reports what THIS SCREEN is responsible for — the
 * orders whose payment `verifyPayment` released through the ledger — and the
 * authoritative disbursed figure remains the server's
 * `ProjectFinancialService::paidTotalMoney()`, surfaced as `budget_summary`.
 * The distinction is the whole point: committed money and released money are
 * different facts and must not share a label.
 *
 * `external_cost` is deliberately kept OUT of both figures. It is declared by a
 * human in free text and has no ledger row, so folding it into a money total
 * would imply an escrow movement that never happened. It is reported
 * separately as `declaredExternal` for the PM to reconcile.
 */

/** Minimal shape needed from a material order. */
export interface ProcurementOrder {
    id: number;
    status: string;
    total_price?: number | string | null;
    shipping_cost?: number | string | null;
}

/** Minimal shape needed from a project requirement. */
export interface ProcurementRequirement {
    external_cost?: number | string | null;
}

/**
 * Order statuses in which the escrow has actually been debited.
 *
 * Only `MaterialOrderController::verifyPayment` debits the ledger, and it sets
 * `paid`. Treating any other status as spent is the original bug.
 */
export const PAID_ORDER_STATUSES = ['paid'] as const;

/**
 * Order statuses where money is committed but has NOT left the escrow.
 */
export const AWAITING_PAYMENT_ORDER_STATUSES = ['pending', 'awaiting_payment'] as const;

/** `cancelled` orders are excluded everywhere: the order never happened. */
export const VOID_ORDER_STATUSES = ['cancelled'] as const;

/**
 * Parse a value that arrived from the API into a number.
 *
 * Decimal columns are cast to `decimal:2` server-side, which means JSON may
 * carry a STRING. `Number(null)` is 0 and `Number('')` is 0, so a missing value
 * is genuinely zero rather than NaN poisoning a sum — but a non-numeric string
 * must not silently become NaN and blank the whole total, which is what a bare
 * `sum + Number(x)` would do.
 */
export function toAmount(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;

    const parsed = typeof value === 'number' ? value : Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * What one order costs the escrow: goods plus delivery.
 *
 * `shipping_cost` is included because the ledger charges it — see
 * `MaterialOrderController::verifyPayment`, which sums `total_price +
 * shipping_cost` and records that as the payment.
 */
export function orderCost(order: ProcurementOrder): number {
    return toAmount(order.total_price) + toAmount(order.shipping_cost);
}

/** Orders that actually exist for money purposes. */
export function liveOrders(orders: ProcurementOrder[] = []): ProcurementOrder[] {
    return orders.filter((o) => !VOID_ORDER_STATUSES.includes(o.status as never));
}

/**
 * Money the escrow has ALREADY released for material orders on this project.
 *
 * This is the subset of that figure which passed through
 * `verifyPayment` and therefore has a ledger row.
 */
export function paidViaMarketplace(orders: ProcurementOrder[] = []): number {
    return liveOrders(orders)
        .filter((o) => PAID_ORDER_STATUSES.includes(o.status as never))
        .reduce((sum, o) => sum + orderCost(o), 0);
}

/**
 * Money committed to material orders but not yet released.
 *
 * Not in the ledger. The owner has committed to it; the escrow has not moved.
 */
export function awaitingPayment(orders: ProcurementOrder[] = []): number {
    return liveOrders(orders)
        .filter((o) => AWAITING_PAYMENT_ORDER_STATUSES.includes(o.status as never))
        .reduce((sum, o) => sum + orderCost(o), 0);
}

/**
 * Free-text external costs declared by hand.
 *
 * Reported SEPARATELY and never added to a money total: there is no ledger row,
 * so adding it to `paidViaMarketplace` would imply an escrow movement that never
 * happened. See the module docblock.
 */
export function declaredExternal(
    requirements: ProcurementRequirement[] = [],
): number {
    return requirements.reduce((sum, req) => sum + toAmount(req.external_cost), 0);
}

/**
 * Committed but unreleased: awaiting payment plus hand-declared external cost.
 *
 * The second term is included because the PM is responsible for it, but the
 * label and the tooltip must make clear it is declared rather than escrowed.
 */
export function committedNotPaid(
    orders: ProcurementOrder[] = [],
    requirements: ProcurementRequirement[] = [],
): number {
    return awaitingPayment(orders) + declaredExternal(requirements);
}