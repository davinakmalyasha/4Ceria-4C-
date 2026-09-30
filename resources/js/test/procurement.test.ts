import { describe, it, expect } from 'vitest';
import {
    toAmount,
    orderCost,
    liveOrders,
    paidViaMarketplace,
    awaitingPayment,
    declaredExternal,
    committedNotPaid,
    type ProcurementOrder,
} from '../lib/procurement';

/**
 * These tests exist because the figure they cover was labelled "Total Spent"
 * and was not spent money. See the module docblock for the five ways it
 * disagreed with `ProjectFinancialService`.
 *
 * The tests are written to FAIL against the old arithmetic. Each one states a
 * fact about what the escrow actually does, not about what the code returns —
 * that is the only way a test of a money figure is worth anything.
 */

const order = (
    id: number,
    status: string,
    total_price: number | string | null,
    shipping_cost: number | string | null = null,
): ProcurementOrder => ({ id, status, total_price, shipping_cost });

describe('toAmount', () => {
    it('treats a missing value as zero, because that is what the ledger holds', () => {
        expect(toAmount(null)).toBe(0);
        expect(toAmount(undefined)).toBe(0);
        expect(toAmount('')).toBe(0);
    });

    it('parses a decimal string, which is how a decimal:2 column arrives', () => {
        // The models cast money columns to `decimal:2`, so JSON can carry
        // "52500000.00" rather than a number.
        expect(toAmount('52500000.00')).toBe(52_500_000);
    });

    it('never returns NaN, which would silently blank a whole total', () => {
        // The old code did `sum + Number(x)`. One NaN makes the entire running
        // total NaN, and `NaN.toLocaleString()` renders "NaN" on screen.
        expect(toAmount('not a number')).toBe(0);
        expect(toAmount({})).toBe(0);
        expect(toAmount(Infinity)).toBe(0);
    });

    it('keeps sen exact', () => {
        expect(toAmount('1000.10')).toBe(1000.10);
        expect(toAmount(0.1) + toAmount(0.2)).toBeCloseTo(0.3, 10);
    });
});

describe('orderCost', () => {
    it('includes shipping, because the escrow ledger charges it', () => {
        // `MaterialOrderController::verifyPayment` records
        // `total_price + shipping_cost` as the payment. A client figure that
        // omitted shipping would disagree with the ledger by exactly the
        // delivery fee.
        expect(orderCost(order(1, 'paid', 50_000_000, 2_500_000))).toBe(52_500_000);
    });

    it('treats a null shipping cost as zero rather than NaN', () => {
        expect(orderCost(order(1, 'paid', 1_000, null))).toBe(1_000);
        expect(orderCost(order(1, 'paid', 1_000, undefined))).toBe(1_000);
    });
});

describe('liveOrders', () => {
    it('excludes cancelled orders: the order never happened', () => {
        const orders = [
            order(1, 'paid', 100),
            order(2, 'cancelled', 900),
        ];

        expect(liveOrders(orders).map((o) => o.id)).toEqual([1]);
    });
});

describe('paidViaMarketplace', () => {
    it('counts ONLY orders whose escrow was actually debited', () => {
        // The core regression. The old code summed every non-cancelled order,
        // so a pending order counted as money the client had already spent.
        const orders = [
            order(1, 'paid', 50_000_000, 2_500_000),
            order(2, 'pending', 30_000_000, 1_000_000),
            order(3, 'awaiting_payment', 20_000_000, 0),
            order(4, 'shipped', 10_000_000, 0),
            order(5, 'cancelled', 99_000_000, 0),
        ];

        // 52,500,000 — not 212,500,000.
        expect(paidViaMarketplace(orders)).toBe(52_500_000);
    });

    it('does not treat shipped or delivered as newly spent', () => {
        // Fulfillment states follow payment. Counting them again would
        // double-charge the escrow in the client's view.
        const orders = [
            order(1, 'paid', 10_000_000, 0),
            order(2, 'shipped', 10_000_000, 0),
            order(3, 'delivered', 10_000_000, 0),
        ];

        expect(paidViaMarketplace(orders)).toBe(10_000_000);
    });

    it('is zero when nothing has been paid', () => {
        expect(paidViaMarketplace([order(1, 'pending', 5_000_000, 0)])).toBe(0);
        expect(paidViaMarketplace([])).toBe(0);
    });
});

describe('awaitingPayment', () => {
    it('separates committed money from released money', () => {
        const orders = [
            order(1, 'paid', 50_000_000, 2_500_000),
            order(2, 'pending', 30_000_000, 1_000_000),
            order(3, 'awaiting_payment', 20_000_000, 500_000),
        ];

        expect(awaitingPayment(orders)).toBe(51_500_000);
        // And the two figures must not overlap.
        expect(paidViaMarketplace(orders) + awaitingPayment(orders)).toBe(104_000_000);
    });
});

describe('declaredExternal', () => {
    it('reports a hand-typed cost as declared, never as escrowed', () => {
        expect(declaredExternal([{ external_cost: 12_000_000 }])).toBe(12_000_000);
        expect(declaredExternal([{ external_cost: null }])).toBe(0);
        expect(declaredExternal([])).toBe(0);
    });
});

describe('committedNotPaid', () => {
    it('combines awaiting payment with declared external cost', () => {
        const orders = [order(1, 'pending', 30_000_000, 1_000_000)];
        const requirements = [{ external_cost: 12_000_000 }];

        expect(committedNotPaid(orders, requirements)).toBe(43_000_000);
    });

    it('never includes a paid order, so a released payment cannot be re-committed', () => {
        const orders = [order(1, 'paid', 50_000_000, 2_500_000)];

        expect(committedNotPaid(orders, [])).toBe(0);
    });
});

describe('the old "Total Spent" arithmetic, for contrast', () => {
    it('is shown to disagree with the ledger in five ways at once', () => {
        // This is the exact expression that used to be labelled "Total Spent",
        // preserved so the regression cannot be reintroduced by accident.
        const orders: ProcurementOrder[] = [
            order(1, 'paid', 50_000_000, 2_500_000),
            order(2, 'pending', 30_000_000, 1_000_000),
            order(3, 'awaiting_payment', 20_000_000, 0),
            order(4, 'cancelled', 99_000_000, 0),
        ];
        const requirements = [{ external_cost: 12_000_000 }];

        const oldTotalSpent = orders
            .filter((o) => o.status !== 'cancelled')
            .reduce((sum, o) => sum + toAmount(o.total_price), 0)
            + requirements.reduce((sum, r) => sum + toAmount(r.external_cost), 0);

        // What it claimed the client had spent.
        expect(oldTotalSpent).toBe(112_000_000);

        // What the escrow actually released through the ledger.
        expect(paidViaMarketplace(orders)).toBe(52_500_000);

        // It overstated by 2.1x, and 59,500,000 of that was money that had
        // never left: shipping on the paid order (2,500,000) and orders not yet
        // released (51,000,000), plus a free-text 12,000,000 with no ledger row.
        expect(oldTotalSpent - paidViaMarketplace(orders)).toBe(59_500_000);
    });
});