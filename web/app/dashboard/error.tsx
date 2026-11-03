'use client';

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="p-6" role="alert">
            <h1 className="text-lg font-black text-neutral-900">Dashboard failed to load</h1>
            <p className="mt-2 text-sm text-neutral-600">
                {error.message || 'An unexpected error occurred.'}
            </p>
            <button
                onClick={reset}
                className="mt-4 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white"
            >
                Try again
            </button>
        </div>
    );
}
