import React, { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import axios from 'axios';
import { ProfilePreviewCard } from '../Shared/ProfilePreviewCard';
import { PortfolioManager } from './PortfolioManager';
import { PortfolioProject } from '../../types/project.types';
import { getApiErrorMessage } from '../../utils/apiError';

interface Props {
    user: any;
    setIsEditingProfile: (v: boolean) => void;
}

export const UserProfileView: React.FC<Props> = ({ user, setIsEditingProfile }) => {
    const [portfolios, setPortfolios] = useState<PortfolioProject[]>([]);

    useEffect(() => {
        if (user?.id) {
            axios.get(`/portfolios?user_id=${user.id}`)
                .then(res => setPortfolios(res.data))
                .catch((err) => { console.warn(getApiErrorMessage(err, 'Failed to load portfolios')); });
        }
    }, [user?.id]);

    const isProfessional = user?.role_type !== 'user';

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Rich Profile Card */}
            {isProfessional ? (
                <ProfilePreviewCard 
                    user={user} 
                    portfolios={portfolios} 
                    showPortfolioManager={false}
                    onEdit={() => setIsEditingProfile(true)}
                />
            ) : (
                <div className="space-y-6">
                    <BasicUserCard user={user} />
                    <button 
                        onClick={() => setIsEditingProfile(true)}
                        className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-black transition-all shadow-lg"
                    >
                        <Pencil size={16} />
                        Edit Profile Details
                    </button>
                </div>
            )}
        </div>
    );
};

/* ─── Fallback for regular users (non-professional) ──────── */

const BasicUserCard: React.FC<{ user: any }> = ({ user }) => (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center text-white text-3xl font-black shadow-xl">
                {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
                <h4 className="text-2xl font-bold text-gray-900">{user?.name}</h4>
                <p className="text-gray-500">{user?.email}</p>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                    @{user?.username}
                </p>
            </div>
        </div>
        {user?.phone_number && user.phone_number.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-100">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Phone</label>
                <p className="text-sm font-bold text-gray-700">
                    {user.phone_number.map((p: { contact: string }) => p.contact).join(', ')}
                </p>
            </div>
        )}
    </div>
);
