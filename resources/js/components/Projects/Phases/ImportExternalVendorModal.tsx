import React from 'react';
import { X, UserPlus, Phone, Mail, Building2, Wallet } from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';

interface ImportExternalVendorModalProps {
    projectId: number;
    phaseKey: string;
    phaseLabel: string;
    onSuccess: () => void;
    onClose: () => void;
}

export default function ImportExternalVendorModal({
    projectId,
    phaseKey,
    phaseLabel,
    onSuccess,
    onClose
}) {
    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // Map PhaseKey to DB role
    const ROLE_MAP = {
        management: 'project_manager',
        legal: 'notaris',
        design: 'arsitek',
        build: 'kontraktor',
        interior: 'interior'
    };

    const handleImport = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        
        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${projectId}/import-external-vendor`, {
                phase_role: ROLE_MAP[phaseKey] || phaseKey,
                company_name: formData.get('company_name'),
                contact_person: formData.get('contact_person'),
                phone_number: formData.get('phone_number'),
                email: formData.get('email'),
                agreed_fee: formData.get('agreed_fee'),
            });

            showToast(`External ${phaseLabel} assigned successfully.`, 'success');
            onSuccess();
            onClose();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to import vendor.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center">
                            <UserPlus size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight">Import External {phaseLabel}</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Bring your own professional to 4C</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-xl transition-colors text-slate-400">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleImport} className="p-8 space-y-6">
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

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Agreed Fee (IDR)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Wallet size={16} /></span>
                            <input name="agreed_fee" type="number" required placeholder="Negotiated fee for this phase" className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:border-black outline-none transition-all" />
                        </div>
                        <p className="text-[10px] text-amber-600 font-bold ml-1 italic italic mt-1">Note: This amount will be deducted from your remaining project budget.</p>
                    </div>

                    <div className="pt-4 flex gap-4">
                        <button type="submit" disabled={isSubmitting} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black active:scale-95 transition-all shadow-xl shadow-slate-200 disabled:opacity-50">
                            {isSubmitting ? 'Importing Professiona...' : `Assign External ${phaseLabel}`}
                        </button>
                        <button type="button" onClick={onClose} className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
