import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmSubmit } from '@/app/dashboard/confirmSubmit';

const formStatus = vi.hoisted(() => ({ pending: false }));

vi.mock('react-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-dom')>();
    return {
        ...actual,
        useFormStatus: () => ({ pending: formStatus.pending }),
    };
});

function openDialog(label = 'Delete it') {
    render(
        <form>
            <ConfirmSubmit message="Are you sure?">{label}</ConfirmSubmit>
        </form>,
    );
    const trigger = screen.getByRole('button', { name: label });
    fireEvent.click(trigger);
    return trigger;
}

beforeEach(() => {
    formStatus.pending = false;
});

afterEach(() => {
    cleanup();
    formStatus.pending = false;
    vi.restoreAllMocks();
});

describe('ConfirmSubmit', () => {
    test('trigger is disabled and shows Working while pending', () => {
        formStatus.pending = true;
        render(
            <form>
                <ConfirmSubmit message="Are you sure?">Delete it</ConfirmSubmit>
            </form>,
        );
        const trigger = screen.getByRole('button', { name: 'Working…' });
        expect(trigger.hasAttribute('disabled')).toBe(true);
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    test('opens an alertdialog with cancel and confirm', () => {
        openDialog();
        expect(screen.getByRole('alertdialog')).toBeDefined();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeDefined();
        expect(screen.getByText('Are you sure?')).toBeDefined();
    });

    test('Escape cancels and restores focus to the trigger', () => {
        const trigger = openDialog();
        expect(screen.getByRole('alertdialog')).toBeDefined();
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    test('backdrop click cancels and restores focus to the trigger', () => {
        const trigger = openDialog();
        const dialog = screen.getByRole('alertdialog');
        const backdrop = dialog.parentElement;
        expect(backdrop).not.toBeNull();
        fireEvent.click(backdrop as HTMLElement);
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    test('Confirm calls requestSubmit exactly once', () => {
        const requestSubmit = vi
            .spyOn(HTMLFormElement.prototype, 'requestSubmit')
            .mockImplementation(function (this: HTMLFormElement) {});
        openDialog();
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
        expect(requestSubmit).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });
});
