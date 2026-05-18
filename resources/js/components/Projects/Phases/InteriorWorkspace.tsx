import React from 'react';
import { CheckCircle2, ShieldCheck, Clock, Send, Sofa } from 'lucide-react';
import ArchitecturalHandoffCard from './ArchitecturalHandoffCard';
import DeliverablesUploadCard from './DeliverablesUploadCard';
import TechnicalMilestones from './TechnicalMilestones';
import { useToast } from '../../../context/ToastContext';
import axios from 'axios';

interface InteriorWorkspaceProps {
    project: any;
    user: any;
    onRefresh: () => void;
}

export default function InteriorWorkspace({ project, user, onRefresh }: InteriorWorkspaceProps) {
    const { showToast } = useToast();
    const [isUploading, setIsUploading] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const currentUser = user;
    
    const isInterior = user?.role_type === 'interior';
    const isPM = user?.role_type === 'project_manager';
    const isArchitect = user?.role_type === 'arsitek';
    const isOwner = project.user_id === user?.id;
    const canReview = isPM || isOwner || isArchitect;
    const isReadOnly = !isInterior && !canReview;

    const getDeepLink = (type: 'submit' | 'approve' | 'revise') => {
        const url = `${window.location.origin}/dashboard?project_id=${project.id}&phase=interior`;
        const pm = project.project_manager || project.projectManager;
        const interior = project.interior || project.selected_interior;
        
        if (type === 'submit') {
            const phone = pm?.phone_number || pm?.no_telp || pm?.user?.phoneNumber?.[0]?.phone_number || '';
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const msg = `Hi ${pm?.nama || 'PM'}, I have submitted the Interior Design for project "${project.title}". Please review it here: ${url}`;
            return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
        } else if (type === 'approve') {
            const phone = interior?.phone_number || interior?.no_telp || interior?.user?.phoneNumber?.[0]?.phone_number || '';
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const msg = `Hi ${interior?.nama || interior?.name || 'Specialist'}, your Interior Design for project "${project.title}" has been approved! View it here: ${url}`;
            return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
        } else {
            const phone = interior?.phone_number || interior?.no_telp || interior?.user?.phoneNumber?.[0]?.phone_number || '';
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const msg = `Hi ${interior?.nama || interior?.name || 'Specialist'}, revision requested for the Interior Design on project "${project.title}". Please check it here: ${url}`;
            return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
        }
    };

    const isApproved = !!project.owner_interior_approved_at;

    const handoffDocs = (project.documents || []).filter(
        (d: any) => d.category === 'technical_handoff' && d.target_role === 'interior'
    );
    const myDeliverables = (project.documents || []).filter(
        (d: any) => d.category === 'interior_design'
    );

    const hasPendingSubmission = myDeliverables.some((doc: any) => doc.status === 'under_review');

    const handleUploadDeliverable = async (e: React.ChangeEvent<HTMLInputElement>, parentId?: number) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', 'interior_design');
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
                role_type: 'interior'
            });
            showToast('Interior Design submitted to PM & Architect!', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Submission failed.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleApproveDesign = async () => {
        if (!window.confirm("Are you sure you want to approve this interior design integration?")) return;
        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/documents/approve-design`, {
                role_type: 'interior'
            });
            showToast('Interior Design Integration approved!', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Approval failed.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReviseDesign = async () => {
        const note = window.prompt("Enter revision instructions for the Interior Designer:");
        if (note === null) return;
        if (!note.trim()) {
            showToast('Revision instructions are required.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/documents/revise-design`, {
                role_type: 'interior',
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
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Interior Design Workspace</h3>
                    <p className="text-sm font-medium text-slate-500 mt-1">Space planning, custom styling, and layout aesthetics</p>
                </div>
                {isApproved ? (
                    <span className="px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                        <CheckCircle2 size={14} /> Approved & Integrated
                    </span>
                ) : (
                    <span className="px-4 py-1.5 bg-rose-100 text-rose-700 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                        <Sofa size={14} /> Design Phase Active
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {!isReadOnly && <ArchitecturalHandoffCard handoffDocs={handoffDocs} />}

                <DeliverablesUploadCard 
                    title="Your Deliverables"
                    subtitle="Upload Interior Layouts & Renders"
                    deliverables={myDeliverables}
                    isUploading={isUploading}
                    isApproved={isApproved}
                    hasHandoffDocs={handoffDocs.length > 0}
                    isSpecialist={isInterior || isArchitect}
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
                                    Interior designs are officially integrated into the master design blueprint.
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
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5 tracking-wider">An interior designer submitted layout blueprints for integration</p>
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
                                    The interior designer is working on space layouts. No submission is pending.
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
                                        ? "Your interior layout calculations have been submitted and are under review by the PM."
                                        : "Upload interior layout calculations and submit them for official audit when completed."
                                    }
                                </p>
                            </div>
                        </div>
                        {hasPendingSubmission && isInterior && (
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
                roleType="interior"
                isSpecialist={isInterior || isArchitect}
                isPM={isPM}
                isApproved={isApproved}
            />
        </div>
    );
}
