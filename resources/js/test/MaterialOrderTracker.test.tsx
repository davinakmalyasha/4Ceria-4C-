import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import MaterialOrderTracker from '../components/Projects/Phases/MaterialOrderTracker';

/**
 * The wiring test. `procurement.test.ts` pins the ARITHMETIC; this pins that the
 * component uses it and labels the two figures differently.
 *
 * Without it, the module tests would still pass if the component went back to
 * `orders.reduce(...)` inline and relabelled the sum "Total Spent" — the tests
 * would be testing a module nothing called. That is the same blind spot as
 * `PaymentIntegrityTest` asserting a 200 that was really a silent no-op.
 */

vi.mock('axios');

const showToast = vi.fn();
// Resolved relative to THIS file (`resources/js/test/`), not to the component.
// Vitest matches mocks by resolved module id, so the path must reach the same
// module the component imports — `resources/js/context/ToastContext`.
vi.mock('../context/ToastContext', () => ({
    useToast: () => ({ showToast }),
}));

/** `material-orders` payload: one of each state that matters. */
const ORDERS = [
    { id: 1, status: 'paid', total_price: 50_000_000, shipping_cost: 2_500_000, items: [], created_at: '2026-09-01' },
    { id: 2, status: 'pending', total_price: 30_000_000, shipping_cost: 1_000_000, items: [], created_at: '2026-09-02' },
    { id: 3, status: 'awaiting_payment', total_price: 20_000_000, shipping_cost: 500_000, items: [], created_at: '2026-09-03' },
    { id: 4, status: 'cancelled', total_price: 99_000_000, shipping_cost: 0, items: [], created_at: '2026-09-04' },
];

// `currentUser` is a required prop. An owner, so the tracker renders the full
// set of tiles rather than the PM-only procurement inbox.
const project = { id: 7, title: 'Test project', budget: 500_000_000 };
const currentUser = { id: 1, role_type: 'user', name: 'Owner' };
const props = { project, currentUser };

beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(axios.get).mockImplementation(async (url: string) => {
        if (url.includes('/material-orders')) {
            return { data: { data: ORDERS } } as never;
        }
        return { data: { data: [] } } as never;
    });
});

describe('MaterialOrderTracker money tiles', () => {
    it('reports only escrow-released money as paid', async () => {
        render(<MaterialOrderTracker {...props} />);

        // 50,000,000 goods + 2,500,000 shipping. The pending and awaiting
        // orders have moved no money and must not appear.
        await waitFor(() => {
            expect(screen.getByText(/52\.500\.000/)).toBeInTheDocument();
        });
    });

    it('never labels a figure "Total Spent"', async () => {
        render(<MaterialOrderTracker {...props} />);

        await waitFor(() => {
            expect(screen.getByText(/52\.500\.000/)).toBeInTheDocument();
        });

        // The label itself was the defect: a figure that includes unpaid orders
        // must not be called spent money.
        expect(screen.queryByText(/Total Spent/i)).not.toBeInTheDocument();
    });

    it('separates committed-but-unpaid from released money', async () => {
        render(<MaterialOrderTracker {...props} />);

        await waitFor(() => {
            expect(screen.getByText(/Committed, Not Yet Paid/i)).toBeInTheDocument();
        });

        // 31,000,000 + 20,500,000 = 51,500,000, in a DIFFERENT tile from the
        // 52,500,000 paid figure.
        expect(screen.getByText(/51\.500\.000/)).toBeInTheDocument();
        expect(screen.getByText('Paid')).toBeInTheDocument();
    });

    it('excludes the cancelled order from BOTH tiles', async () => {
        render(<MaterialOrderTracker {...props} />);

        const paid = await screen.findByTestId('procurement-paid');
        const committed = await screen.findByTestId('procurement-committed');

        // Scoped to the tiles. A cancelled order legitimately appears in the
        // order LIST with its own price; asserting the amount appears nowhere
        // on the page was a bad test, and would have "passed" for the wrong
        // reason if the list ever stopped rendering it.
        expect(paid).toHaveTextContent('52.500.000');
        expect(committed).toHaveTextContent('51.500.000');

        expect(paid.textContent).not.toContain('99.000.000');
        expect(committed.textContent).not.toContain('99.000.000');
    });

    it('never shows the old overstated figure in either tile', async () => {
        render(<MaterialOrderTracker {...props} />);

        const paid = await screen.findByTestId('procurement-paid');
        const committed = await screen.findByTestId('procurement-committed');

        // 112,000,000 was the old "Total Spent": every non-cancelled order's
        // goods plus hand-typed external costs. 2.1x the money that moved.
        expect(paid.textContent).not.toContain('112.000.000');
        expect(committed.textContent).not.toContain('112.000.000');
    });
});