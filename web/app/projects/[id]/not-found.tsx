import Link from 'next/link';
import { FolderSearch } from 'lucide-react';

/**
 * Unknown project, unknown tab, or a project the visitor cannot see.
 *
 * `loadProjectPage` maps the API's 403 to `notFound()` on purpose: a
 * stranger must not learn that an id exists, so this page must not
 * distinguish "no such project" from "not yours". One calm page covers all
 * three cases with a way back to work.
 */
export default function ProjectNotFound() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-20">
            <div className="w-full max-w-md text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-900">
                    <FolderSearch className="h-8 w-8 text-white" aria-hidden="true" />
                </div>
                <p className="mt-6 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                    404
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-neutral-900">
                    This project is not here.
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-neutral-500">
                    The link may be broken, the tab may not exist, or this project may belong
                    to someone else. If you were invited, ask the owner to resend the invite.
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    <Link
                        href="/dashboard"
                        className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-neutral-800"
                    >
                        Back to dashboard
                    </Link>
                    <Link
                        href="/help"
                        className="rounded-xl border border-neutral-200 bg-white px-5 py-3 text-sm font-bold text-neutral-700 transition hover:border-neutral-300"
                    >
                        Open help center
                    </Link>
                </div>
            </div>
        </main>
    );
}
