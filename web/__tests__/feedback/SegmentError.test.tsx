import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SegmentError } from '@/components/feedback/SegmentError';

const offline = vi.hoisted(() => ({ value: false }));

vi.mock('next/offline', () => ({
    useOffline: () => offline.value,
}));

beforeEach(() => {
    offline.value = false;
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    cleanup();
    offline.value = false;
    vi.restoreAllMocks();
});

describe('SegmentError', () => {
    test('renders role=alert with title and retry button', () => {
        const retry = vi.fn();
        render(<SegmentError title="Projects" error={new Error('NEXT_NOT_FOUND')} retry={retry} />);
        expect(screen.getByRole('alert')).toBeDefined();
        expect(screen.getByText('Projects failed to load')).toBeDefined();
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(retry).toHaveBeenCalledTimes(1);
    });

    test('quotes local NEXT_ errors online', () => {
        const retry = vi.fn();
        render(<SegmentError title="Orders" error={new Error('NEXT_REDIRECT')} retry={retry} />);
        expect(screen.getByText('NEXT_REDIRECT')).toBeDefined();
    });

    test('shows offline-aware copy and hides the digest while offline', () => {
        offline.value = true;
        const retry = vi.fn();
        const error = Object.assign(new Error('boom'), { digest: 'abc123' });
        render(<SegmentError title="Orders" error={error} retry={retry} />);
        expect(screen.getByText(/You appear to be offline/)).toBeDefined();
        expect(screen.queryByText(/Reference/)).toBeNull();
    });

    test('redacts server failures to a reference online', () => {
        const retry = vi.fn();
        const error = Object.assign(new Error('Internal failure'), { digest: 'abc123' });
        render(<SegmentError title="Orders" error={error} retry={retry} />);
        expect(screen.getByText('An unexpected error interrupted this section.')).toBeDefined();
        expect(screen.getByText('Reference abc123')).toBeDefined();
    });
});
