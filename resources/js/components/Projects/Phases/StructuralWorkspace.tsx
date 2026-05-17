import React from 'react';
import { CheckCircle2, ShieldCheck, Clock, Send } from 'lucide-react';
import ArchitecturalHandoffCard from './ArchitecturalHandoffCard';
import DeliverablesUploadCard from './DeliverablesUploadCard';
import TechnicalMilestones from './TechnicalMilestones';
import { useToast } from '../../../context/ToastContext';
import axios from 'axios';

interface StructuralWorkspaceProps {
    project: any;
    user: any;
    onRefresh: () => void;
}

export default function StructuralWorkspace({ project, user, onRefresh }: StructuralWorkspaceProps) {
    const { showToast } = useToast();
    const [isUploading, setIsUploading] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const currentUser = user;
    
    const isStructural = user?.role_type === 'structural';
    const isPM = user?.role_type === 'project_manager';
    const isArchitect = user?.role_type === 'arsitek';
    const isOwner = project.user_id === user?.id;
    const canReview = isPM || isOwner || isArchitect;
    const isReadOnly = !isStructural && !canReview;

    const getDeepLink = (type: 'submit' | 'approve' | 'revise') => {
        const url = `${window.location.origin}/dashboard?project_id=${project.id}&phase=structural`;
        const pm = project.project_manager || project.projectManager;
        const structural = project.structural_engineer || project.structuralEngineer || project.structural;
        
        if (type === 'submit') {
            const phone = pm?.phone_number || pm?.no_telp || pm?.user?.phoneNumber?.[0]?.phone_number || '';
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const msg = `Hi ${pm?.nama || 'PM'}, I have submitted the Structural Design for project "${project.title}". Please review it here: ${url}`;
            return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
        } else if (type === 'approve') {
            const phone = structural?.phone_number || structural?.no_telp || structural?.user?.phoneNumber?.[0]?.phone_number || '';
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const msg = `Hi ${structural?.nama || structural?.name || 'Specialist'}, your Structural Design for project "${project.title}" has been approved! View it here: ${url}`;
            return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
        } else {
            const phone = structural?.phone_number || structural?.no_telp || structural?.user?.phoneNumber?.[0]?.phone_number || '';
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const msg = `Hi ${structural?.nama || structural?.name || 'Specialist'}, revision requested for the Structural Design on project "${project.title}". Please check it here: ${url}`;
            return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
        }
    };

    const isDesignCompleted = !!project.design_completed_at;
    const isApproved = !!project.structural_approved_at;

    const handoffDocs = (project.documents || []).filter(
        (d: any) => d.category === 'technical_handoff' && d.target_role === 'structural'
    );
    const myDeliverables = (project.documents || []).filter(
        (d: any) => d.category === 'structural_calc'
    );

    const hasPendingSubmission = myDeliverables.some((doc: any) => doc.status === 'under_review');

    const handleUploadDeliverable = async (e: React.ChangeEvent<HTMLInputElement>, parentId?: number) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', 'structural_calc');
        formData.append('target_role', 'architect');
        if (parentId) {
            formData.append('parent_id', parentId.toString());
        }

        setIsUploading(true);
        try {
            await axios.post(`/projects/${project.id}/documents`, formData);
            showToast('Deliverable uploaded. Submit for review when ready.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Upload failed.', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteDeliverable = async (id: number) => {
        if (!window.confirm("Are you sure you want to delete this deliverable?")) return;
        try {
            await axios.delete(`/projects/${project.id}/documents/${id}`);
            showToast('Deliverable removed successfully.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to delete deliverable.', 'error');
        }
    };

    const handleUpdateDeliverable = async (id: number, name: string, note: string) => {
        try {
            await axios.put(`/projects/${project.id}/documents/${id}`, {
                file_name: name,
                version_label: note
            });
            showToast('Deliverable updated successfully.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to update deliverable.', 'error');
            throw error;
        }
    };

    const handleSubmitDesign = async () => {
        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/documents/submit-design`, {
                role_type: 'structural'
            });
            showToast('Structural Design submitted to PM & Architect!', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Submission failed.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleApproveDesign = async () => {
        if (!window.confirm("Are you sure you want to approve this structural design integration?")) return;
        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/documents/approve-design`, {
                role_type: 'structural'
            });
            showToast('Structural Design Integration approved!', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Approval failed.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReviseDesign = async () => {
        const note = window.prompt("Enter revision instructions for the Structural Engineer:");
        if (note === null) return;
        if (!note.trim()) {
            showToast('Revision instructions are required.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/documents/revise-design`, {
                role_type: 'structural',
                note: note.trim()
            });
            showToast('Revision requested from Specialist.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Revision request failed.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Structural Engineering Workspace</h3>
                    <p className="text-sm font-medium text-slate-500 mt-1">Load calculations and structural integrity</p>
                </div>
                {isApproved ? (
                    <span className="px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                        <CheckCircle2 size={14} /> Approved & Integrated
                    </span>
                ) : (
                    <span className="px-4 py-1.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                        <ShieldCheck size={14} /> Design Phase Active
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {!isReadOnly && <ArchitecturalHandoffCard handoffDocs={handoffDocs} />}

                <DeliverablesUploadCard 
                    title="Your Deliverables"
                    subtitle="Upload Structural Calculations"
                    deliverables={myDeliverables}
                    isUploading={isUploading}
                    isApproved={isApproved}
                    hasHandoffDocs={handoffDocs.length > 0}
                    isSpecialist={isStructural || isArchitect}
                    isSubmitting={isSubmitting}
                    readOnly={isReadOnly}
                    onSubmitDesign={handleSubmitDesign}
                    onUpload={handleUploadDeliverable}
                    onDelete={handleDeleteDeliverable}
                    onUpdate={handleUpdateDeliverable}
                />
            </div>
            
            {/* Interactive Integration Review Footer */}
            {!isReadOnly && (
                isApproved ? (
                    <div className="border border-emerald-200 rounded-3xl p-6 bg-emerald-50 text-emerald-900 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="text-emerald-500 shrink-0" size={24} />
                            <div>
                                <h5 className="text-xs font-black uppercase tracking-tight">Verified & Integrated</h5>
                                <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wide mt-0.5">
                                    Structural calculations are officially integrated into the master design blueprint.
                                </p>
                            </div>
                        </div>
                        {canReview && (
                            <a href={getDeepLink('approve')} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex items-center gap-2">
                                <Send size={14} /> Notify via WhatsApp
                            </a>
                        )}
                    </div>
                ) : (

                canReview ? (
                    hasPendingSubmission ? (
                        <div className="border border-indigo-100 rounded-3xl p-6 bg-indigo-50/50 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100">
                                    <ShieldCheck size={20} />
                                </div>
                                <div>
                                    <h5 className="text-xs font-black text-slate-950 uppercase tracking-tight">Design Review Pending</h5>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5 tracking-wider">A structural designer submitted calculations for integration</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 w-full md:w-auto">
                                <a href={getDeepLink('revise')} target="_blank" rel="noopener noreferrer" className="px-3 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-400 rounded-xl transition-colors shadow-sm" title="Send Revision Notice via WhatsApp">
                                    <Send size={16} />
                                </a>
                                <button
                                    onClick={handleReviseDesign}
                                    disabled={isSubmitting}
                                    className="flex-1 md:flex-initial px-5 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm disabled:opacity-50"
                                >
                                    Request Revision
                                </button>
                                <button
                                    onClick={handleApproveDesign}
                                    disabled={isSubmitting}
                                    className="flex-1 md:flex-initial px-5 py-3 bg-slate-900 hover:bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-lg disabled:opacity-50"
                                >
                                    Approve Integration
                                </button>
                            </div>
                        </div>

                    ) : (
                        <div className="border border-slate-200 rounded-3xl p-6 bg-slate-50 flex items-center gap-3">
                            <Clock className="text-slate-400 shrink-0 animate-pulse" size={24} />
                            <div>
                                <h5 className="text-xs font-black text-slate-800 uppercase tracking-tight">Awaiting Submissions</h5>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">
                                    The structural designer is working on calculations. No submission is pending.
                                </p>
                            </div>
                        </div>
                    )
                ) : (
                    <div className="border border-slate-200 rounded-3xl p-6 bg-slate-50 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <Clock className="text-slate-400 shrink-0" size={24} />
                            <div>
                                <h5 className="text-xs font-black text-slate-800 uppercase tracking-tight">
                                    {hasPendingSubmission ? "Review in Progress" : "Design Preparation"}
                                </h5>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">
                                    {hasPendingSubmission 
                                        ? "Your design calculations have been submitted and are under review by the PM."
                                        : "Upload structural layout calculations and submit them for official audit when completed."
                                    }
                                </p>
                            </div>
                        </div>
                        {hasPendingSubmission && isStructural && (
                            <a href={getDeepLink('submit')} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 px-4 py-2 bg-[#25D366] hover:bg-[#1DA851] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex items-center gap-2">
                                <Send size={14} /> Notify PM
                            </a>
                        )}
                    </div>
                )
            ))}

            <TechnicalMilestones 
                project={project}
                currentUser={currentUser}
                roleType="structural"
                isSpecialist={isStructural || isArchitect}
                isPM={isPM}
            />
        </div>
    );
}
