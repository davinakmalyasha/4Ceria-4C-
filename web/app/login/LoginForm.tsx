'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { ChevronRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { login, type LoginState } from './actions';

const DEMO_ACCOUNTS = [
    { label: 'Owner', email: 'client@example.test', hint: 'posts projects, approves milestones' },
    { label: 'Contractor', email: 'anindia@example.test', hint: 'bids, manages delivery' },
    { label: 'Admin', email: 'admin@4c.id', hint: 'moderation, disputes, audit' },
] as const;

export function LoginForm({ next }: { next?: string }) {
    const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: '' });
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    return (
        <form className="space-y-5" action={action} noValidate>
            {next && <input type="hidden" name="next" value={next} />}

            {state.error !== '' && (
                <div
                    role="alert"
                    className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"
                >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" />
                    {state.error}
                </div>
            )}

            <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-neutral-700">
                    Email address
                </label>
                <input
                    id="email"
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    aria-invalid={state.error !== ''}
                    className="block w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm shadow-sm transition-all placeholder:text-neutral-400 focus:border-[#FD1D1D] focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/15"
                />
            </div>

            <div>
                <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="password" className="block text-sm font-semibold text-neutral-700">
                        Password
                    </label>
                    <Link
                        href="/forgot-password"
                        className="text-xs font-semibold text-[#FD1D1D] hover:text-red-700"
                    >
                        Forgot password?
                    </Link>
                </div>
                <div className="relative">
                    <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="••••••••"
                        className="block w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 pr-11 text-sm shadow-sm transition-all placeholder:text-neutral-400 focus:border-[#FD1D1D] focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/15"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-neutral-400 transition hover:text-neutral-700"
                    >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            <button
                type="submit"
                disabled={pending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-neutral-200 transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 active:scale-[0.99] disabled:opacity-60"
            >
                {pending ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing in…
                    </>
                ) : (
                    <>
                        Sign in to dashboard
                        <ChevronRight className="h-4 w-4 opacity-70" />
                    </>
                )}
            </button>

            <div className="rounded-2xl border border-neutral-100 bg-neutral-50/70 p-3">
                <p className="px-1 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                    Demo accounts · password 123456
                </p>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                    {DEMO_ACCOUNTS.map((account) => (
                        <button
                            key={account.email}
                            type="button"
                            onClick={() => {
                                setEmail(account.email);
                                setPassword('123456');
                            }}
                            title={account.hint}
                            className="rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-left transition hover:border-red-200 hover:text-[#FD1D1D]"
                        >
                            <span className="block text-[11px] font-black">{account.label}</span>
                            <span className="block truncate text-[9px] font-medium text-neutral-400">
                                {account.email}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </form>
    );
}
