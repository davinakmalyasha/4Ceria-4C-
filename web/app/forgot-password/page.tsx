import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Home, ShieldCheck } from 'lucide-react';
import { sessionToken } from '@/lib/session';
import { ForgotForm } from './ForgotForm';

/**
 * The "forgot password" screen — a port of `resources/js/pages/ForgotPassword.tsx`.
 *
 * The left column is the same brand panel as the login screen with different
 * copy; the right column is the same form shell with a different submit label.
 * Both are reproduced class for class, and the copyright year is rendered on the
 * CLIENT for the reason the login page records: the visual harness pins the
 * browser clock, not the server's.
 */
export default async function ForgotPasswordPage() {
    if (await sessionToken()) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-white flex relative overflow-hidden font-sans">
            <div className="hidden lg:flex lg:w-1/2 bg-neutral-50 relative flex-col justify-between p-12 border-r border-neutral-200">
                <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-[#FF2D20] to-red-400" />

                <div className="relative z-10 text-neutral-900">
                    <Link href="/" className="text-2xl font-black tracking-tighter inline-flex items-center gap-2">
                        <div className="w-8 h-8 bg-[#FF2D20] rounded-lg shadow-sm shadow-red-500/20 flex items-center justify-center">
                            <span className="text-white font-bold text-xs">4C</span>
                        </div>
                        4Ceria<span className="text-[#FF2D20]">.</span>
                    </Link>

                    <div className="mt-24 max-w-md">
                        <h1 className="text-4xl font-extrabold leading-tight text-neutral-900">
                            Forgot your <br />
                            <span className="text-[#FF2D20]">Password?</span>
                        </h1>
                        <p className="mt-4 text-lg text-neutral-600 leading-relaxed">
                            No worries — enter your email and we&apos;ll send you a link to reset it.
                        </p>
                    </div>

                    <div className="mt-12 space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-neutral-100 flex items-center justify-center">
                                <ShieldCheck className="w-6 h-6 text-[#FF2D20]" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Secure &amp; Fast</h3>
                                <p className="text-sm text-neutral-500">Your data is encrypted and protected</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-neutral-100 flex items-center justify-center">
                                <Home className="w-6 h-6 text-[#FF2D20]" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Back to your projects</h3>
                                <p className="text-sm text-neutral-500">Resume where you left off in minutes</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative z-10">
                    <p className="text-sm text-neutral-400">© {new Date().getFullYear()} 4Ceria Creative Construction</p>
                </div>
            </div>

            <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 py-12 lg:px-24 bg-white relative">
                <div className="absolute top-8 left-8 lg:left-24">
                    <Link href="/login" className="text-sm font-semibold text-neutral-500 hover:text-[#FF2D20] transition-colors flex items-center gap-2">
                        ← Back to Login
                    </Link>
                </div>

                <div className="w-full max-w-md mx-auto">
                    <div>
                        <h2 className="text-3xl font-bold text-neutral-900 tracking-tight">Reset Password</h2>
                        <p className="mt-2 text-neutral-500">
                            Remember your password?{' '}
                            <Link href="/login" className="font-medium text-[#FF2D20] hover:text-red-700 transition-colors">
                                Sign in
                            </Link>
                        </p>
                    </div>

                    <div className="mt-8">
                        <ForgotForm />
                    </div>
                </div>
            </div>
        </div>
    );
}
