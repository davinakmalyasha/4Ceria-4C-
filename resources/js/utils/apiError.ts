import { AxiosError } from 'axios';

export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
    if (err && typeof err === 'object' && 'isAxiosError' in err) {
        const axiosErr = err as AxiosError<{ message?: string }>;
        const data = axiosErr.response?.data;
        if (data && typeof data.message === 'string' && data.message.length > 0) {
            return data.message;
        }
    }
    if (err instanceof Error && err.message) {
        return err.message;
    }
    return fallback;
}
