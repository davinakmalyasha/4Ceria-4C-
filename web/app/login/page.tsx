import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Home, ShieldCheck } from 'lucide-react';
import { sessionToken } from '@/lib/session';
import { CopyrightYear, LoginForm } from './LoginForm';

/**
 * The login screen — a BYTE-FOR-BYTE port of `resources/js/pages/Login.tsx`.
 *
 * WHAT IS DELIBERATELY IDENTICAL
 * ------------------------------
 * Every class string, every text node, every icon and its size, and the order
 * of the two halves. The visual baseline (`guest.route.login.png`) was captured
 * from the legacy page, and this markup has to produce the same pixels; the
 * comments in the JSX are the only additions.
 *
 * WHAT IS STRUCTURALLY DIFFERENT
 * ------------------------------
 * The page is a SERVER component. The only client code is the form
 * (`LoginForm.tsx`), because that is the only part that needs state. The
 * framer-motion wrappers are gone: they animated `opacity: 0 -> 1` and `y: 20 ->
 * 0`, and the settled state they leave behind is the plain element. Reproducing
 * an entry animation is not worth shipping a runtime for — the visual contract
 * compares SETTLED screens (P-6 explicitly excludes animation timing).
 *
 * An authenticated visitor is redirected to the dashboard on the SERVER, from
 * the cookie, before any markup is sent. The legacy page does it after the
 * bundle loads and after `/me` answers.
 */
export default async function LoginPage() {
    if (await sessionToken()) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-white flex relative overflow-hidden font-sans">
            {/* Left Side - Brand & Trust */}
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
                            Real Estate & <br />
                            <span className="text-[#FF2D20]">Professional Marketplace.</span>
                        </h1>
                        <p className="mt-4 text-lg text-neutral-600 leading-relaxed">
                            The most complete platform to buy houses, hire elite architects, and manage building projects seamlessly.
                        </p>
                    </div>

                    <div className="mt-12 space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-neutral-100 flex items-center justify-center">
                                <Home className="w-6 h-6 text-[#FF2D20]" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Explore Properties</h3>
                                <p className="text-sm text-neutral-500">Buy or sell your home with ease</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-neutral-100 flex items-center justify-center">
                                <ShieldCheck className="w-6 h-6 text-[#FF2D20]" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Hire verified talent</h3>
                                <p className="text-sm text-neutral-500">Connect with elite architects & constructors</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative z-10">
                    <p className="text-sm text-neutral-400">© <CopyrightYear /> 4Ceria Creative Construction</p>
                </div>
            </div>

            {/* Right Side - Universal Login Form */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 py-12 lg:px-24 bg-white relative">
                <div className="absolute top-8 left-8 lg:left-24">
                    <Link
                        href="/"
                        className="text-sm font-semibold text-neutral-500 hover:text-[#FF2D20] transition-colors flex items-center gap-2"
                    >
                        ← Back to Home
                    </Link>
                </div>

                <div className="w-full max-w-md mx-auto">
                    <div>
                        <h2 className="text-3xl font-bold text-neutral-900 tracking-tight">Welcome Back</h2>
                        <p className="mt-2 text-neutral-500">
                            Don&apos;t have an account?{' '}
                            <Link href="/register" className="font-medium text-[#FF2D20] hover:text-red-700 transition-colors">
                                Create account
                            </Link>
                        </p>
                    </div>

                    <div className="mt-8">
                        <LoginForm />
                    </div>

                    <div className="mt-12 pt-8 border-t border-neutral-100">
                        <div className="p-4 bg-neutral-50 rounded-2xl flex items-center justify-between gap-4">
                            <div>
                                <h4 className="text-sm font-bold text-neutral-800">Become a Partner</h4>
                                <p className="text-xs text-neutral-500">For Architects & Constructors</p>
                            </div>
                            <Link
                                href="/pro/register"
                                className="inline-flex items-center gap-1.5 py-2 px-4 bg-white border border-neutral-200 text-[#FF2D20] text-xs font-bold rounded-lg hover:shadow-md transition-all active:scale-95"
                            >
                                Get Started <ChevronRight className="w-3 h-3" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
