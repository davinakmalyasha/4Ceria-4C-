import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { OfflineNotice } from '@/components/feedback/OfflineNotice';

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

describe('OfflineNotice', () => {
    test('renders null when online', () => {
        const { container } = render(<OfflineNotice label="projects" />);
        expect(screen.queryByRole('status')).toBeNull();
        expect(container.textContent).toBe('');
    });

    test('renders role=status with the label when offline', () => {
        offline.value = true;
        render(<OfflineNotice label="projects" />);
        const notice = screen.getByRole('status');
        expect(notice.textContent).toContain('projects');
        expect(notice.textContent).toContain('Waiting for connection');
    });
});
