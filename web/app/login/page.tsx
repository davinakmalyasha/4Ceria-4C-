import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BadgeCheck, ChevronRight, FolderKanban, ShieldCheck, Wallet } from 'lucide-react';
import { sessionToken } from '@/lib/session';
import { LoginForm } from './LoginForm';

export const metadata = {
    title: 'Sign in',
};

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string; reset?: string }>;
}) {
    if (await sessionToken()) {
        redirect('/dashboard');
    }

    const { next, reset } = await searchParams;
    const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : undefined;

    return (
        <div className="relative flex min-h-screen overflow-hidden bg-white font-sans">
            <div className="relative hidden w-1/2 flex-col justify-between border-r border-neutral-200 bg-neutral-50 p-12 lg:flex">
                <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-[#FD1D1D] to-red-400" />
                <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-red-500/5 blur-3xl" />

                <Link
                    href="/"
                    className="relative z-10 inline-flex items-center gap-2 text-2xl font-black tracking-tighter text-neutral-900"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/Logo4C.png" alt="" className="h-9 w-9" />
                    4Ceria<span className="text-[#FD1D1D]">.</span>
                </Link>

                <div className="relative z-10 my-16 max-w-md">
                    <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-neutral-900">
                        Run the build,
                        <br />
                        <span className="text-[#FD1D1D]">not the group chat.</span>
                    </h1>
                    <p className="mt-4 text-base leading-relaxed text-neutral-500">
                        Bids, contracts, milestones, materials and payments in one workspace — with a
                        ledger both sides can check.
                    </p>

                    <ul className="mt-10 space-y-5">
                        {[
                            { icon: FolderKanban, title: 'One project workspace', text: 'Brief, bids, files and daily progress.' },
                            { icon: Wallet, title: 'Escrow per milestone', text: 'Money moves only when work is approved.' },
                            { icon: BadgeCheck, title: 'Verified professionals', text: 'Seven roles, one accountable directory.' },
                        ].map((item) => (
                            <li key={item.title} className="flex items-center gap-4">
                                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-neutral-100 bg-white shadow-sm">
                                    <item.icon className="h-5 w-5 text-[#FD1D1D]" />
                                </span>
                                <span>
                                    <span className="block text-sm font-bold text-neutral-900">{item.title}</span>
                                    <span className="block text-xs text-neutral-500">{item.text}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="relative z-10 text-xs text-neutral-400">
                    © {new Date().getFullYear()} 4Ceria · Creative Construction
                </p>
            </div>

            <div className="relative flex w-full flex-col justify-center bg-white px-6 py-12 lg:w-1/2 lg:px-24">
                <div className="mb-8 flex items-center justify-between lg:hidden">
                    <Link href="/" className="inline-flex items-center gap-2 text-xl font-black tracking-tighter">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/assets/Logo4C.png" alt="" className="h-8 w-8" />
                        4Ceria<span className="text-[#FD1D1D]">.</span>
                    </Link>
                    <Link
                        href="/"
                        className="text-xs font-semibold text-neutral-500 transition hover:text-[#FD1D1D]"
                    >
                        Back to home
                    </Link>
                </div>

                <div className="mx-auto w-full max-w-md">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FD1D1D]">
                            Welcome back
                        </p>
                        <h2 className="mt-2 text-3xl font-bold tracking-tight text-neutral-900">
                            Sign in to 4Ceria
                        </h2>
                        <p className="mt-2 text-sm text-neutral-500">
                            New here?{' '}
                            <Link
                                href="/register"
                                className="font-semibold text-[#FD1D1D] transition hover:text-red-700"
                            >
                                Create an owner account
                            </Link>{' '}
                            or{' '}
                            <Link
                                href="/pro/register"
                                className="font-semibold text-[#FD1D1D] transition hover:text-red-700"
                            >
                                join as a professional
                            </Link>
                            .
                        </p>
                    </div>

                    <div className="mt-8">
                        {reset === '1' && (
                            <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                                Password updated. Sign in with your new password.
                            </div>
                        )}
                        <LoginForm next={safeNext} />
                    </div>

                    <div className="mt-10 flex items-center gap-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                        <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
                        <p className="text-[11px] leading-relaxed text-neutral-500">
                            Sessions use an httpOnly cookie. Your access token is never stored in
                            browser JavaScript.
                        </p>
                    </div>

                    <div className="mt-8 flex items-center justify-between border-t border-neutral-100 pt-6">
                        <div>
                            <p className="text-sm font-bold text-neutral-800">Hiring for a project?</p>
                            <p className="text-xs text-neutral-500">Post it once; compare the bids.</p>
                        </div>
                        <Link
                            href="/register"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-xs font-bold text-[#FD1D1D] transition hover:shadow-md active:scale-95"
                        >
                            Get started <ChevronRight className="h-3 w-3" />
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
