import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { EmptyState, TableEmpty } from '@/components/feedback/EmptyState';

vi.mock('next/link', () => ({
    default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
        <a href={href} className={className}>
            {children}
        </a>
    ),
}));

afterEach(() => {
    cleanup();
});

describe('EmptyState', () => {
    test('renders title and body', () => {
        render(<EmptyState title="No projects yet" body="Create your first project to get started." />);
        expect(screen.getByText('No projects yet')).toBeDefined();
        expect(screen.getByText('Create your first project to get started.')).toBeDefined();
    });

    test('renders no action link by default', () => {
        render(<EmptyState title="Nothing here" body="Empty." />);
        expect(screen.queryByRole('link')).toBeNull();
    });

    test('renders action link when href and label are given', () => {
        render(<EmptyState title="Nothing here" body="Empty." actionHref="/projects/new" actionLabel="New project" />);
        const link = screen.getByRole('link', { name: 'New project' });
        expect(link.getAttribute('href')).toBe('/projects/new');
    });

    test('renders the icon when given', () => {
        render(<EmptyState title="T" body="B" icon={<span data-testid="empty-icon">i</span>} />);
        expect(screen.getByTestId('empty-icon')).toBeDefined();
    });

    test('renders no action link without both href and label', () => {
        const view = render(<EmptyState title="T" body="B" actionHref="/projects/new" />);
        expect(screen.queryByRole('link')).toBeNull();
        view.rerender(<EmptyState title="T" body="B" actionLabel="New project" />);
        expect(screen.queryByRole('link')).toBeNull();
    });
});

describe('TableEmpty', () => {
    test('renders a full-width cell with title, hint and colSpan', () => {
        render(
            <table>
                <tbody>
                    <TableEmpty colSpan={5} title="No rows" hint="Try adjusting the filters." />
                </tbody>
            </table>,
        );
        expect(screen.getByText('No rows')).toBeDefined();
        expect(screen.getByText('Try adjusting the filters.')).toBeDefined();
        const cell = screen.getByText('No rows').closest('td');
        expect(cell?.getAttribute('colspan')).toBe('5');
    });

    test('omits the hint when none is given', () => {
        const { container } = render(
            <table>
                <tbody>
                    <TableEmpty colSpan={3} title="No rows" />
                </tbody>
            </table>,
        );
        expect(screen.getByText('No rows')).toBeDefined();
        expect(container.querySelector('td')?.getAttribute('colspan')).toBe('3');
        expect(container.textContent).not.toContain('Try adjusting');
    });
});
