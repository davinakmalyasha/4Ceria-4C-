import Link from 'next/link';

/**
 * Unknown URLs answer 404: a renamed panel, project or tab must not render
 * the overview (or anything else) with a 200, or a removed screen keeps
 * "working" forever and strangers can probe ids by status code.
 */
export default function NotFound() {
    return (
        <div className="min-h-screen bg-neutral-100 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-10 text-center max-w-md">
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">404</p>
                <h1 className="mt-2 text-2xl font-black text-neutral-900">This page could not be found</h1>
                <p className="mt-2 text-sm text-neutral-500">
                    The link may be broken, or the page may have been moved or removed.
                </p>
                <Link
                    href="/dashboard"
                    className="mt-6 inline-block px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-black uppercase tracking-wider hover:bg-neutral-700"
                >
                    Back to dashboard
                </Link>
            </div>
        </div>
    );
}
