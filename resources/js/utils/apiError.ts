import { AxiosError } from 'axios';

/**
 * Shape of the JSON bodies Laravel can return for a failed request.
 * `message` may be a string OR (422 validation) an array of strings.
 */
interface ApiErrorBody {
    message?: string | string[];
    error?: string;
    errors?: Record<string, string | string[]>;
    exception?: string;
}

/** Pulls the first useful human-readable line out of a Laravel error body. */
function extractMessage(data: unknown): string | null {
    if (!data) return null;

    if (typeof data === 'string') {
        const trimmed = data.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    if (typeof data !== 'object') return null;

    const body = data as ApiErrorBody;

    if (Array.isArray(body.message)) {
        const first = body.message.find((m) => typeof m === 'string' && m.trim().length > 0);
        if (first) return first;
    }

    if (typeof body.message === 'string' && body.message.trim().length > 0) {
        return body.message;
    }

    // 422 validation bag: surface the first field message rather than
    // "The given data was invalid." — the dispute/payment freeze answers
    // live in here.
    if (body.errors && typeof body.errors === 'object') {
        for (const messages of Object.values(body.errors)) {
            if (typeof messages === 'string' && messages.trim().length > 0) return messages;
            if (Array.isArray(messages)) {
                const first = messages.find((m) => typeof m === 'string' && m.trim().length > 0);
                if (first) return first;
            }
        }
    }

    if (typeof body.error === 'string' && body.error.trim().length > 0) {
        return body.error;
    }

    return null;
}

/** Status-code aware copy, used only when the server sent no message at all. */
const STATUS_FALLBACKS: Record<number, string> = {
    400: 'Permintaan tidak valid.',
    401: 'Sesi Anda berakhir. Silakan masuk kembali.',
    403: 'Anda tidak memiliki akses ke bagian ini.',
    404: 'Data yang dimaksud tidak ditemukan.',
    405: 'Metode tidak diizinkan untuk endpoint ini.',
    409: 'Konflik: aksi ini sudah pernah dilakukan atau data sedang dipakai.',
    413: 'Ukuran berkas terlalu besar.',
    419: 'Sesi kedaluwarsa. Silakan muat ulang halaman.',
    422: 'Data tidak memenuhi syarat validasi.',
    429: 'Terlalu banyak permintaan. Coba beberapa saat lagi.',
    500: 'Terjadi kesalahan di server. Tim kami sudah diberi tahu.',
    502: 'Server sedang tidak tersedia.',
    503: 'Layanan sedang dalam pemeliharaan.',
};

/** Returns the HTTP status of a failed request, or `null` when unavailable. */
export function getApiErrorStatus(err: unknown): number | null {
    if (err && typeof err === 'object' && 'isAxiosError' in err) {
        const axiosErr = err as AxiosError<ApiErrorBody>;
        const status = axiosErr.response?.status;
        if (typeof status === 'number') return status;
    }
    return null;
}

/**
 * Resolves the most specific message available for a failed request.
 *
 * This deliberately never invents a message: the server's `message` (and, for
 * 422s, its field-level validation bag) always wins, because domain guards
 * such as the dispute payment-freeze live there. `fallback` is only used when
 * the response carried no usable text — and even then a status-aware default
 * is preferred so the user is not told "Something went wrong" for a 403.
 */
export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
    if (err && typeof err === 'object' && 'isAxiosError' in err) {
        const axiosErr = err as AxiosError<ApiErrorBody>;

        if (axiosErr.response) {
            const fromBody = extractMessage(axiosErr.response.data);
            if (fromBody) return fromBody;
        } else if (axiosErr.code === 'ECONNABORTED') {
            return 'Permintaan took too long to respond. Silakan coba lagi.';
        } else {
            // No response at all: the request never reached the API.
            return 'Tidak dapat terhubung ke server. Periksa koneksi Anda.';
        }
    }

    if (err instanceof Error && err.message && err.message !== 'Network Error') {
        return err.message;
    }

    const status = getApiErrorStatus(err);
    if (status && STATUS_FALLBACKS[status]) return STATUS_FALLBACKS[status];

    return fallback;
}
