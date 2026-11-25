import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UploadInput } from '@/components/forms/UploadInput';

afterEach(() => {
    cleanup();
});

function renderFileInput(maxMB = 2) {
    const view = render(<UploadInput name="doc" maxMB={maxMB} />);
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    return { ...view, input };
}

describe('UploadInput', () => {
    test('names the limit up front', () => {
        renderFileInput(2);
        expect(screen.getByText('Up to 2 MB per file.')).toBeDefined();
    });

    test('over-limit file shows role=alert and clears the input', () => {
        const { input } = renderFileInput(2);
        const big = new File([new Uint8Array(3 * 1024 * 1024)], 'big.png', { type: 'image/png' });
        fireEvent.change(input, { target: { files: [big] } });
        const alert = screen.getByRole('alert');
        expect(alert.textContent).toContain('big.png');
        expect(alert.textContent).toContain('the limit is 2 MB');
        expect(input.value).toBe('');
    });

    test('valid file clears the error', () => {
        const { input } = renderFileInput(2);
        const big = new File([new Uint8Array(3 * 1024 * 1024)], 'big.png', { type: 'image/png' });
        fireEvent.change(input, { target: { files: [big] } });
        expect(screen.getByRole('alert')).toBeDefined();
        const small = new File(['hello'], 'small.png', { type: 'image/png' });
        fireEvent.change(input, { target: { files: [small] } });
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
