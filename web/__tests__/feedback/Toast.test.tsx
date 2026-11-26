import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from '@/components/feedback/Toast';

type Tone = 'success' | 'error' | 'info';

function Trigger({ message, tone }: { message: string; tone?: Tone }) {
    const notify = useToast();
    return (
        <button type="button" onClick={() => notify(message, tone)}>
            fire-{message}
        </button>
    );
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
});

describe('Toast', () => {
    test('notify adds a toast', () => {
        render(
            <ToastProvider>
                <Trigger message="Link copied" />
            </ToastProvider>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'fire-Link copied' }));
        expect(screen.getByText('Link copied')).toBeDefined();
    });

    test('caps visible toasts at 3', () => {
        render(
            <ToastProvider>
                <Trigger message="m1" />
                <Trigger message="m2" />
                <Trigger message="m3" />
                <Trigger message="m4" />
            </ToastProvider>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'fire-m1' }));
        fireEvent.click(screen.getByRole('button', { name: 'fire-m2' }));
        fireEvent.click(screen.getByRole('button', { name: 'fire-m3' }));
        fireEvent.click(screen.getByRole('button', { name: 'fire-m4' }));
        expect(screen.queryByText('m1')).toBeNull();
        expect(screen.getByText('m2')).toBeDefined();
        expect(screen.getByText('m3')).toBeDefined();
        expect(screen.getByText('m4')).toBeDefined();
        expect(screen.getAllByRole('status')).toHaveLength(3);
    });

    test('auto-dismisses after 5s', () => {
        render(
            <ToastProvider>
                <Trigger message="Ephemeral" />
            </ToastProvider>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'fire-Ephemeral' }));
        expect(screen.getByText('Ephemeral')).toBeDefined();
        act(() => {
            vi.advanceTimersByTime(5000);
        });
        expect(screen.queryByText('Ephemeral')).toBeNull();
    });

    test('error tone uses role=alert, success uses role=status', () => {
        render(
            <ToastProvider>
                <Trigger message="Saved" tone="success" />
                <Trigger message="Payment failed" tone="error" />
            </ToastProvider>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'fire-Saved' }));
        fireEvent.click(screen.getByRole('button', { name: 'fire-Payment failed' }));
        expect(screen.getByRole('alert').textContent).toContain('Payment failed');
        expect(screen.getByRole('status').textContent).toContain('Saved');
    });

    test('dismiss button removes the toast', () => {
        render(
            <ToastProvider>
                <Trigger message="Dismiss me" />
            </ToastProvider>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'fire-Dismiss me' }));
        expect(screen.getByText('Dismiss me')).toBeDefined();
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
        expect(screen.queryByText('Dismiss me')).toBeNull();
    });

    test('info tone uses role=status', () => {
        render(
            <ToastProvider>
                <Trigger message="Heads up" tone="info" />
            </ToastProvider>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'fire-Heads up' }));
        expect(screen.getByRole('status').textContent).toContain('Heads up');
    });

    test('double-dismiss of the same toast leaves other toasts alone', () => {
        render(
            <ToastProvider>
                <Trigger message="First" />
                <Trigger message="Second" />
            </ToastProvider>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'fire-First' }));
        fireEvent.click(screen.getByRole('button', { name: 'fire-Second' }));
        const dismissFirst = screen.getAllByRole('button', { name: 'Dismiss notification' })[0];
        act(() => {
            // A rapid double-click lands twice before React unmounts the
            // toast. The second dismiss finds no timer and must be a no-op
            // rather than throwing or clearing another toast's timer.
            dismissFirst.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            dismissFirst.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(screen.queryByText('First')).toBeNull();
        expect(screen.getByText('Second')).toBeDefined();
        act(() => {
            vi.advanceTimersByTime(5000);
        });
        expect(screen.queryByText('Second')).toBeNull();
    });

    test('notify is a no-op outside a provider', () => {
        function Fire() {
            const notify = useToast();
            return (
                <button type="button" onClick={() => notify('stray')}>
                    fire
                </button>
            );
        }
        render(<Fire />);
        fireEvent.click(screen.getByRole('button', { name: 'fire' }));
        expect(screen.queryByRole('status')).toBeNull();
    });
});
