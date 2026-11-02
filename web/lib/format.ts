/** Shared display helpers for the native (ported) panels. */
export function formatIDR(value: string | number | null | undefined): string {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));
    if (!Number.isFinite(parsed)) {
        return 'Rp 0';
    }

    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(parsed);
}

export function titleCase(value: string | null | undefined): string {
    if (!value) {
        return '';
    }

    return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
