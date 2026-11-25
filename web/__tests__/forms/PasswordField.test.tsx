import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PasswordField } from '@/components/forms/PasswordField';

afterEach(() => {
    cleanup();
});

describe('PasswordField', () => {
    test('toggles input type and aria-pressed', () => {
        render(<PasswordField name="password" />);
        const input = screen.getByPlaceholderText('At least 8 characters');
        expect(input.getAttribute('type')).toBe('password');
        const toggle = screen.getByRole('button', { name: 'Show password' });
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(toggle);
        expect(input.getAttribute('type')).toBe('text');
        expect(toggle.getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: 'Hide password' })).toBeDefined();
        fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
        expect(input.getAttribute('type')).toBe('password');
    });

    test('defaults maxLength to 72 and respects overrides', () => {
        const view = render(<PasswordField name="password" />);
        expect(screen.getByPlaceholderText('At least 8 characters').getAttribute('maxlength')).toBe('72');
        view.unmount();
        cleanup();
        render(<PasswordField name="password" maxLength={32} />);
        expect(screen.getByPlaceholderText('At least 8 characters').getAttribute('maxlength')).toBe('32');
    });

    test('reports strength labels in an aria-live region', () => {
        render(<PasswordField name="password" showStrength />);
        expect(screen.getByText('Password strength')).toBeDefined();
        const live = screen.getByText('Password strength').closest('[aria-live]');
        expect(live?.getAttribute('aria-live')).toBe('polite');

        const input = screen.getByPlaceholderText('At least 8 characters');
        fireEvent.change(input, { target: { value: 'abc' } });
        expect(screen.getByText('Too short')).toBeDefined();
        fireEvent.change(input, { target: { value: 'abcdefgh' } });
        expect(screen.getByText('Basic')).toBeDefined();
        fireEvent.change(input, { target: { value: 'Abcdefg1' } });
        expect(screen.getByText('Strong')).toBeDefined();
        fireEvent.change(input, { target: { value: 'Abcdefghij12!' } });
        expect(screen.getByText('Very strong')).toBeDefined();
    });
});
