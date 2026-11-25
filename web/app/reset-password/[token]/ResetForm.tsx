'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { PasswordField } from '@/components/forms/PasswordField';
import { resetPassword, type ResetState } from './actions';

export function ResetForm({ token, email }: { token: string; email: string }) {
    const [state, action, pending] = useActionState<ResetState, FormData>(resetPassword, { error: '' });

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
                <PasswordField
                    id="password"
                    name="password"
                    showStrength
                    inputClassName="block w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 pr-11 text-sm transition-all placeholder:text-neutral-400 focus:border-[#FD1D1D] focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/15"
                />
            </div>

            <div>
                <label htmlFor="password_confirmation" className="mb-1.5 block text-sm font-semibold text-neutral-700">
                    Confirm new password
                </label>
                <PasswordField
                    id="password_confirmation"
                    name="password_confirmation"
                    placeholder="Repeat the password"
                    inputClassName="block w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 pr-11 text-sm transition-all placeholder:text-neutral-400 focus:border-[#FD1D1D] focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/15"
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
