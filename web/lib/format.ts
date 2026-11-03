/** Shared display helpers for the native (ported) panels. */
export function formatIDR(value: string | number | null | undefined): string {
    // Exact, string-based: never go through a float (which cannot represent
    // sen exactly past 2^53 and would round large ceilings). Accepts the
    // server's decimal strings ("10000000.00"), plain integers, or numbers.
    let text: string;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return 'Rp 0';
        }
        // Numbers are already rounded by the caller; render without sen.
        text = Math.trunc(value).toString();
    } else {
        text = String(value ?? '0').trim();
        if (text === '') {
            return 'Rp 0';
        }
        // Strip grouping the server never sends but a client string might.
        text = text.replace(/[\s_]/g, '');
        let neg = false;
        if (text.startsWith('-')) {
            neg = true;
            text = text.slice(1);
        } else if (text.startsWith('+')) {
            text = text.slice(1);
        }
        // Split decimals; drop sen for display (whole rupiah, like the
        // legacy `number_format(..., 0, ',', '.')` receipt figure).
        const dot = text.indexOf('.');
        let whole = dot >= 0 ? text.slice(0, dot) : text;
        whole = whole.replace(/^0+(?=\d)/, '');
        if (whole === '' || !/^\d+$/.test(whole)) {
            return 'Rp 0';
        }
        text = (neg ? '-' : '') + whole;
    }

    let neg = false;
    if (text.startsWith('-')) {
        neg = true;
        text = text.slice(1);
    }
    // Group thousands with dots (id-ID).
    let grouped = '';
    for (let i = 0; i < text.length; i++) {
        if (i > 0 && (text.length - i) % 3 === 0) {
            grouped += '.';
        }
        grouped += text[i];
    }
    return (neg ? '-Rp ' : 'Rp ') + grouped;
}

export function titleCase(value: string | null | undefined): string {
    if (!value) {
        return '';
    }

    return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
