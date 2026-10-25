'use client';

import { useActionState } from 'react';
import { register, type RegisterState } from './actions';

/**
 * The registration form.
 *
 * The legacy keeps six fields in `useState` and posts an object. Here the form
 * is UNCONTROLLED and posts its `FormData` to a server action — the same six
 * fields, the same names, the same attributes, so the markup the baseline
 * describes is unchanged.
 */
export function RegisterForm() {
    const [state, action, pending] = useActionState<RegisterState, FormData>(register, { error: '' });

    return (
        <form className="space-y-5" action={action}>
            {state.error !== '' && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
                    {state.error}
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Full Name</label>
                    <input type="text" name="name" required className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-[#FF2D20]/50 focus:border-[#FF2D20] sm:text-sm bg-white/50" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Username</label>
                    <input type="text" name="username" required className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-[#FF2D20]/50 focus:border-[#FF2D20] sm:text-sm bg-white/50" />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700">Email address</label>
                <input type="email" name="email" required className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-[#FF2D20]/50 focus:border-[#FF2D20] sm:text-sm bg-white/50" />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700">Account Type</label>
                <select name="role_type" defaultValue="user" className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-[#FF2D20]/50 focus:border-[#FF2D20] sm:text-sm bg-white/50">
                    <option value="user">User (Looking for Services)</option>
                </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <input type="password" name="password" required className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-[#FF2D20]/50 focus:border-[#FF2D20] sm:text-sm bg-white/50" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
                    <input type="password" name="password_confirmation" required className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-[#FF2D20]/50 focus:border-[#FF2D20] sm:text-sm bg-white/50" />
                </div>
            </div>

            <div>
                <button type="submit" disabled={pending} className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-md text-sm font-semibold text-white bg-[#FF2D20] hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50">
                    {pending ? 'Creating account...' : 'Register'}
                </button>
            </div>
        </form>
    );
}
