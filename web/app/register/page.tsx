import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sessionToken } from '@/lib/session';
import { RegisterForm } from './RegisterForm';

/**
 * The registration screen — a port of `resources/js/pages/Register.tsx`.
 *
 * The two decorative blurs, the glass card and the two secondary links are
 * reproduced class for class. The framer-motion wrappers are gone: they
 * animated opacity and a 5 % scale, and what they settle to is the plain
 * element.
 *
 * The `!isLoading && user` guard is now the server reading the cookie, so a
 * signed-in visitor is redirected before the page is sent.
 */
export default async function RegisterPage() {
    if (await sessionToken()) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-neutral-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-3xl rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#FF2D20]/10 blur-3xl rounded-full" />

            <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 font-sans">
                    Create an account
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Already have an account?{' '}
                    <Link href="/login" className="font-medium text-[#FF2D20] hover:text-red-500 transition-colors">
                        Sign in instead
                    </Link>
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
                <div className="bg-white/80 backdrop-blur-md py-8 px-4 shadow-xl shadow-black/5 ring-1 ring-black/5 sm:rounded-2xl sm:px-10">
                    <RegisterForm />
                </div>

                <div className="mt-8 text-center text-sm flex flex-col gap-3">
                    <Link href="/login" className="text-sm text-[#FF2D20] hover:text-red-700 font-semibold transition">
                        ← Back to Login
                    </Link>
                    <Link href="/pro/register" className="text-neutral-500 hover:text-neutral-900 transition-colors">
                        Looking to provide services? Apply as a Partner →
                    </Link>
                </div>
            </div>
        </div>
    );
}
