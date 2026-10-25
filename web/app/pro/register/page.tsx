import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Briefcase, CheckCircle2 } from 'lucide-react';
import { apiOrigin, sessionToken } from '@/lib/session';
import { ProRegisterForm } from './ProRegisterForm';
import { signOut } from './actions';

/**
 * The professional-registration screen — a port of `ProfessionalRegister.tsx`.
 *
 * TWO STATES, BOTH SERVER-RENDERED.
 *
 *   1. No session: the form.
 *   2. A session whose role is ALREADY professional: a redirect to the
 *      dashboard — done here, before any markup, instead of after the bundle
 *      loads and `/me` answers.
 *   3. A session with a STANDARD user: the "Partner Portal" panel, which asks
 *      them to sign out first. It names the account, so the server fetches it
 *      once; the legacy reads it from `localStorage`.
 *
 * The panel's sign-out is a form posting to a server action: the token is
 * revoked server-side and the cookie dropped, so the next request really is
 * anonymous.
 */

const PROFESSIONAL_ROLES = [
    'arsitek', 'kontraktor', 'notaris', 'interior', 'structural', 'mep',
    'project_manager', 'supplier', 'logistics', 'civil', 'mechanical',
    'electrical', 'plumbing', 'roofing', 'finishing',
];

const BENEFITS = [
    'Access high-budget premium projects.',
    'Verified client intent & direct chatting.',
    'Manage your portfolio, bids, and invoices in one dashboard.',
    'Exclusive tools for real estate development.',
];

type Me = { email: string; role_type: string };

async function currentUser(token: string): Promise<Me | null> {
    const response = await fetch(`${apiOrigin()}/api/me`, {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Requested-With': 'XMLHttpRequest',
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        return null;
    }

    const body = (await response.json()) as { data: Me };

    return body.data;
}

export default async function ProfessionalRegisterPage() {
    const token = await sessionToken();
    const user = token ? await currentUser(token) : null;

    if (user && PROFESSIONAL_ROLES.includes(user.role_type)) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen flex bg-white font-sans relative">
            {/* Left Side - Brand & Trust */}
            <div className="hidden lg:flex lg:w-1/3 bg-neutral-900 border-r border-neutral-800 flex-col p-10 justify-between text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#FF2D20]/10 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />

                <div className="relative z-10 w-full max-w-sm">
                    <Link href="/" className="text-2xl font-black tracking-tighter text-white inline-flex items-center gap-2">
                        <div className="w-8 h-8 bg-[#FF2D20] rounded-lg flex items-center justify-center">
                            <Briefcase className="w-4 h-4 text-white" />
                        </div>
                        4C<span className="text-[#FF2D20]">Pro</span>
                    </Link>

                    <div className="mt-20">
                        <h2 className="text-3xl font-bold leading-snug">Become a verified professional.</h2>
                        <ul className="mt-8 space-y-6">
                            {BENEFITS.map((text, i) => (
                                <li key={i} className="flex items-start gap-4">
                                    <CheckCircle2 className="w-6 h-6 text-[#FF2D20] shrink-0" />
                                    <span className="text-neutral-300 text-sm leading-relaxed">{text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="relative z-10 text-neutral-500 text-xs mt-auto pt-8">
                    © {new Date().getFullYear()} 4Ceria Platform Solutions
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-2/3 flex flex-col justify-center items-center p-6 sm:p-12 relative">
                <div className="w-full max-w-xl">
                    <div className="mb-10 lg:hidden">
                        <Link href="/" className="text-2xl font-black tracking-tighter text-neutral-900 inline-flex items-center gap-2">
                            <div className="w-8 h-8 bg-[#FF2D20] rounded-lg">
                                <Briefcase className="w-full h-full text-white p-1.5" />
                            </div>
                            4C<span className="text-[#FF2D20]">Pro</span>
                        </Link>
                    </div>

                    {user ? (
                        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center mx-auto">
                            <div className="w-16 h-16 bg-red-100 text-[#FF2D20] rounded-full flex items-center justify-center mx-auto mb-6">
                                <Briefcase size={32} />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Partner Portal</h2>
                            <p className="text-gray-600 mb-8 leading-relaxed">
                                You are currently logged in as a standard user (<span className="font-medium text-gray-900">{user.email}</span>). To register a partner account, please sign out of your personal account first.
                            </p>
                            <div className="space-y-3">
                                <Link href="/dashboard" className="block w-full py-3 px-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-900 font-semibold rounded-xl transition-all shadow-sm">
                                    Return to My Dashboard
                                </Link>
                                <form action={signOut}>
                                    <button type="submit" className="block w-full py-3 px-4 bg-[#FF2D20] hover:bg-red-700 text-white font-semibold rounded-xl transition-all shadow-sm active:scale-[0.98]">
                                        Sign Out Current Account
                                    </button>
                                </form>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="mb-8">
                                <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight">Create your business profile</h1>
                                <div className="mt-3 flex flex-col gap-2 text-sm">
                                    <Link href="/login" className="font-semibold text-[#FF2D20] hover:text-red-700 transition flex items-center gap-1.5">
                                        <span>← Back to Login</span>
                                    </Link>
                                    <Link href="/register" className="text-neutral-500 hover:text-neutral-800 transition">
                                        Looking to buy or hire instead? <span className="font-bold text-[#FF2D20] hover:underline">Create a user account →</span>
                                    </Link>
                                </div>
                            </div>

                            <ProRegisterForm />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
