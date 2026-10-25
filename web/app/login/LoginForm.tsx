'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ChevronRight } from 'lucide-react';
import { login, type LoginState } from './actions';

/**
 * The form, as a client component.
 *
 * ONLY the interactive part is a client component; the page around it is
 * rendered on the server. That is the whole shape of the port: markup on the
 * server, interactivity in a leaf. The legacy page is one 200-line component
 * that ships its entire tree to the browser to make two inputs work.
 *
 * `useActionState` replaces the `useState` pair for error/loading: the action
 * returns the API's message and the pending flag comes from the form itself.
 */
export function LoginForm() {
    const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: '' });

    return (
        <form className="space-y-6" action={action}>
            {state.error !== '' && (
                <div className="p-4 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100 flex items-start gap-3">
                    <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-red-600 shrink-0" />
                    {state.error}
                </div>
            )}

            <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">Email Address</label>
                <input
                    type="email"
                    name="email"
                    required
                    placeholder="your@email.com"
                    autoComplete="email"
                    className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl shadow-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm transition-all focus:bg-white"
                />
            </div>

            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-semibold text-neutral-700">Password</label>
                    <Link href="/forgot-password" className="text-xs font-semibold text-[#FF2D20] hover:text-red-700">
                        Forgot password?
                    </Link>
                </div>
                <input
                    type="password"
                    name="password"
                    required
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl shadow-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm transition-all focus:bg-white"
                />
            </div>

            <button
                type="submit"
                id="login-submit-btn"
                disabled={pending}
                className="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900 transition-all disabled:opacity-50 active:scale-[0.98]"
            >
                {pending ? 'Authenticating...' : 'Sign in to Dashboard'}
                {!pending && <ChevronRight className="w-4 h-4 opacity-70" />}
            </button>
        </form>
    );
}

/**
 * The copyright year, rendered on the CLIENT.
 *
 * The legacy page computes it in the browser, and the visual harness pins the
 * browser's clock. A server-rendered year would use the server clock instead,
 * so the baseline would silently expire every 1 January.
 */
export function CopyrightYear() {
    return <>{new Date().getFullYear()}</>;
}
