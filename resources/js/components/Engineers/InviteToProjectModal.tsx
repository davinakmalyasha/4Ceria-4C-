import React, { useState } from 'react';
import axios from 'axios';
import { X, Building, Check, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import { Project } from '../../types/project.types';
import { useToast } from '../../context/ToastContext';

interface InviteToProjectModalProps {
    vendorId: number;
    roleType: 'structural' | 'mep';
    projects: Project[];
    onClose: () => void;
}

export default function InviteToProjectModal({ vendorId, roleType, projects, onClose }: InviteToProjectModalProps) {
    const { showToast } = useToast();
    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleInvite = async () => {
        if (!selectedProjectId) return;

        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${selectedProjectId}/invite-engineering-vendor`, {
                role_type: roleType,
                vendor_id: vendorId
            });
            showToast('Invitation sent successfully!', 'success');
            onClose();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to send invite.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <h3 className="text-xl font-black text-slate-900">Invite to Project</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                            Select an active project to add this specialist
                        </p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white hover:bg-slate-100 text-slate-400 rounded-xl transition-all shadow-sm">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3 bg-slate-50/30">
                    {projects.length === 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center">
                            <AlertCircle size={48} className="text-slate-300 mb-4" />
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">No Active Projects</h4>
                            <p className="text-[11px] text-slate-500 font-medium max-w-sm mt-2">
                                You do not have any active projects where you are the assigned Architect.
                            </p>
                        </div>
                    ) : (
                        projects.map(project => {
                            const isSelected = selectedProjectId === project.id;
                            return (
                                <div 
                                    key={project.id}
                                    onClick={() => setSelectedProjectId(project.id)}
                                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group ${
                                        isSelected 
                                        ? 'border-indigo-500 bg-indigo-50' 
                                        : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/50'
                                    }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                                            isSelected ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-500'
                                        }`}>
                                            <Building size={20} />
                                        </div>
                                        <div>
                                            <h4 className={`font-black text-sm ${isSelected ? 'text-indigo-900' : 'text-slate-900'}`}>
                                                {project.title}
                                            </h4>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                                                {project.location || 'Location Not Set'}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                        isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-200'
                                    }`}>
                                        {isSelected && <Check size={12} strokeWidth={4} />}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {projects.length > 0 && (
                    <div className="p-6 border-t border-slate-100 bg-white">
                        <button 
                            onClick={handleInvite}
                            disabled={!selectedProjectId || isSubmitting}
                            className={`w-full py-4 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl disabled:opacity-50 ${
                                selectedProjectId 
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20' 
                                : 'bg-slate-100 text-slate-400 shadow-none'
                            }`}
                        >
                            {isSubmitting ? (
                                <><RefreshCw size={16} className="animate-spin" /> Sending Invite...</>
                            ) : (
                                <>Send Invitation <ArrowRight size={16} /></>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
