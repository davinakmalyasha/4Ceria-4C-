import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, UserPlus, CheckCircle, Clock, XCircle, Wrench } from 'lucide-react';
import { ProjectSubProfessional } from '../../types/sub_professional.types';

interface SubProfessionalPanelProps {
    subs: ProjectSubProfessional[];
    isLoading: boolean;
    canManage: boolean;
    onAddClick: () => void;
    onAccept?: (subId: number) => void;
    onRemove?: (subId: number) => void;
    onHire?: (subId: number) => void;
    onInterview?: (subId: number) => void;
    onRecommend?: (sub: ProjectSubProfessional) => void;
    currentUserId?: number;
    isOwner?: boolean;
    isPM?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    invited: { label: 'Invited', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
    interviewing: { label: 'Interviewing', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Users },
    accepted: { label: 'Accepted', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: CheckCircle },
    recommended: { label: 'Recommended', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: CheckCircle },
    active: { label: 'Active', color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle },
    completed: { label: 'Completed', color: 'bg-zinc-100 text-zinc-600 border-zinc-200', icon: CheckCircle },
    removed: { label: 'Removed', color: 'bg-red-50 text-red-600 border-red-200', icon: XCircle },
};

function SubRoleLabel({ subRole }: { subRole: string }): React.ReactElement {
    const labels: Record<string, string> = {
        structural: 'Structural Engineer', mep: 'MEP Engineer',
        roofing: 'Roofing', pool: 'Pool Builder', foundation: 'Foundation',
        steel_structure: 'Steel Structure', hvac: 'HVAC', electrical_specialist: 'Electrical',
        plumbing_specialist: 'Plumbing', waterproofing: 'Waterproofing',
        glass_facade: 'Glass & Facade', painting: 'Painting',
    };
    return <span>{labels[subRole] || subRole}</span>;
}

export default function SubProfessionalPanel({
    subs, isLoading, canManage, onAddClick, onAccept, onRemove, onHire, onInterview, onRecommend, currentUserId, isOwner, isPM
}: SubProfessionalPanelProps): React.ReactElement {
    const activeSubs = useMemo(() => subs.filter(s => s.status !== 'removed'), [subs]);

    if (isLoading) {
        return (
            <div className="p-4 bg-white rounded-2xl border border-gray-100 animate-pulse">
                <div className="h-5 bg-gray-100 rounded w-40 mb-3" />
                <div className="h-12 bg-gray-50 rounded-xl" />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                        <Wrench size={16} className="text-zinc-600" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-gray-900">Sub-Professionals</h4>
                        <p className="text-[11px] text-gray-400">{activeSubs.length} assigned</p>
                    </div>
                </div>
                {canManage && (
                    <button onClick={onAddClick} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gray-900 hover:bg-[#FF2D20] rounded-lg transition-all shadow-sm">
                        <UserPlus size={13} /> Add
                    </button>
                )}
            </div>

            {activeSubs.length === 0 ? (
                <div className="p-6 text-center">
                    <Users size={28} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400 font-medium">No sub-professionals assigned yet.</p>
                </div>
            ) : (
                <div className="divide-y divide-gray-50">
                    <AnimatePresence>
                        {activeSubs.map(sub => {
                            const cfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG.invited;
                            const StatusIcon = cfg.icon;
                            const isInvitedToMe = sub.status === 'invited' && sub.user_id === currentUserId;
                            const isLeadPro = sub.assigned_by === currentUserId;

                            return (
                                <motion.div key={sub.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-5 py-3 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-black text-zinc-600 shrink-0">
                                            {sub.user?.name?.charAt(0) || '?'}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{sub.user?.name || 'Unknown'}</p>
                                            <p className="text-[11px] text-gray-400"><SubRoleLabel subRole={sub.sub_role} /></p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wide ${cfg.color}`}>
                                            <StatusIcon size={11} /> {cfg.label}
                                        </div>
                                        {isInvitedToMe && onAccept && (
                                            <button onClick={() => onAccept(sub.id)} className="px-2.5 py-1 text-[10px] font-bold text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors">Accept</button>
                                        )}
                                        
                                        {/* Lead Pro Vetting Actions */}
                                        {isLeadPro && sub.status === 'accepted' && onInterview && (
                                            <button onClick={() => onInterview(sub.id)} className="px-2.5 py-1 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors">Interview</button>
                                        )}
                                        {isLeadPro && (sub.status === 'interviewing' || sub.status === 'accepted') && onRecommend && (
                                            <button onClick={() => onRecommend(sub)} className="px-2.5 py-1 text-[10px] font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors">Recommend</button>
                                        )}

                                        {/* Owner/PM Hiring Actions */}
                                        {((isOwner && sub.status === 'recommended') || 
                                          ((isOwner || isPM) && sub.status === 'accepted' && sub.assigned_by === currentUserId)) && onHire && (
                                            <div className="flex items-center gap-2">
                                                {sub.status === 'recommended' && (
                                                    <div className="text-[10px] text-right mr-1">
                                                        <p className="font-bold text-gray-900">Rp {sub.suggested_fee?.toLocaleString()}</p>
                                                        <p className="text-gray-400 italic truncate max-w-[100px]">"{sub.lead_pro_notes}"</p>
                                                    </div>
                                                )}
                                                <button onClick={() => onHire(sub.id)} className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white bg-zinc-900 hover:bg-black rounded-md transition-colors shadow-sm">Confirm & Hire</button>
                                                {isOwner && sub.status === 'recommended' && (
                                                    <button onClick={() => onRemove(sub.id)} className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 rounded-md transition-colors">Reject</button>
                                                )}
                                            </div>
                                        )}

                                        {canManage && sub.status !== 'completed' && sub.status !== 'active' && sub.status !== 'recommended' && onRemove && (
                                            <button onClick={() => onRemove(sub.id)} className="px-2 py-1 text-[10px] font-bold text-red-500 hover:bg-red-50 rounded-md transition-colors">Remove</button>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
