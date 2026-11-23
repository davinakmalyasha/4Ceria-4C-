import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { sessionToken } from '@/lib/session';
import { ResetForm } from './ResetForm';

export const metadata = { title: 'Reset password' };

export default async function ResetPasswordPage({
    params,
    searchParams,
}: {
    params: Promise<{ token: string }>;
    searchParams: Promise<{ email?: string }>;
}) {
    if (await sessionToken()) {
        redirect('/dashboard');
    }

    const { token } = await params;
    const { email } = await searchParams;

    if (!token || !email) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-16">
                <div className="max-w-md text-center">
                    <KeyRound className="mx-auto h-10 w-10 text-[#FD1D1D]" />
                    <h1 className="mt-5 text-2xl font-black tracking-tight">This reset link is incomplete.</h1>
                    <p className="mt-3 text-sm leading-relaxed text-neutral-500">
                        Use the full link from the email, or request a new password reset.
                    </p>
                    <Link
                        href="/forgot-password"
                        className="mt-6 inline-block rounded-xl bg-neutral-900 px-5 py-3 text-sm font-bold text-white"
                    >
                        Request a new link
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-16 font-sans">
            <div className="w-full max-w-md rounded-3xl border border-neutral-100 bg-white p-8 shadow-xl shadow-neutral-200/50">
                <Link href="/" className="inline-flex items-center gap-2 text-lg font-black tracking-tighter">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/Logo4C.png" alt="" className="h-8 w-8" />
                    4Ceria<span className="text-[#FD1D1D]">.</span>
                </Link>
                <h1 className="mt-6 text-2xl font-black tracking-tight">Choose a new password</h1>
                <p className="mt-2 text-sm text-neutral-500">
                    Pick something you have not used before. You will be signed out everywhere else.
                </p>
                <div className="mt-6">
                    <ResetForm token={token} email={email} />
                </div>
                <Link
                    href="/login"
                    className="mt-6 block text-center text-xs font-semibold text-neutral-500 transition hover:text-[#FD1D1D]"
                >
                    Back to sign in
                </Link>
            </div>
        </main>
    );
}
