'use client';

import {
    Armchair, Briefcase, Building2, HardHat, Shield, Store, Truck, Wrench, Zap,
} from 'lucide-react';
import { useActionState, useState } from 'react';
import { registerProfessional, type ProRegisterState } from './actions';

/**
 * The professional-registration form — a port of `ProfessionalRegister.tsx`.
 *
 * TWO PIECES OF STATE REMAIN, and they are genuinely UI state:
 *
 *   - which role card is selected (the submit carries it, but the cards have to
 *     paint the selection before the request);
 *   - which SPECIALTY was chosen when "Specialty Subcontractor" is selected,
 *     because that card covers six different `role_type` values.
 *
 * Everything else is a server action: the form is uncontrolled and posts its
 * `FormData`.
 */

const ROLES = [
    { id: 'arsitek', label: 'Architect', desc: 'Design homes & submit plans', icon: Building2 },
    { id: 'kontraktor', label: 'Constructor', desc: 'Quote & execute physical builds', icon: HardHat },
    { id: 'notaris', label: 'Notaris', desc: 'Land certificates & permits', icon: Shield },
    { id: 'interior', label: 'Interior Designer', desc: 'Furniture & space layouts', icon: Armchair },
    { id: 'structural', label: 'Structural Engineer', desc: 'Foundation & steel calcs', icon: Wrench },
    { id: 'mep', label: 'MEP Engineer', desc: 'Mechanical, electrical & plumbing', icon: Zap },
    { id: 'project_manager', label: 'Project Manager', desc: 'Coordinate and manage execution', icon: Briefcase },
    { id: 'supplier', label: 'Material Supplier', desc: 'Supply materials to marketplace', icon: Store },
    { id: 'logistics', label: 'Logistics / Courier', desc: 'Fulfill deliveries & cargo shipping', icon: Truck },
    { id: 'subcontractor', label: 'Specialty Subcontractor', desc: 'Concrete, wiring, piping & trades', icon: HardHat },
] as const;

const SUBCONTRACTOR_ROLES = ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'] as const;

type SubcontractorRole = (typeof SUBCONTRACTOR_ROLES)[number];

export function ProRegisterForm() {
    const [state, action, pending] = useActionState<ProRegisterState, FormData>(registerProfessional, { error: '' });
    const [roleType, setRoleType] = useState<string>('arsitek');
    const [subcontractorRole, setSubcontractorRole] = useState<SubcontractorRole>('civil');

    const isSubcontractorRole = (SUBCONTRACTOR_ROLES as readonly string[]).includes(roleType);

    const selectRole = (role: string) => {
        if (role === 'subcontractor') {
            setRoleType(subcontractorRole);
        } else {
            setRoleType(role);
        }
    };

    return (
        <form action={action} className="space-y-6">
            {state.error !== '' && (
                <div className="p-4 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100 flex items-start gap-3">
                    <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-red-600 shrink-0" />
                    {state.error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">Company / Full Name</label>
                    <input type="text" name="name" required className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm focus:bg-white transition-all shadow-sm" />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">Username</label>
                    <input type="text" name="username" required className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm focus:bg-white transition-all shadow-sm" />
                </div>
            </div>

            <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">Work Email Address</label>
                <input type="email" name="email" required className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm focus:bg-white transition-all shadow-sm" />
            </div>

            <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">I am signing up as</label>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {ROLES.map((role) => {
                        const Icon = role.icon;
                        const isSelected = role.id === 'subcontractor' ? isSubcontractorRole : roleType === role.id;

                        return (
                            <label
                                key={role.id}
                                className={`relative cursor-pointer rounded-xl border-2 p-2 flex items-center gap-2.5 transition-all ${
                                    isSelected
                                        ? 'border-[#FF2D20] bg-red-50/50 shadow-sm font-medium'
                                        : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
                                }`}
                            >
                                <div className={`p-1.5 rounded-full shrink-0 ${isSelected ? 'bg-[#FF2D20] text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                                    <Icon className="w-4 h-4" />
                                </div>
                                <div className="text-left min-w-0 flex-1">
                                    <div className={`font-bold text-xs truncate ${isSelected ? 'text-[#FF2D20]' : 'text-neutral-700'}`}>{role.label}</div>
                                    <div className="text-[9px] text-neutral-400 truncate leading-none mt-0.5" title={role.desc}>{role.desc}</div>
                                </div>
                                <input
                                    type="radio"
                                    name="role_type"
                                    value={role.id === 'subcontractor' ? subcontractorRole : role.id}
                                    checked={isSelected}
                                    onChange={() => selectRole(role.id)}
                                    className="sr-only"
                                />
                            </label>
                        );
                    })}
                </div>
            </div>

            {isSubcontractorRole && (
                <div className="p-4 rounded-xl border-2 border-[#FF2D20]/30 bg-red-50/30">
                    <label className="block text-xs font-black text-neutral-500 uppercase tracking-wider mb-2">
                        Select Your Specialized Trade Option
                    </label>
                    <select
                        value={roleType}
                        onChange={(e) => {
                            const value = e.target.value as SubcontractorRole;
                            setSubcontractorRole(value);
                            setRoleType(value);
                        }}
                        className="block w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm transition-all shadow-sm font-semibold text-neutral-700 cursor-pointer"
                    >
                        <option value="civil">Civil &amp; Concrete Specialist</option>
                        <option value="mechanical">Mechanical Specialist (HVAC, Elevators, Fire)</option>
                        <option value="electrical">Electrical Specialist (Wiring, Panels)</option>
                        <option value="plumbing">Plumbing Specialist (Water supply, Drainage)</option>
                        <option value="roofing">Roofing &amp; Waterproofing Specialist</option>
                        <option value="finishing">Finishing Specialist (Tiling, Painting, Facade)</option>
                    </select>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">Password</label>
                    <input type="password" name="password" required className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm focus:bg-white transition-all shadow-sm" />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">Confirm Password</label>
                    <input type="password" name="password_confirmation" required className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm focus:bg-white transition-all shadow-sm" />
                </div>
            </div>

            <div className="pt-2">
                <button
                    disabled={pending}
                    type="submit"
                    className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900 transition-all disabled:opacity-50 active:scale-[0.98]"
                >
                    {pending ? 'Creating business profile...' : 'Apply for Professional Access'}
                </button>
            </div>
        </form>
    );
}
