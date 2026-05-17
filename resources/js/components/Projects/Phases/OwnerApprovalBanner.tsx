import React, { useState } from 'react';
import axios from 'axios';
import { ShieldCheck } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface PendingPhase {
    phase: string;
    label: string;
    sealedAt: string;
}

interface OwnerApprovalBannerProps {
    project: any;
    user: any;
    onRefresh: () => void;
}

export default function OwnerApprovalBanner({ project, user, onRefresh }: OwnerApprovalBannerProps) {
    const { showToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isOwner = user?.id === project.user_id;
    if (!isOwner) return null;

    // Determine which phases are PM-sealed but not yet Owner-confirmed
    const pendingPhases: PendingPhase[] = [];
    const completed = project.completed_phases || [];

    if (project.design_completed_at && !completed.includes('design')) {
        pendingPhases.push({ phase: 'design', label: 'Desain & Arsitektur', sealedAt: project.design_completed_at });
    }
    if (project.construction_completed_at && !completed.includes('build')) {
        pendingPhases.push({ phase: 'build', label: 'Konstruksi', sealedAt: project.construction_completed_at });
    }
    if (project.interior_completed_at && !completed.includes('interior')) {
        pendingPhases.push({ phase: 'interior', label: 'Interior & Finishing', sealedAt: project.interior_completed_at });
    }

    if (pendingPhases.length === 0) return null;

    const handleConfirm = async (phase: string) => {
        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/owner-confirm-phase`, { phase });
            showToast('Phase confirmed! Moving to next stage.', 'success');
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Confirmation failed.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-3">
            {pendingPhases.map(p => (
                <div key={p.phase} className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-[2rem] p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500 text-white rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md">
                        <ShieldCheck size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-blue-900">{p.label} — Menunggu Persetujuan Anda</p>
                        <p className="text-[10px] text-blue-600 font-medium mt-0.5">
                            PM telah menyelesaikan verifikasi teknis pada {new Date(p.sealedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}.
                        </p>
                    </div>
                    <button
                        onClick={() => handleConfirm(p.phase)}
                        disabled={isSubmitting}
                        className="px-6 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg disabled:opacity-50 flex-shrink-0"
                    >
                        {isSubmitting ? 'Memproses...' : 'Konfirmasi & Lanjutkan'}
                    </button>
                </div>
            ))}
        </div>
    );
}
