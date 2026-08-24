import React from 'react';
import { X, UserPlus, Phone, Mail, Building2, Wallet, Users, FileText, CheckCircle2 } from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';

interface ImportExternalVendorModalProps {
    projectId: number;
    phaseKey?: string;
    phaseLabel?: string;
    phaseRole?: string;
    availableTeam?: any[];
    onSuccess: () => void;
    onClose: () => void;
}

export default function ImportExternalVendorModal({
    projectId,
    phaseKey,
    phaseLabel,
    phaseRole,
    onSuccess,
    onClose
}: ImportExternalVendorModalProps) {
    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);
    const [availableTeam, setAvailableTeam] = React.useState<any[]>([]);
    const [selectedTeamMember, setSelectedTeamMember] = React.useState<any | null>(null);
    const [isManualEntry, setIsManualEntry] = React.useState(false);

    const displayLabel = phaseLabel || (phaseRole === 'structural' ? 'Structural Engineer' : phaseRole === 'mep' ? 'MEP Engineer' : 'Specialist');

    const ROLE_MAP = {
        management: 'project_manager',
        legal: 'notaris',
        design: 'arsitek',
        build: 'kontraktor',
        interior: 'interior'
    };

    React.useEffect(() => {
        const fetchTeam = async () => {
            setIsLoading(true);
            try {
                const res = await axios.get('/team-members');
                const teamData = res.data?.data || res.data || [];
                setAvailableTeam(Array.isArray(teamData) ? teamData : []);
            } catch (err) {
                console.error("Failed to fetch team members", err);
                setAvailableTeam([]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTeam();
    }, []);

    const handleImport = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        
        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${projectId}/import-external-vendor`, {
                phase_role: phaseRole || (phaseKey ? ROLE_MAP[phaseKey] : 'specialist'),
                team_member_id: selectedTeamMember?.id,
                company_name: formData.get('company_name'),
                contact_person: selectedTeamMember ? selectedTeamMember.name : formData.get('contact_person'),
                phone_number: selectedTeamMember ? selectedTeamMember.phone : formData.get('phone_number'),
                email: selectedTeamMember ? selectedTeamMember.email : formData.get('email'),
                agreed_fee: formData.get('agreed_fee'),
                notes: formData.get('notes'),
            });

            showToast(`${displayLabel} assigned successfully.`, 'success');
            onSuccess();
            onClose();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to assign professional.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200">
                            {selectedTeamMember ? <CheckCircle2 size={24} /> : <UserPlus size={24} />}
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight">
                                {selectedTeamMember ? 'Assign Team Member' : `Assign External ${displayLabel}`}
                            </h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                {selectedTeamMember ? `Assigning ${selectedTeamMember.name} to project` : 'Bring your own professional to 4C'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-xl transition-colors text-slate-400">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleImport} className="p-8 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
                    {/* Team Selection List */}
                    {!selectedTeamMember && !isManualEntry && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                    <Users size={14} className="text-slate-400" />
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select from Your Roster</label>
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => setIsManualEntry(true)}
                                    className="text-[9px] font-black text-slate-600 uppercase tracking-widest hover:underline"
                                >
                                    + Use External Partner
                                </button>
                            </div>

                            {isLoading ? (
                                <div className="grid grid-cols-2 gap-3">
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} className="h-16 bg-slate-50 rounded-2xl animate-pulse" />
                                    ))}
                                </div>
                            ) : availableTeam.length > 0 ? (
                                <div className="grid grid-cols-2 gap-3">
                                    {availableTeam.map(member => (
                                        <button
                                            key={member.id}
                                            type="button"
                                            onClick={() => setSelectedTeamMember(member)}
                                            className="group p-3 bg-white border border-slate-200 rounded-2xl text-left hover:border-slate-900 transition-all flex items-center gap-3"
                                        >
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 border border-slate-200">
                                                {member.photo_url ? (
                                                    <img src={member.photo_url} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-[10px] font-black text-slate-400">{member.name.charAt(0)}</span>
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-black text-slate-900 truncate tracking-tight">{member.name}</p>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter truncate">{member.role_title}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-8 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                                    <Users className="mx-auto text-slate-300 mb-3" size={32} />
                                    <p className="text-xs font-bold text-slate-500 mb-4">No team members found in your roster.</p>
                                    <div className="flex flex-col gap-2">
                                        <button 
                                            type="button"
                                            onClick={() => window.dispatchEvent(new CustomEvent('switchDashboardTab', { detail: 'profile' }))}
                                            className="text-[10px] font-black text-slate-900 uppercase tracking-widest px-4 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
                                        >
                                            Add to Profile
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setIsManualEntry(true)}
                                            className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-2"
                                        >
                                            Or Enter Details Manually
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Selected Member Display */}
                    {selectedTeamMember && (
                        <div className="p-5 bg-slate-900 rounded-[2.5rem] text-white flex items-center justify-between shadow-xl animate-in slide-in-from-top-4 duration-500">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center overflow-hidden border border-white/20 shadow-inner">
                                    {selectedTeamMember.photo_url ? (
                                        <img src={selectedTeamMember.photo_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-xl font-black">{selectedTeamMember.name.charAt(0)}</span>
                                    )}
                                </div>
                                <div>
                                    <h4 className="text-base font-black tracking-tight">{selectedTeamMember.name}</h4>
                                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">{selectedTeamMember.role_title}</p>
                                </div>
                            </div>
                            <button 
                                type="button" 
                                onClick={() => setSelectedTeamMember(null)}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                            >
                                Change
                            </button>
                        </div>
                    )}

                    {isManualEntry && !selectedTeamMember && (
                        <div className="space-y-6 animate-in fade-in duration-500">
                            <div className="flex items-center justify-between px-1">
                                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">External Partner Details</h4>
                                <button 
                                    type="button"
                                    onClick={() => setIsManualEntry(false)}
                                    className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900"
                                >
                                    Back to Roster
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contact Person</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><UserPlus size={16} /></span>
                                        <input name="contact_person" required placeholder="Full Name" className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:border-black outline-none transition-all" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Company Name</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Building2 size={16} /></span>
                                        <input name="company_name" placeholder="e.g. Paramount Studio" className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:border-black outline-none transition-all" />
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Phone size={16} /></span>
                                        <input name="phone_number" required placeholder="e.g. 0812345678" className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:border-black outline-none transition-all" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email (Optional)</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Mail size={16} /></span>
                                        <input name="email" type="email" placeholder="professional@email.com" className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:border-black outline-none transition-all" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Shared Fields: Fee & Notes (Only show if selection or manual entry is ready) */}
                    {(selectedTeamMember || isManualEntry) && (
                        <div className="space-y-6 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Agreed Fee (IDR)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Wallet size={16} /></span>
                                    <input 
                                        name="agreed_fee" 
                                        type="number" 
                                        required 
                                        placeholder="Negotiated fee for this phase" 
                                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:border-black outline-none transition-all" 
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assignment Notes / Scope</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-4 text-slate-400"><FileText size={16} /></span>
                                    <textarea 
                                        name="notes" 
                                        rows={3}
                                        placeholder="Describe specific tasks or scope for this person..." 
                                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:border-black outline-none transition-all resize-none" 
                                    />
                                </div>
                                <p className="text-[10px] text-amber-600 font-bold ml-1 italic mt-1">Note: The fee will be deducted from your remaining project budget.</p>
                            </div>
                        </div>
                    )}

                    <div className="pt-4 flex gap-4">
                        {(selectedTeamMember || isManualEntry) ? (
                            <button type="submit" disabled={isSubmitting} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black active:scale-95 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 flex items-center justify-center gap-3">
                                {isSubmitting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        Assigning...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={18} />
                                        {selectedTeamMember ? 'Complete Roster Assignment' : `Assign External ${displayLabel}`}
                                    </>
                                )}
                            </button>
                        ) : null}
                        <button type="button" onClick={onClose} className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all flex-1 md:flex-none">
                            { (selectedTeamMember || isManualEntry) ? 'Cancel' : 'Close' }
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
