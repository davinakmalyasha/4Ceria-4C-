import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { ProjectDetailHeader } from './Projects/Details/ProjectDetailHeader';
import { ProjectDetailInfo } from './Projects/Details/ProjectDetailInfo';
import { ProjectDetailBids } from './Projects/Details/ProjectDetailBids';
import { ProjectDetailEdit } from './Projects/Details/ProjectDetailEdit';
import { ProjectDetailReviews } from './Projects/Details/ProjectDetailReviews';
import { useToast } from '../context/ToastContext';
import ProjectMilestones from './Projects/ProjectMilestones';
import { ProjectTeam } from './Projects/Details/ProjectTeam';
import ProjectComments from './Projects/ProjectComments';
import ProjectVault from './Projects/ProjectVault';
import ProjectActivity from './Projects/ProjectActivity';
import RatingModal from './Projects/RatingModal';

interface Props {
    project: any;
    onClose: () => void;
    formatCurrency: (amount: number) => string;
    onViewProfile: (type: 'architect' | 'constructor', id: number) => void;
    onProjectUpdated?: (updated: any) => void;
    isManagementView?: boolean;
}

export const ProjectDetailModal: React.FC<Props> = ({ project, onClose, formatCurrency, onViewProfile, onProjectUpdated, isManagementView }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [detail, setDetail] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<any>('details');
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    // Edit States
    const [editForm, setEditForm] = useState({ title: '', description: '', budget: '', type: 'both', deadline: '', lat: null as number | null, lng: null as number | null });

    const fetchDetail = () => {
        setIsLoading(true);
        axios.get(`/projects/${project.id}`)
            .then(res => {
                const data = res.data.data;
                setDetail(data);
                setEditForm({ title: data.title, description: data.description, budget: data.budget.toString(), type: data.target_role || 'both', deadline: data.deadline?.split('T')[0] || '', lat: data.latitude, lng: data.longitude });
            })
            .finally(() => setIsLoading(false));
    };

    useEffect(() => { fetchDetail(); }, [project.id]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await axios.post(`/projects/${project.id}/update`, editForm);
            setDetail(res.data.data);
            showToast('Project updated successfully', 'success');
            setIsEditing(false);
            if (onProjectUpdated) onProjectUpdated(res.data.data);
        } catch { showToast('Update failed', 'error'); }
    };
    
    const handleBidAction = async (bidId: number, type: 'arsitek' | 'kontraktor', action: 'accept' | 'decline') => {
        setActionLoading(bidId);
        try {
            const endpoint = action === 'accept' ? 'accept-bid' : 'decline-bid';
            const res = await axios.post(`/projects/${detail.id}/${endpoint}`, {
                bid_id: bidId,
                bid_type: type
            });
            setDetail(res.data.data);
            showToast(`Bid ${action === 'accept' ? 'accepted' : 'declined'} successfully`, 'success');
            if (onProjectUpdated) onProjectUpdated(res.data.data);
            fetchDetail(); // Ensure all relationships are refetched
        } catch (err: any) {
            showToast(err.response?.data?.message || `Failed to ${action} bid`, 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusColor = (s?: string) => {
        const status = s?.toLowerCase();
        if (status === 'open') return 'bg-emerald-50 text-emerald-600 border-emerald-100';
        if (status === 'in_progress') return 'bg-blue-50 text-blue-600 border-blue-100';
        return 'bg-gray-50 text-gray-400 border-gray-100';
    };

    const allBids = [...(detail?.bids_arsitek?.map((b: any) => ({ ...b, type: 'arsitek' })) || []), ...(detail?.bids_kontraktor?.map((b: any) => ({ ...b, type: 'kontraktor' })) || [])];

    const isOwner = user?.id === detail?.owner_id;
    const isArchitect = user?.role_type === 'arsitek' && detail?.selected_architect_id === user?.arsitek?.id;
    const isContractor = user?.role_type === 'kontraktor' && detail?.selected_contractor_id === user?.kontraktor?.id;
    const isOwnerOrWorker = isOwner || isArchitect || isContractor;

    const [showRatingId, setShowRatingId] = useState(false);

    if (!detail && isLoading) return null;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <motion.div initial={{ y: 50, scale: 0.95 }} animate={{ y: 0, scale: 1 }} className="bg-white rounded-3xl overflow-hidden shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
                <ProjectDetailHeader title={detail?.title || project.title} status={detail?.status || project.status} activeTab={activeTab} setActiveTab={setActiveTab} onClose={onClose} isManagementView={isManagementView || isOwnerOrWorker} />

                <div className="p-8 overflow-y-auto flex-1 relative isolate">
                    {activeTab === 'details' && (
                        <div className="space-y-8">
                            <div className="flex justify-between items-center">
                                <h3 className="text-2xl font-black text-gray-900">{isEditing ? 'Modify Project' : 'Project Overview'}</h3>
                                {isOwner && <button onClick={() => setIsEditing(!isEditing)} className="text-xs font-black uppercase text-gray-400 hover:text-black">{isEditing ? 'Cancel' : 'Edit'}</button>}
                            </div>
                            {isEditing ? (
                                <ProjectDetailEdit 
                                    {...editForm} 
                                    setTitle={t => setEditForm(f => ({ ...f, title: t }))} 
                                    setDescription={d => setEditForm(f => ({ ...f, description: d }))} 
                                    setBudget={b => setEditForm(f => ({ ...f, budget: b }))} 
                                    setType={t => setEditForm(f => ({ ...f, type: t }))} 
                                    setDeadline={d => setEditForm(f => ({ ...f, deadline: d }))} 
                                    setLat={l => setEditForm(f => ({ ...f, lat: l }))} 
                                    setLng={l => setEditForm(f => ({ ...f, lng: l }))} 
                                    updating={false} 
                                    onSubmit={handleUpdate} 
                                    onCancel={() => setIsEditing(false)} 
                                />
                            ) : (
                                <>
                                    <ProjectDetailInfo detail={detail} formatCurrency={formatCurrency} setLightboxImg={() => {}} />
                                    <ProjectDetailBids 
                                        allBids={allBids} 
                                        detail={detail} 
                                        user={user} 
                                        formatCurrency={formatCurrency} 
                                        onViewProfile={onViewProfile} 
                                        onBidAction={handleBidAction} 
                                        actionLoading={actionLoading} 
                                        toggleCompareSelection={() => {}} 
                                        selectedCompareBidIds={[]} 
                                    />
                                    
                                    {isOwner && detail?.status === 'completed' && (
                                        <button 
                                            onClick={() => setShowRatingId(true)}
                                            className="w-full mt-10 py-5 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl shadow-orange-200/50 hover:scale-[1.02] active:scale-95 transition-all"
                                        >
                                            Submit Project Review
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'team' && (
                        <ProjectTeam 
                            project={detail} 
                            onViewProfile={(type, bidId) => {
                                const profileType = type === 'arsitek' ? 'architect' : 'constructor';
                                onViewProfile?.(profileType, bidId);
                            }} 
                        />
                    )}
                    {activeTab === 'milestones' && (
                        <ProjectMilestones 
                            project={detail} 
                            user={user}
                            isOwnerOrWorker={isOwnerOrWorker} 
                            onUpdate={fetchDetail} 
                        />
                    )}
                    {activeTab === 'qa' && <ProjectComments project={detail} />}
                    {activeTab === 'vault' && <ProjectVault project={detail} />}
                    {activeTab === 'activity' && <ProjectActivity project={detail} />}
                    {activeTab === 'materials' && (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <h5 className="font-black text-gray-400 uppercase tracking-widest">Material & Inventory Coming Soon</h5>
                        </div>
                    )}
                </div>

                <AnimatePresence>
                    {showRatingId && (
                        <RatingModal 
                            projectId={detail.id}
                            projectTitle={detail.title}
                            hasArsitek={!!detail.selected_architect_id}
                            hasKontraktor={!!detail.selected_contractor_id}
                            onClose={() => setShowRatingId(false)}
                            onRated={() => { fetchDetail(); setShowRatingId(false); }}
                        />
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );
};
