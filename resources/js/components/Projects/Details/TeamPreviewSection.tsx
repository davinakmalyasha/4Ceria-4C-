import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, CheckCircle2, AlertCircle } from 'lucide-react';
import { FirmMember } from '../../../types/sub_professional.types';

export const TeamPreviewSection: React.FC<{ user: { id: number; role_type: string; [key: string]: any } }> = ({ user }) => {
    const [team, setTeam] = useState<FirmMember[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (user?.role_type === 'arsitek' || user?.role_type === 'kontraktor') {
            setIsLoading(true);
            axios.get<{ data: FirmMember[] }>('/firm-members/roster')
                .then(res => setTeam((res.data?.data || []).filter(m => m.status === 'active')))
                .catch(err => console.error('Failed to fetch team roster:', err))
                .finally(() => setIsLoading(false));
        }
    }, [user?.role_type]);

    if (user?.role_type !== 'arsitek' && user?.role_type !== 'kontraktor') return null;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Users size={14} /> Your Team Preview
                </label>
                <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    {team.length} Active Member{team.length !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="border-2 border-dashed border-gray-200 rounded-[2rem] p-6 bg-gray-50/50">
                {isLoading ? (
                    <div className="flex items-center justify-center py-6 gap-2 text-xs font-bold text-gray-400">
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                        Analyzing Team Availability...
                    </div>
                ) : team.length === 0 ? (
                    <div className="text-center py-6 text-gray-400">
                        <Users size={24} className="mx-auto mb-2 text-gray-300" />
                        <p className="text-xs font-bold uppercase tracking-wider">No Active Team Members</p>
                        <p className="text-[10px] mt-1 font-medium">Add specialists in your Dashboard Firm Roster to include them in proposals.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {team.map((fm) => {
                            const isFree = (fm.active_projects_count || 0) === 0;
                            const initials = fm.member?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
                            return (
                                <div key={fm.id} className={`relative p-4 bg-white rounded-2xl border transition-all duration-300 flex items-center gap-3.5 shadow-sm group hover:scale-[1.02] ${isFree ? 'border-emerald-100 hover:border-emerald-300' : 'border-amber-100 hover:border-amber-300'}`}>
                                    <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-slate-50 flex items-center justify-center border border-gray-100">
                                        {fm.member?.pic ? <img src={fm.member.pic} alt={fm.member.name} className="w-full h-full object-cover" /> : <span className="text-xs font-black text-slate-500">{initials}</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h5 className="font-black text-gray-900 text-[13px] leading-snug truncate">{fm.member?.name}</h5>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">{fm.role_in_firm.replace('_', ' ')}</p>
                                    </div>
                                    <div className="flex-shrink-0">
                                        {isFree ? (
                                            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100/50 rounded-xl text-[10px] font-black uppercase tracking-wider">
                                                <CheckCircle2 size={12} className="text-emerald-500 shrink-0" /> Free
                                            </span>
                                        ) : (
                                            <div className="relative group/tooltip flex items-center">
                                                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-100/50 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-help">
                                                    <AlertCircle size={12} className="text-amber-500 shrink-0" /> Busy
                                                </span>
                                                {fm.active_projects && fm.active_projects.length > 0 && (
                                                    <div className="absolute right-0 bottom-full mb-2 hidden group-hover/tooltip:block bg-zinc-950 text-white text-[10px] p-3 rounded-xl shadow-xl w-48 z-30 font-semibold border border-zinc-800">
                                                        <div className="font-black text-[9px] uppercase tracking-wider text-amber-400 border-b border-zinc-800 pb-1 mb-1">Active Projects ({fm.active_projects_count})</div>
                                                        <ul className="list-disc pl-3.5 space-y-1 text-zinc-300">
                                                            {fm.active_projects.map((p, i) => <li key={i} className="truncate">{p}</li>)}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
