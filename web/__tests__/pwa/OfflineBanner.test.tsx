import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';

const offline = vi.hoisted(() => ({ value: false }));
const nav = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/offline', () => ({
    useOffline: () => offline.value,
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: nav.refresh }),
}));

beforeEach(() => {
    offline.value = false;
    nav.refresh.mockClear();
});

afterEach(() => {
    cleanup();
    offline.value = false;
    nav.refresh.mockClear();
});

describe('OfflineBanner', () => {
    test('renders null when online', () => {
        const { container } = render(<OfflineBanner />);
        expect(screen.queryByRole('status')).toBeNull();
        expect(container.textContent).toBe('');
    });

    test('shows role=status when offline', () => {
        offline.value = true;
        render(<OfflineBanner />);
        const banner = screen.getByRole('status');
        expect(banner.textContent).toContain('You are offline.');
    });

    test('calls router.refresh once on offline -> online', () => {
        offline.value = true;
        const view = render(<OfflineBanner />);
        expect(screen.getByRole('status')).toBeDefined();
        expect(nav.refresh).not.toHaveBeenCalled();
        offline.value = false;
        view.rerender(<OfflineBanner />);
        expect(screen.queryByRole('status')).toBeNull();
        expect(nav.refresh).toHaveBeenCalledTimes(1);
    });
});
