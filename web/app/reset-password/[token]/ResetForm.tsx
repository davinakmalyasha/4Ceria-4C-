'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { resetPassword, type ResetState } from './actions';

export function ResetForm({ token, email }: { token: string; email: string }) {
    const [state, action, pending] = useActionState<ResetState, FormData>(resetPassword, { error: '' });
    const [show, setShow] = useState(false);

    return (
        <form action={action} className="space-y-5">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="email" value={email} />

            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
                Resetting the password for <b>{email}</b>.
            </div>

            {state.error !== '' && (
                <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                    {state.error}
                    <p className="mt-1 text-xs text-red-500">
                        Reset links expire after 60 minutes. Request a new one from{' '}
                        <Link href="/forgot-password" className="font-bold underline">
                            forgot password
                        </Link>
                        .
                    </p>
                </div>
            )}

            <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-neutral-700">
                    New password
                </label>
                <div className="relative">
                    <input
                        id="password"
                        name="password"
                        type={show ? 'text' : 'password'}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        className="block w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 pr-11 text-sm transition-all placeholder:text-neutral-400 focus:border-[#FD1D1D] focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/15"
                    />
                    <button
                        type="button"
                        onClick={() => setShow((value) => !value)}
                        aria-label={show ? 'Hide password' : 'Show password'}
                        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-neutral-400 transition hover:text-neutral-700"
                    >
                        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            <div>
                <label htmlFor="password_confirmation" className="mb-1.5 block text-sm font-semibold text-neutral-700">
                    Confirm new password
                </label>
                <input
                    id="password_confirmation"
                    name="password_confirmation"
                    type={show ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Repeat the password"
                    className="block w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm transition-all placeholder:text-neutral-400 focus:border-[#FD1D1D] focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/15"
                />
            </div>

            <button
                type="submit"
                disabled={pending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-neutral-200 transition hover:bg-neutral-800 disabled:opacity-60"
            >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {pending ? 'Updating…' : 'Set new password'}
            </button>

            <p className="text-center text-xs text-neutral-400">
                This also signs out every other device using the old password.
            </p>
        </form>
    );
}
