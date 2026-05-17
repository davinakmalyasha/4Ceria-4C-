import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Wallet, Users, Paperclip, AlertCircle, Check, Loader2 } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface AddendumProposalModalProps {
    project: any;
    isOpen: boolean;
    onClose: () => void;
    onRefresh: () => void;
    initialType?: 'extra_fee' | 'specialist_assignment';
}

export default function AddendumProposalModal({
    project,
    isOpen,
    onClose,
    onRefresh,
    initialType = 'extra_fee'
}: AddendumProposalModalProps) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [type, setType] = useState<'extra_fee' | 'specialist_assignment'>(initialType);
    
    // Form States
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [specialistType, setSpecialistType] = useState<'structural' | 'mep'>('structural');
    const [selectedTeamMemberId, setSelectedTeamMemberId] = useState('');
    const [attachment, setAttachment] = useState<File | null>(null);

    // Data States
    const [teamMembers, setTeamMembers] = useState<any[]>([]);
    const [firmMembers, setFirmMembers] = useState<any[]>([]);

    useEffect(() => {
        if (isOpen) {
            fetchTeamMembers();
            if (initialType) {
                setType(initialType);
            }
            
            // Auto-select available role or default to extra_fee if all filled
            if (project.structural_id && project.mep_id) {
                setType('extra_fee');
            } else if (project.structural_id && !project.mep_id) {
                setSpecialistType('mep');
            } else if (!project.structural_id) {
                setSpecialistType('structural');
            }
        }
    }, [isOpen, initialType, project.structural_id, project.mep_id]);

    const fetchTeamMembers = async () => {
        try {
            const [teamRes, firmRes] = await Promise.all([
                axios.get('/team-members'),
                axios.get('/firm-members/roster'),
            ]);
            setTeamMembers(teamRes.data.data || []);
            setFirmMembers(
                (firmRes.data.data || []).filter((fm: any) => fm.status === 'active')
            );
        } catch (error) {
            console.error('Failed to fetch members', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const formData = new FormData();
            formData.append('type', type);
            formData.append('title', type === 'specialist_assignment' ? `Specialist Assignment: ${specialistType.toUpperCase()}` : title);
            formData.append('amount', amount);
            formData.append('description', description);

            if (type === 'specialist_assignment') {
                formData.append('specialist_type', specialistType);
                formData.append('team_member_id', selectedTeamMemberId);
                if (attachment) {
                    formData.append('attachment', attachment);
                }
            }

            await axios.post(`/projects/${project.id}/budget/addendums`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            showToast('Proposal submitted for approval', 'success');
            onRefresh();
            onClose();
            // Reset form
            setTitle(''); setAmount(''); setDescription(''); setAttachment(null);
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to submit proposal', 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="relative p-8 pb-4">
                    <button 
                        onClick={onClose}
                        className="absolute top-8 right-8 p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
                    >
                        <X size={20} />
                    </button>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Addendum Proposal</h3>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Project Adjustments & Specialist Hiring</p>
                </div>

                {/* Tabs */}
                <div className="px-8 flex gap-2 mb-6">
                    <button 
                        onClick={() => setType('extra_fee')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            type === 'extra_fee' 
                                ? 'bg-slate-900 text-white shadow-lg' 
                                : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                        }`}
                    >
                        <Wallet size={14} /> Extra Fee
                    </button>
                    <button 
                        onClick={() => setType('specialist_assignment')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            type === 'specialist_assignment' 
                                ? 'bg-slate-900 text-white shadow-lg' 
                                : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                        }`}
                    >
                        <Users size={14} /> Specialist Hiring
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
                    {type === 'extra_fee' ? (
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Fee Title</label>
                            <input 
                                type="text" 
                                value={title} 
                                onChange={e => setTitle(e.target.value)} 
                                required 
                                placeholder="e.g. Additional Site Visit / Design Revision" 
                                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-slate-300 outline-none transition-all"
                            />
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Specialist Role</label>
                                    <select 
                                        value={specialistType} 
                                        onChange={e => setSpecialistType(e.target.value as any)}
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-slate-300 outline-none transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="structural" disabled={!!project.structural_id}>
                                            Structural Engineer {project.structural_id ? '(Filled 1/1)' : ''}
                                        </option>
                                        <option value="mep" disabled={!!project.mep_id}>
                                            MEP Engineer {project.mep_id ? '(Filled 1/1)' : ''}
                                        </option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Select from Firm / Team</label>
                                    <select 
                                        value={selectedTeamMemberId} 
                                        onChange={e => setSelectedTeamMemberId(e.target.value)}
                                        required
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-slate-300 outline-none transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="">Choose Member...</option>
                                        {firmMembers.length > 0 && (
                                            <optgroup label="Firm Roster (Account-linked)">
                                                {firmMembers.map(fm => (
                                                    <option key={`firm-${fm.id}`} value={`firm:${fm.member_user_id}`}>
                                                        {fm.member?.name} — {fm.role_in_firm?.replace(/_/g, ' ')} ✓
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {teamMembers.length > 0 && (
                                            <optgroup label="Legacy Team Members">
                                                {teamMembers.map(m => {
                                                    const existingAssignments = project.addendums?.filter((a: any) => 
                                                        Number(a.team_member_id) === Number(m.id) && 
                                                        a.type === 'specialist_assignment' &&
                                                        ['pending_approval', 'approved_unpaid', 'verifying', 'paid', 'negotiating', 'accepted_by_pro'].includes(a.status)
                                                    ) || [];
                                                    const rolesStr = existingAssignments.length > 0 
                                                        ? ` (${existingAssignments.map((a: any) => a.specialist_type?.toUpperCase()).join(', ')})`
                                                        : '';
                                                    return (
                                                        <option key={`team-${m.id}`} value={m.id}>
                                                            {m.name}{rolesStr} — {m.role_title}
                                                        </option>
                                                    );
                                                })}
                                            </optgroup>
                                        )}
                                    </select>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Evidence / Proof of Requirement</label>
                                <div className="relative group">
                                    <input 
                                        type="file" 
                                        onChange={e => setAttachment(e.target.files?.[0] || null)}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className="w-full px-5 py-4 bg-slate-50 border-2 border-dashed border-slate-100 rounded-2xl flex items-center gap-3 group-hover:border-slate-300 transition-all">
                                        <div className="p-2 bg-white rounded-xl text-slate-400 shadow-sm">
                                            <Paperclip size={16} />
                                        </div>
                                        <span className="text-xs font-bold text-slate-400">
                                            {attachment ? attachment.name : 'Upload PDF/Image (e.g. Analysis result)'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    <div className="grid grid-cols-1 gap-5">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Amount (Rp)</label>
                            <div className="relative">
                                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">IDR</span>
                                <input 
                                    type="number" 
                                    value={amount} 
                                    onChange={e => setAmount(e.target.value)} 
                                    required 
                                    min="0"
                                    placeholder="0" 
                                    className="w-full pl-14 pr-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black focus:bg-white focus:border-slate-300 outline-none transition-all"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Reason / Technical Note</label>
                            <textarea 
                                value={description} 
                                onChange={e => setDescription(e.target.value)} 
                                required 
                                rows={3} 
                                placeholder="Please provide detailed justification for the owner..." 
                                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-slate-300 outline-none resize-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="flex-1 flex items-center justify-center gap-3 py-4 bg-slate-900 text-white rounded-[1.5rem] text-xs font-black uppercase tracking-widest hover:bg-black active:scale-95 transition-all shadow-xl shadow-slate-900/10 disabled:opacity-50"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            Submit Proposal
                        </button>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                        <AlertCircle size={16} className="text-amber-500 shrink-0" />
                        <p className="text-[9px] font-bold text-amber-700 leading-normal uppercase tracking-wider">
                            Approval workflow required. This proposal will be reviewed by the Project Owner.
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}
