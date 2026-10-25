'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { requestReset, type ForgotState } from './actions';

/**
 * The reset form, and the "check your email" panel it becomes.
 *
 * Both states are rendered by this one client component because the transition
 * between them is local to the form. The SUCCESS PANEL is reproduced exactly —
 * including the "try again" button, which returns to the form without a reload.
 */
export function ForgotForm() {
    const [state, action, pending] = useActionState<ForgotState, FormData>(requestReset, {
        sent: false,
        error: '',
        email: '',
    });

    if (state.sent) {
        return (
            <div className="p-6 rounded-2xl bg-green-50 border border-green-100">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <ShieldCheck className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-green-800 mb-2">Check your email</h3>
                <p className="text-sm text-green-700 leading-relaxed">
                    If an account with that email exists, we&apos;ve sent a password reset link to{' '}
                    <strong>{state.email}</strong>.
                </p>
                <p className="mt-3 text-sm text-green-600">
                    Didn&apos;t receive the email? Check your spam folder or{' '}
                    <Link href="/forgot-password" className="font-semibold text-green-800 hover:text-green-900 underline">
                        try again
                    </Link>
                    .
                </p>
                <div className="mt-6 pt-4 border-t border-green-200">
                    <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-green-800 hover:text-green-900">
                        ← Back to Login
                    </Link>
                </div>
            </div>
        );
    }

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
                    className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl shadow-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm transition-all focus:bg-white"
                />
            </div>

            <button
                type="submit"
                disabled={pending}
                className="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900 transition-all disabled:opacity-50 active:scale-[0.98]"
            >
                {pending ? 'Sending...' : 'Send Reset Link'}
                {!pending && <ChevronRight className="w-4 h-4 opacity-70" />}
            </button>
        </form>
    );
}
