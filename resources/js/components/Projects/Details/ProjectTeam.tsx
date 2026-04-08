import React from 'react';
import { motion } from 'framer-motion';
import { User, Phone, Globe, ShieldCheck, Mail, MessageSquare, Briefcase, Star, Search } from 'lucide-react';

interface Props {
    project: any;
    onViewProfile: (type: 'arsitek' | 'kontraktor', id: number) => void;
}

export const ProjectTeam: React.FC<Props> = ({ project, onViewProfile }) => {
    const architect = project?.arsitek;
    const contractor = project?.kontraktor;

    const TeamMemberCard = ({ member, role }: { member: any, role: 'arsitek' | 'kontraktor' }) => {
        if (!member) {
            return (
                <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[2.5rem] p-10 flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-gray-300 mb-4">
                        <Search size={32} />
                    </div>
                    <h4 className="text-lg font-black text-gray-400 tracking-tight uppercase">No {role} Hired</h4>
                    <p className="text-gray-400 text-[11px] font-bold uppercase tracking-widest mt-2">Bidding is currently open for this position.</p>
                </div>
            );
        }

        const user = member.user;
        const phone = user?.phone_number?.contact || 'N/A';
        const initials = user?.name?.charAt(0).toUpperCase() || '?';

        return (
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[2.5rem] border-2 border-zinc-100 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.03)] relative overflow-hidden group"
            >
                <div className="flex items-start justify-between mb-8">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 bg-zinc-900 rounded-[1.5rem] flex items-center justify-center text-white text-2xl font-black shadow-xl">
                            {initials}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-xl font-black text-gray-900 tracking-tight">{user?.name}</h3>
                                {member.verification_status === 'verified' && (
                                    <ShieldCheck size={18} className="text-blue-500 fill-blue-50" />
                                )}
                            </div>
                            <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                                {role === 'arsitek' ? 'Project Architect' : 'Project Contractor'}
                            </span>
                        </div>
                    </div>
                    
                    <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1 text-amber-500 mb-1">
                            <Star size={14} className="fill-amber-500" />
                            <span className="text-sm font-black italic">{member.rating || '5.0'}</span>
                        </div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{member.experience_years || 0} YR EXP</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Response Rate</p>
                        <p className="text-sm font-black text-gray-900 tracking-tight">98% Faster</p>
                    </div>
                    <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Projects Done</p>
                        <p className="text-sm font-black text-gray-900 tracking-tight">24 Successful</p>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <a 
                        href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-[#25D366] hover:shadow-[0_10px_30px_rgba(37,211,102,0.3)] transition-all active:scale-95"
                    >
                        <MessageSquare size={16} /> Direct WhatsApp
                    </a>
                    <button 
                        onClick={() => onViewProfile(role, member.id)}
                        className="w-full py-4 bg-white border-2 border-zinc-100 text-zinc-900 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-3 hover:border-zinc-900 transition-all active:scale-95"
                    >
                        <User size={16} /> View Profile
                    </button>
                </div>
            </motion.div>
        );
    };

    return (
        <div className="p-8 space-y-12">
            <div className="space-y-2">
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">Active Team</h2>
                <p className="text-sm text-gray-400 font-bold uppercase tracking-widest">Hired experts for your development</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <TeamMemberCard member={architect} role="arsitek" />
                <TeamMemberCard member={contractor} role="kontraktor" />
            </div>

            {(architect || contractor) && (
                <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 flex items-start gap-4">
                    <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-blue-600 shrink-0">
                        <ShieldCheck size={20} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-blue-900 uppercase tracking-tight">Platform Protection Active</h4>
                        <p className="text-xs text-blue-700/70 font-medium leading-relaxed mt-1">
                            Your collaboration with this team is protected by 4Ceria's security standards. All payments and activities are logged for your safety.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
