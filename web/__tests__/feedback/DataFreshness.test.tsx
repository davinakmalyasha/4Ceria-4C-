import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DataFreshness } from '@/components/feedback/DataFreshness';

const offline = vi.hoisted(() => ({ value: false }));

vi.mock('next/offline', () => ({
    useOffline: () => offline.value,
}));

beforeEach(() => {
    offline.value = false;
});

afterEach(() => {
    cleanup();
    offline.value = false;
});

describe('DataFreshness', () => {
    test('shows "Data updated" when online', () => {
        render(<DataFreshness />);
        expect(screen.getByText(/^Data updated /)).toBeDefined();
        expect(screen.queryByText(/Offline/)).toBeNull();
    });

    test('shows offline copy when offline', () => {
        offline.value = true;
        render(<DataFreshness />);
        expect(screen.getByText(/^Offline — showing data from /)).toBeDefined();
    });

    test('updates on reconnect', () => {
        offline.value = true;
        const view = render(<DataFreshness />);
        expect(screen.getByText(/^Offline — showing data from /)).toBeDefined();
        offline.value = false;
        view.rerender(<DataFreshness />);
        expect(screen.getByText(/^Data updated /)).toBeDefined();
        expect(screen.queryByText(/Offline/)).toBeNull();
    });
});
