import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Briefcase, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import { FirmMember } from '../../types/sub_professional.types';
import { useToast } from '../../context/ToastContext';

interface QuickAssignModalProps {
    isOpen: boolean;
    onClose: () => void;
    member: FirmMember;
    onSuccess: () => void;
}

interface Project {
    id: number;
    title: string;
    structural_id: number | null;
    mep_id: number | null;
    structural_profile?: { user_id: number | null } | null;
    mep_profile?: { user_id: number | null } | null;
}

export default function QuickAssignModal({ isOpen, onClose, member, onSuccess }: QuickAssignModalProps) {
    const { showToast } = useToast();
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('');
    const [subRole, setSubRole] = useState<string>('structural');
    const [rate, setRate] = useState<string>('');
    const [description, setDescription] = useState<string>('');
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Auto-select role matching the member's roster role
    useEffect(() => {
        if (isOpen && member) {
            if (member.role_in_firm) {
                setSubRole(member.role_in_firm);
            }
        }
    }, [isOpen, member]);

    // Reset selected project when role switches to prevent invalid state submission
    useEffect(() => {
        setSelectedProjectId('');
    }, [subRole]);

    useEffect(() => {
        if (!isOpen) return;
        
        const fetchProjects = async () => {
            try {
                const res = await axios.get<{ data: Project[] }>('/projects?all=true');
                // Filter only projects where this specialist's role is not yet assigned
                setProjects(Array.isArray(res.data?.data) ? res.data.data : []);
            } catch {
                showToast('Failed to load projects', 'error');
            } finally {
                setIsLoadingProjects(false);
            }
        };

        fetchProjects();
    }, [isOpen, showToast]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProjectId || !rate) {
            showToast('Please fill all required fields', 'error');
            return;
        }

        // R6: Strict loading states during mutation
        setIsSubmitting(true);
        try {
            const res = await axios.post('/firm-members/quick-assign', {
                member_user_id: member.member_user_id,
                project_id: Number(selectedProjectId),
                sub_role: subRole,
                rate: Number(rate),
                description,
            });

            showToast(res.data?.message || 'Assignment proposal submitted successfully!', 'success');
            onSuccess();
            onClose();
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Failed to submit assignment proposal';
            showToast(msg, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const eligibleProjects = projects.filter(p => {
        if (subRole === 'structural') {
            return !p.structural_id && !p.structural_profile;
        }
        if (subRole === 'mep') {
            return !p.mep_id && !p.mep_profile;
        }
        return true;
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden transform scale-100 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                            <Briefcase size={16} />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Quick Assign</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{member.member?.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-200/60 rounded-lg text-slate-400 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Role Selection */}
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Assignment Role</label>
                        {(() => {
                            const PROFESSIONAL_ROLES = ['structural', 'mep', 'interior'];
                            const isProfessional = PROFESSIONAL_ROLES.includes(member?.role_in_firm || '');
                            const formatRoleLabel = (r: string) => r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

                            if (isProfessional) {
                                return (
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSubRole('structural')}
                                            className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                                                subRole === 'structural'
                                                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 font-black'
                                                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            Structural Engineer
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSubRole('mep')}
                                            className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                                                subRole === 'mep'
                                                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 font-black'
                                                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            MEP Engineer
                                        </button>
                                    </div>
                                );
                            } else {
                                return (
                                    <div className="py-2.5 px-4 rounded-xl border border-indigo-100 bg-indigo-50/30 text-xs font-black text-indigo-700 flex items-center gap-2 uppercase tracking-widest">
                                        <Briefcase size={12} className="text-indigo-500 shrink-0" />
                                        <span>{formatRoleLabel(subRole)}</span>
                                    </div>
                                );
                            }
                        })()}
                    </div>

                    {/* Project Selection */}
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Select Project</label>
                        {isLoadingProjects ? (
                            <div className="text-xs text-slate-400 font-bold py-2">Loading projects...</div>
                        ) : eligibleProjects.length === 0 ? (
                            <div className="p-3 bg-amber-50 text-amber-700 rounded-xl flex items-start gap-2 text-xs">
                                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold">No active projects matching criteria.</span>
                                    <p className="text-[10px] text-amber-600 mt-0.5">Either all your projects already have this role assigned, or you are not hired on any active projects yet.</p>
                                </div>
                            </div>
                        ) : (
                            <select
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                                required
                            >
                                <option value="">-- Choose Active Project --</option>
                                {eligibleProjects.map(p => (
                                    <option key={p.id} value={p.id}>{p.title}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Fee / Rate */}
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Hiring Fee / Budget (Rupiah)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">Rp</span>
                            <input
                                type="number"
                                value={rate}
                                onChange={(e) => setRate(e.target.value)}
                                placeholder="e.g. 15000000"
                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-700 focus:outline-none focus:border-indigo-500 transition-all"
                                min="0"
                                required
                            />
                        </div>
                    </div>

                    {/* Scope Notes / Description */}
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Scope Notes / Technical Instructions</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Provide brief details on responsibilities or milestones for this project phase..."
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:border-indigo-500 transition-all h-20 resize-none"
                        />
                    </div>

                    {/* Submit Section */}
                    <div className="pt-2 flex gap-2 justify-end border-t border-slate-50">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center gap-1.5"
                            disabled={isSubmitting || !selectedProjectId}
                        >
                            {isSubmitting ? 'Submitting...' : 'Propose Assignment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
