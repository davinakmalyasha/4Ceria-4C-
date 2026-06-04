import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
    Shield, 
    Camera, 
    Edit2, 
    Users, 
    Award, 
    TrendingUp, 
    Coins, 
    MessageSquare, 
    Smartphone, 
    Plus, 
    Eye, 
    UserCheck, 
    Clock, 
    Upload, 
    X, 
    Save,
    Calendar,
    Briefcase,
    Trash2,
    Loader2,
    Send,
    ShieldCheck,
    MapPin
} from 'lucide-react';
import { FirmSquadProfileData, FirmMember, JobPosting } from '../../types/sub_professional.types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PortfolioManager } from './PortfolioManager';
import FirmSearchModal from './FirmSearchModal';
import QuickAssignModal from './QuickAssignModal';

interface FirmSquadProfileProps {
    ownerId: number;
    isGuestMode?: boolean;
    onCloseGuest?: () => void;
    onOpenChat?: (user: { id: number }) => void;
}

const GAMING_BADGES: Record<string, { label: string; bg: string; text: string }> = {
    arsitek: { label: 'Squad Leader', bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-500' },
    kontraktor: { label: 'Squad Leader', bg: 'bg-orange-500/10 border-orange-500/30', text: 'text-orange-500' },
    structural: { label: 'Structural Aegis', bg: 'bg-indigo-500/10 border-indigo-500/30', text: 'text-indigo-500' },
    mep: { label: 'MEP Vanguard', bg: 'bg-cyan-500/10 border-cyan-500/30', text: 'text-cyan-500' },
    interior: { label: 'Interior Architect', bg: 'bg-pink-500/10 border-pink-500/30', text: 'text-pink-500' },
    project_manager: { label: 'Grand Tactician', bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-500' },
    civil: { label: 'Iron Mason', bg: 'bg-teal-500/10 border-teal-500/30', text: 'text-teal-500' },
    mechanical: { label: 'Gearwright', bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-500' },
    electrical: { label: 'Spark Core', bg: 'bg-yellow-500/10 border-yellow-500/30', text: 'text-yellow-500' },
    plumbing: { label: 'Hydro Vanguard', bg: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-500' },
    roofing: { label: 'Sky Ward', bg: 'bg-purple-500/10 border-purple-500/30', text: 'text-purple-500' },
    finishing: { label: 'Grand Artificer', bg: 'bg-rose-500/10 border-rose-500/30', text: 'text-rose-500' },
};

const normalizeNeededRoles = (roles: any[] | undefined): JobPosting[] => {
    if (!roles || !Array.isArray(roles)) return [];
    return roles.map((item, idx) => {
        if (typeof item === 'string') {
            return {
                id: `legacy-${idx}-${item}`,
                role: item,
                title: `Legacy Position for ${item.replace(/_/g, ' ').toUpperCase()}`,
                description: `We are looking for a ${item.replace(/_/g, ' ')} specialist to join our squad.`,
                budget: 'Negotiable',
                duration: 'Flexible'
            };
        }
        return {
            id: item.id || `job-${idx}-${Date.now()}`,
            role: item.role || '',
            title: item.title || '',
            description: item.description || '',
            budget: item.budget || '',
            duration: item.duration || ''
        };
    });
};

export default function FirmSquadProfile({ ownerId, isGuestMode = false, onCloseGuest, onOpenChat }: FirmSquadProfileProps) {
    const { user } = useAuth();
    const { showToast } = useToast();
    
    const [profile, setProfile] = useState<FirmSquadProfileData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'roster' | 'portfolio' | 'services'>('roster');
    const [rosterSubTab, setRosterSubTab] = useState<'members' | 'recruitment'>('members');
    
    // Toggle overall page inline edit mode
    const [isEditing, setIsEditing] = useState(false);
    
    // Modals & Action loading
    const [showSearch, setShowSearch] = useState(false);
    const [assigningMember, setAssigningMember] = useState<FirmMember | null>(null);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [requestingJoin, setRequestingJoin] = useState(false);
    const [isSavingChanges, setIsSavingChanges] = useState(false);
    
    // File uploads
    const [bannerLoading, setBannerLoading] = useState(false);
    const [logoLoading, setLogoLoading] = useState(false);

    const [editForm, setEditForm] = useState({
        firm_name: '',
        firm_slogan: '',
        firm_description: '',
        base_rate: 0,
        experience_years: 0,
        firm_is_hiring: false,
        firm_needed_roles: [] as (string | JobPosting)[]
    });

    // Add portfolio state
    const [isAddingProject, setIsAddingProject] = useState(false);
    const [newProjectForm, setNewProjectForm] = useState({
        title: '',
        description: '',
        duration: '',
        client_review: '',
        image: null as File | null
    });
    const [isSavingProject, setIsSavingProject] = useState(false);

    // Edit portfolio state
    const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
    const [editingProjectForm, setEditingProjectForm] = useState({
        title: '',
        description: '',
        duration: '',
        client_review: '',
        image: null as File | null
    });
    const [isUpdatingProject, setIsUpdatingProject] = useState(false);

    // Job Posting State
    const [isAddingJob, setIsAddingJob] = useState(false);
    const [editingJobId, setEditingJobId] = useState<string | null>(null);
    const [jobForm, setJobForm] = useState({
        role: '',
        title: '',
        description: '',
        budget: '',
        duration: ''
    });

    const isOwner = !isGuestMode && user?.id === ownerId;

    const fetchProfile = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await axios.get<FirmSquadProfileData>(`/firm-members/profile/${ownerId}`);
            const normalizedRoles = normalizeNeededRoles(res.data.firm_needed_roles);
            const normalizedProfile = {
                ...res.data,
                firm_needed_roles: normalizedRoles
            };
            setProfile(normalizedProfile);
            setEditForm({
                firm_name: res.data.firm_name || '',
                firm_slogan: res.data.firm_slogan || '',
                firm_description: res.data.firm_description || '',
                base_rate: res.data.stats.base_rate || 0,
                experience_years: res.data.stats.experience_years || 0,
                firm_is_hiring: !!res.data.firm_is_hiring,
                firm_needed_roles: normalizedRoles
            });
        } catch (err: any) {
            showToast('Failed to load squad profile.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [ownerId, showToast]);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'banner' | 'logo') => {
        if (!e.target.files || !e.target.files[0]) return;
        const file = e.target.files[0];
        const data = new FormData();
        
        if (type === 'banner') {
            data.append('firm_banner', file);
            setBannerLoading(true);
        } else {
            data.append('firm_logo', file);
            setLogoLoading(true);
        }

        try {
            await axios.post('/firm-members/update-profile', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            showToast(`${type === 'banner' ? 'Banner' : 'Logo'} updated!`, 'success');
            fetchProfile();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Upload failed', 'error');
        } finally {
            setBannerLoading(false);
            setLogoLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSavingChanges(true);
        try {
            await axios.post('/firm-members/update-profile', editForm);
            showToast('Squad profile updated!', 'success');
            setIsEditing(false);
            fetchProfile();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Update failed', 'error');
        } finally {
            setIsSavingChanges(false);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setIsAddingJob(false);
        setEditingJobId(null);
        if (profile) {
            setEditForm({
                firm_name: profile.firm_name || '',
                firm_slogan: profile.firm_slogan || '',
                firm_description: profile.firm_description || '',
                base_rate: profile.stats.base_rate || 0,
                experience_years: profile.stats.experience_years || 0,
                firm_is_hiring: !!profile.firm_is_hiring,
                firm_needed_roles: profile.firm_needed_roles || []
            });
        }
    };

    const saveHiringUpdate = async (neededRoles: (string | JobPosting)[]) => {
        const isHiring = neededRoles.length > 0;
        try {
            await axios.post('/firm-members/update-profile', {
                firm_is_hiring: isHiring,
                firm_needed_roles: neededRoles
            });
            setProfile(prev => prev ? {
                ...prev,
                firm_is_hiring: isHiring,
                firm_needed_roles: neededRoles
            } : null);
            setEditForm(prev => ({
                ...prev,
                firm_is_hiring: isHiring,
                firm_needed_roles: neededRoles
            }));
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to update recruitment.', 'error');
            fetchProfile();
        }
    };

    const handleAddJob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile) return;
        if (!jobForm.title || !jobForm.role || !jobForm.description) {
            showToast('Please fill out all required fields.', 'warning');
            return;
        }
        const newJob: JobPosting = {
            id: `job-${Date.now()}`,
            role: jobForm.role,
            title: jobForm.title,
            description: jobForm.description,
            budget: jobForm.budget || 'Negotiable',
            duration: jobForm.duration || 'Flexible'
        };
        const updatedRoles = [...(profile.firm_needed_roles || []), newJob];
        setIsAddingJob(false);
        setJobForm({ role: '', title: '', description: '', budget: '', duration: '' });
        showToast('Job posting added successfully!', 'success');
        await saveHiringUpdate(updatedRoles);
    };

    const handleDeleteJob = async (id: string) => {
        if (!profile) return;
        const updatedRoles = (profile.firm_needed_roles || []).filter(job => {
            if (typeof job === 'string') return true;
            return job.id !== id;
        });
        showToast('Job posting deleted!', 'info');
        await saveHiringUpdate(updatedRoles);
    };

    const handleStartEditJob = (job: JobPosting) => {
        setEditingJobId(job.id);
        setJobForm({
            role: job.role,
            title: job.title,
            description: job.description,
            budget: job.budget,
            duration: job.duration
        });
    };

    const handleUpdateJobSubmit = async (e: React.FormEvent, id: string) => {
        e.preventDefault();
        if (!profile) return;
        const updatedRoles = (profile.firm_needed_roles || []).map(job => {
            if (typeof job === 'string') return job;
            if (job.id === id) {
                return {
                    ...job,
                    role: jobForm.role,
                    title: jobForm.title,
                    description: jobForm.description,
                    budget: jobForm.budget || 'Negotiable',
                    duration: jobForm.duration || 'Flexible'
                };
            }
            return job;
        });
        setEditingJobId(null);
        setJobForm({ role: '', title: '', description: '', budget: '', duration: '' });
        showToast('Job posting updated successfully!', 'success');
        await saveHiringUpdate(updatedRoles);
    };

    const handleAddProjectSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile) return;
        setIsSavingProject(true);
        try {
            const data = new FormData();
            data.append('role_type', profile.owner.role_type);
            data.append('title', newProjectForm.title);
            data.append('description', newProjectForm.description);
            if (newProjectForm.duration) data.append('duration', newProjectForm.duration);
            if (newProjectForm.client_review) data.append('client_review', newProjectForm.client_review);
            if (newProjectForm.image) data.append('image', newProjectForm.image);

            await axios.post('/portfolios', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            showToast('Portfolio project added successfully!', 'success');
            setIsAddingProject(false);
            setNewProjectForm({ title: '', description: '', duration: '', client_review: '', image: null });
            fetchProfile();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to add project', 'error');
        } finally {
            setIsSavingProject(false);
        }
    };

    const handleStartEditProject = (p: any) => {
        setEditingProjectId(p.id);
        setEditingProjectForm({
            title: p.title || '',
            description: p.description || '',
            duration: p.duration || '',
            client_review: p.client_review || '',
            image: null
        });
    };

    const handleUpdateProjectSubmit = async (e: React.FormEvent, id: number) => {
        e.preventDefault();
        setIsUpdatingProject(true);
        try {
            const data = new FormData();
            data.append('title', editingProjectForm.title);
            data.append('description', editingProjectForm.description);
            if (editingProjectForm.duration) data.append('duration', editingProjectForm.duration);
            if (editingProjectForm.client_review) data.append('client_review', editingProjectForm.client_review);
            if (editingProjectForm.image) data.append('image', editingProjectForm.image);

            await axios.post(`/portfolios/${id}`, data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            showToast('Portfolio project updated successfully!', 'success');
            setEditingProjectId(null);
            fetchProfile();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to update project', 'error');
        } finally {
            setIsUpdatingProject(false);
        }
    };

    const handleDeleteProject = async (id: number) => {
        if (!confirm('Are you sure you want to delete this portfolio project?')) return;
        try {
            await axios.delete(`/portfolios/${id}`);
            showToast('Portfolio project deleted!', 'success');
            fetchProfile();
        } catch (err: any) {
            showToast('Failed to delete project', 'error');
        }
    };

    const handleJoinRequest = async () => {
        if (!user) return;
        setRequestingJoin(true);
        try {
            await axios.post('/firm-members/request-join', {
                firm_owner_id: ownerId,
                role_in_firm: user.role_type,
            });
            showToast('Join request sent successfully!', 'success');
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to request join', 'error');
        } finally {
            setRequestingJoin(false);
        }
    };

    const handleRemove = async (id: number) => {
        if (!confirm('Are you sure you want to offboard this member from your squad?')) return;
        setActionLoading(id);
        try {
            await axios.delete(`/firm-members/${id}`);
            showToast('Member successfully offboarded.', 'success');
            fetchProfile();
        } catch (err: any) {
            showToast('Failed to offboard member', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleRespondRequest = async (id: number, action: 'accept' | 'decline') => {
        setActionLoading(id);
        try {
            await axios.post(`/firm-members/${id}/respond`, { action });
            showToast(
                action === 'accept' ? 'Request accepted — member added to squad!' : 'Request declined.',
                'success'
            );
            fetchProfile();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Action failed', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleCancelInvitation = async (id: number) => {
        setActionLoading(id);
        try {
            await axios.post(`/firm-members/${id}/cancel`);
            showToast('Invitation cancelled.', 'success');
            fetchProfile();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Action failed', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-bold text-slate-400">LOADING SQUAD PROFILE...</p>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="text-center py-16 bg-slate-50 rounded-3xl border border-slate-200">
                <Shield size={40} className="mx-auto mb-4 text-slate-300" />
                <p className="text-sm font-bold text-slate-500">Squad not found.</p>
            </div>
        );
    }

    const bannerStyle = profile.firm_banner_url 
        ? { backgroundImage: `url(${profile.firm_banner_url})` }
        : {};

    const badge = GAMING_BADGES[profile.owner.role_type] || GAMING_BADGES.arsitek;
    const isAlreadyMember = profile.roster.some(m => m.member_user_id === user?.id && m.status === 'active');
    const isPendingMember = profile.roster.some(m => m.member_user_id === user?.id && ['invited', 'requested'].includes(m.status));

    return (
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden transition-all duration-300 relative">
            {/* Banner Section */}
            <div 
                className={`h-48 md:h-64 relative bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 bg-cover bg-center flex items-end p-6 ${isOwner ? 'group/banner' : ''}`}
                style={bannerStyle}
            >
                {isOwner && (
                    <label className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-xl cursor-pointer transition-all border border-white/10 flex items-center gap-2 text-xs font-black uppercase tracking-wider backdrop-blur-sm">
                        <Camera size={14} />
                        <span>Update Cover</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleFileChange(e, 'banner')} disabled={bannerLoading} />
                    </label>
                )}
                
                {/* Guest Close Button */}
                {isGuestMode && onCloseGuest && (
                    <button 
                        onClick={onCloseGuest}
                        className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white p-2 rounded-xl transition-all border border-white/10"
                    >
                        <X size={18} />
                    </button>
                )}
            </div>

            {/* Profile Info Card Area */}
            <div className="relative px-6 pb-6 pt-16 md:pt-4 border-b border-slate-100 flex flex-col md:flex-row md:items-end justify-between gap-6">
                {/* Avatar / Logo */}
                <div className="absolute left-6 md:left-8 top-0 -translate-y-1/2 w-28 h-28 md:w-36 md:h-36 rounded-[2rem] border-4 border-white bg-slate-900 overflow-hidden shadow-2xl flex items-center justify-center font-black text-white text-3xl group/logo">
                    {logoLoading ? (
                        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : profile.owner.pic ? (
                        <img src={profile.owner.pic} alt="" className="w-full h-full object-cover" />
                    ) : (
                        profile.firm_name?.charAt(0)?.toUpperCase()
                    )}
                    {isOwner && (
                        <label className="absolute inset-0 bg-black/60 opacity-0 group-hover/logo:opacity-100 flex flex-col items-center justify-center text-white cursor-pointer transition-all duration-200">
                            <Camera size={20} className="mb-1" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Edit Logo</span>
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleFileChange(e, 'logo')} disabled={logoLoading} />
                        </label>
                    )}
                </div>

                {/* Text fields & badges */}
                <div className="md:pl-40 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                        {isEditing ? (
                            <input
                                type="text"
                                required
                                value={editForm.firm_name}
                                onChange={e => setEditForm({ ...editForm, firm_name: e.target.value })}
                                className="text-2xl font-black text-slate-900 tracking-tight bg-slate-100/80 border border-indigo-200/50 rounded-xl px-3 py-1 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 max-w-sm"
                                placeholder="Squad Name"
                            />
                        ) : (
                            <div className="flex items-center gap-2">
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">{profile.firm_name}</h2>
                                {isOwner && (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200/50 rounded-xl text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm font-bold"
                                        title="Edit Squad Details"
                                    >
                                        <Edit2 size={10} /> Edit Details
                                    </button>
                                )}
                            </div>
                        )}
                        <span className={`px-2.5 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-widest ${badge.bg} ${badge.text}`}>
                            {badge.label}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-400">TAG: #{profile.owner.unique_code}</span>
                    </div>

                    <div className="pt-1">
                        {isEditing ? (
                            <input
                                type="text"
                                value={editForm.firm_slogan}
                                onChange={e => setEditForm({ ...editForm, firm_slogan: e.target.value })}
                                className="text-sm font-bold text-indigo-600 bg-slate-100/80 border border-indigo-200/50 rounded-xl px-3 py-1 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 w-full max-w-md font-mono"
                                placeholder="Squad Tagline / Slogan"
                            />
                        ) : (
                            <p className="text-sm font-bold text-indigo-600/90 italic tracking-wide">
                                {profile.firm_slogan || "Building with synergy and precision."}
                            </p>
                        )}
                    </div>

                    <div className="pt-1">
                        {isEditing ? (
                            <textarea
                                value={editForm.firm_description}
                                onChange={e => setEditForm({ ...editForm, firm_description: e.target.value })}
                                className="text-xs text-slate-600 font-semibold bg-slate-100/80 border border-indigo-200/50 rounded-xl px-3 py-1.5 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 w-full max-w-2xl resize-none leading-relaxed"
                                rows={2}
                                placeholder="Squad description / bio overview..."
                            />
                        ) : (
                            <p className="text-xs text-slate-500 font-semibold max-w-2xl leading-relaxed">
                                {profile.firm_description || "We are a cohesive team of design and execution professionals, dedicated to delivering structural mastery."}
                            </p>
                        )}
                    </div>
                </div>

                {/* Context-based controls */}
                <div className="flex gap-2 self-start md:self-end">
                    {isOwner ? (
                        isEditing && (
                            <div className="flex gap-2 animate-fade-in">
                                <button
                                    onClick={handleCancel}
                                    disabled={isSavingChanges}
                                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 font-bold"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSavingChanges || logoLoading || bannerLoading}
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50 font-bold"
                                >
                                    <Save size={12} /> {isSavingChanges ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        )
                    ) : (
                        <>
                            {onOpenChat && (
                                <button
                                    onClick={() => onOpenChat({ id: ownerId })}
                                    className="flex items-center gap-2 px-5 py-3 bg-slate-100 text-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all font-semibold"
                                >
                                    <MessageSquare size={12} /> Chat Leader
                                </button>
                            )}
                            
                            {user && user.id !== ownerId && (
                                <>
                                    {isAlreadyMember ? (
                                        <span className="px-4 py-3 bg-emerald-50 text-emerald-750 rounded-2xl text-xs font-black uppercase tracking-widest border border-emerald-100 inline-flex items-center gap-1.5">
                                            <UserCheck size={12} /> Active Member
                                        </span>
                                    ) : isPendingMember ? (
                                        <span className="px-4 py-3 bg-amber-50 text-amber-700 rounded-2xl text-xs font-black uppercase tracking-widest border border-amber-100 inline-flex items-center gap-1.5">
                                            <Clock size={12} /> Pending Request
                                        </span>
                                    ) : (
                                        ['structural', 'mep', 'interior', 'civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'].includes(user.role_type) && (
                                            <button
                                                onClick={handleJoinRequest}
                                                disabled={requestingJoin}
                                                className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50"
                                            >
                                                {requestingJoin ? 'Sending...' : 'Request to Join'}
                                            </button>
                                        )
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Glowing Stats Dashboard Bar */}
            <div className="grid grid-cols-2 lg:grid-cols-5 bg-slate-50 border-b border-slate-100 p-4 gap-4">
                <div className="p-4 bg-white rounded-2xl border border-slate-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600 shrink-0">
                        <Award size={18} />
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Completed Projects</p>
                        <p className="text-base font-black text-slate-900 mt-0.5">{profile.stats.review_count + profile.portfolios.length} Wins</p>
                    </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-slate-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                        <TrendingUp size={18} />
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Success Rate</p>
                        <p className="text-base font-black text-slate-900 mt-0.5">{profile.stats.average_rating} ★</p>
                    </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-slate-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                        <Users size={18} />
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Squad Roster</p>
                        <p className="text-base font-black text-slate-900 mt-0.5">
                            {profile.roster.filter(m => m.status === 'active').length + 1} Active
                        </p>
                    </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-slate-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                        <Coins size={18} />
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Base Est. Rate</p>
                        {isEditing ? (
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-xs font-bold text-slate-400">IDR</span>
                                <input
                                    type="number"
                                    value={editForm.base_rate}
                                    onChange={e => setEditForm({ ...editForm, base_rate: Number(e.target.value) })}
                                    className="text-xs font-black text-slate-950 bg-slate-100 border border-indigo-200/50 rounded px-1.5 py-0.5 outline-none w-24"
                                />
                            </div>
                        ) : (
                            <p className="text-sm font-black text-slate-900 mt-0.5 truncate">
                                {profile.stats.base_rate > 0 ? `IDR ${profile.stats.base_rate.toLocaleString('id-ID')}` : 'Flexible'}
                            </p>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-slate-100 flex items-center gap-3 col-span-2 lg:col-span-1">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                        <Briefcase size={18} />
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Specialty Tag</p>
                        <p className="text-xs font-black text-slate-950 mt-0.5 truncate uppercase tracking-wider">
                            {profile.owner.role_type} Firm
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content Tabs */}
            <div className="p-6">
                <div className="flex gap-2 border-b border-slate-100 pb-3 mb-6">
                    <button
                        onClick={() => setActiveTab('roster')}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                            activeTab === 'roster'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100'
                        }`}
                    >
                        Squad Roster
                    </button>
                    <button
                        onClick={() => setActiveTab('portfolio')}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                            activeTab === 'portfolio'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100'
                        }`}
                    >
                        Portfolio Projects
                    </button>
                    <button
                        onClick={() => setActiveTab('services')}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                            activeTab === 'services'
                                ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100'
                        }`}
                    >
                        Services & Info
                    </button>
                </div>

                {activeTab === 'roster' && (
                    <div className="space-y-6">
                        {/* Sub-tab Switcher for Squad Roster */}
                        <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl w-fit border border-slate-100/80">
                            <button
                                onClick={() => setRosterSubTab('members')}
                                className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                    rosterSubTab === 'members'
                                        ? 'bg-indigo-650 text-white shadow-md'
                                        : 'text-slate-500 hover:text-slate-800 bg-transparent'
                                }`}
                            >
                                Active Member Roster
                            </button>
                            {(isOwner || (profile?.firm_needed_roles && (profile.firm_needed_roles as JobPosting[]).length > 0)) && (
                                <button
                                    onClick={() => setRosterSubTab('recruitment')}
                                    className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                        rosterSubTab === 'recruitment'
                                            ? 'bg-indigo-650 text-white shadow-md'
                                            : 'text-slate-500 hover:text-slate-800 bg-transparent'
                                    }`}
                                >
                                    Recruitment Board
                                </button>
                            )}
                        </div>

                        {rosterSubTab === 'recruitment' && (isOwner || (profile?.firm_needed_roles && (profile.firm_needed_roles as JobPosting[]).length > 0)) && (
                            <div className="space-y-6">
                                {/* Pending Join Requests (Visible only to owner) */}
                                {isOwner && profile.roster.some(m => m.status === 'requested') && (
                                    <div className="bg-amber-50/20 border border-amber-100/60 rounded-3xl p-6 space-y-4">
                                        <div>
                                            <h4 className="text-sm font-black text-amber-800 uppercase tracking-widest flex items-center gap-2">
                                                <Users size={16} /> Pending Join Requests
                                            </h4>
                                            <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Specialists requesting to join your squad</p>
                                        </div>
                                        <div className="space-y-4">
                                            {profile.roster.filter(m => m.status === 'requested').map(req => {
                                                const roleLabel = req.role_in_firm.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                                                const isVerified = req.member?.verification_status === 'verified';
                                                const hasPic = !!req.member?.pic;
                                                const exp = req.member?.pengalaman_tahun || 0;
                                                const rate = req.member?.rate_harga || 0;
                                                const location = req.member?.lokasi || 'N/A';
                                                const bio = req.member?.deskripsi;
                                                const portfolios = req.member?.portfolios || [];
                                                
                                                return (
                                                    <div key={req.id} className="p-6 bg-white border border-amber-200/50 rounded-[2rem] shadow-sm hover:shadow-md transition-all space-y-4 animate-slide-down">
                                                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                                                            {/* Column 1: Profile & Identity */}
                                                            <div className="flex items-start gap-4 lg:col-span-1 min-w-0">
                                                                <div className="w-16 h-16 rounded-[1.25rem] bg-amber-50 flex items-center justify-center text-amber-700 font-black text-xl shrink-0 overflow-hidden border border-amber-200/40 shadow-inner">
                                                                    {hasPic ? (
                                                                        <img src={req.member.pic!} alt="" className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        req.member?.name?.charAt(0)?.toUpperCase()
                                                                    )}
                                                                </div>
                                                                <div className="space-y-1 min-w-0">
                                                                    <h5 className="text-base font-black text-slate-900 leading-tight truncate">{req.member?.name}</h5>
                                                                    <p className="text-[10px] text-slate-400 font-mono font-bold">#{req.member?.unique_code}</p>
                                                                    <span className="inline-block px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 text-[8px] font-black uppercase tracking-wider rounded-md mt-1">
                                                                        {roleLabel}
                                                                    </span>
                                                                    {isVerified && (
                                                                        <div className="flex items-center gap-1 text-[8px] font-black text-emerald-650 uppercase tracking-widest mt-1">
                                                                            <ShieldCheck size={12} className="text-emerald-500" />
                                                                            Verified Specialist
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Column 2: Stats & Profile Info */}
                                                            <div className="space-y-2 lg:col-span-1 text-xs">
                                                                <div className="flex items-center gap-2 text-slate-655 font-semibold">
                                                                    <Briefcase size={13} className="text-slate-400 shrink-0" />
                                                                    <span>Experience: <strong>{exp > 0 ? `${exp} Years` : 'New'}</strong></span>
                                                                </div>
                                                                <div className="flex items-center gap-2 text-slate-655 font-semibold">
                                                                    <Coins size={13} className="text-slate-400 shrink-0" />
                                                                    <span>Rate: <strong>{rate > 0 ? `IDR ${rate.toLocaleString('id-ID')}` : 'Flexible'}</strong></span>
                                                                </div>
                                                                <div className="flex items-center gap-2 text-slate-655 font-semibold">
                                                                    <MapPin size={13} className="text-slate-400 shrink-0" />
                                                                    <span className="truncate">Location: <strong>{location}</strong></span>
                                                                </div>
                                                                {bio && (
                                                                    <p className="text-[10px] text-slate-500 line-clamp-2 mt-1 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100/50 italic">
                                                                        "{bio}"
                                                                    </p>
                                                                )}
                                                            </div>

                                                            {/* Column 3: Portfolios */}
                                                            <div className="lg:col-span-1 space-y-2 w-full">
                                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Portfolios ({portfolios.length})</span>
                                                                {portfolios.length > 0 ? (
                                                                    <div className="flex gap-2 overflow-x-auto pb-1 max-w-full">
                                                                        {portfolios.slice(0, 3).map((p: any) => (
                                                                            <div key={p.id} className="w-20 shrink-0 bg-slate-50 border border-slate-100 rounded-xl p-1.5 flex flex-col justify-between h-16 text-left relative overflow-hidden group/porto">
                                                                                {p.image_path && (
                                                                                    <img src={p.image_path.startsWith('http') ? p.image_path : `/storage/${p.image_path}`} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15 group-hover/porto:opacity-30 transition-opacity" />
                                                                                )}
                                                                                <p className="text-[8px] font-black text-slate-800 line-clamp-2 relative z-10">{p.title}</p>
                                                                                <span className="text-[7px] font-bold text-slate-400 relative z-10 truncate">{p.duration || 'Flexible'}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <p className="text-[10px] text-slate-400 font-bold italic py-1">No portfolios uploaded.</p>
                                                                )}
                                                            </div>

                                                            {/* Column 4: Accept & Decline Actions */}
                                                            <div className="flex flex-row lg:flex-col gap-2 w-full lg:w-fit lg:col-span-1 justify-end items-end h-full">
                                                                <button
                                                                    onClick={() => handleRespondRequest(req.id, 'accept')}
                                                                    disabled={actionLoading === req.id}
                                                                    className="flex-1 lg:w-32 flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition disabled:opacity-50 font-bold shadow-md shadow-emerald-500/10"
                                                                >
                                                                    {actionLoading === req.id ? (
                                                                        <Loader2 size={12} className="animate-spin" />
                                                                    ) : (
                                                                        <Send size={12} className="rotate-90" />
                                                                    )}
                                                                    Accept
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRespondRequest(req.id, 'decline')}
                                                                    disabled={actionLoading === req.id}
                                                                    className="flex-1 lg:w-32 flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-650 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition disabled:opacity-50 font-bold border border-slate-200/60"
                                                                >
                                                                    Decline
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                                <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
                                    <div>
                                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Squad Recruitment & Job Board</h4>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                            {isOwner 
                                                ? "Post active job vacancies online to recruit specialists" 
                                                : "Active job openings in this squad"}
                                        </p>
                                    </div>
                                    {!isOwner && (
                                        <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700">
                                            Hiring Active
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    {/* List of Job Postings */}
                                    <div className="space-y-3.5">
                                        {(profile?.firm_needed_roles as JobPosting[] || []).length > 0 ? (
                                            (profile?.firm_needed_roles as JobPosting[] || []).map((job) => {
                                                const isEditingCard = editingJobId === job.id;
                                                const roleLabel = job.role?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                                                
                                                if (isOwner && isEditingCard) {
                                                    // Render inline edit job form
                                                    return (
                                                        <form key={job.id} onSubmit={(e) => handleUpdateJobSubmit(e, job.id)} className="p-5 bg-white border border-indigo-150 rounded-2xl space-y-4 animate-fade-in">
                                                            <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                                                                <h5 className="text-[10px] font-black text-indigo-650 uppercase tracking-widest">Editing Job Posting</h5>
                                                                <button type="button" onClick={() => setEditingJobId(null)} className="text-slate-400 hover:text-slate-655"><X size={14} /></button>
                                                            </div>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                <div>
                                                                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Job Title</label>
                                                                    <input
                                                                        type="text"
                                                                        required
                                                                        value={jobForm.title}
                                                                        onChange={e => setJobForm({ ...jobForm, title: e.target.value })}
                                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none"
                                                                        placeholder="e.g. Senior Interior Draftsman"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Category (Target Role)</label>
                                                                    <select
                                                                        required
                                                                        value={jobForm.role}
                                                                        onChange={e => setJobForm({ ...jobForm, role: e.target.value })}
                                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none"
                                                                    >
                                                                        <option value="" disabled>Select category...</option>
                                                                        {(profile.owner.role_type === 'arsitek' 
                                                                            ? ['structural', 'mep', 'interior'] 
                                                                            : ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing']
                                                                        ).map(opt => (
                                                                            <option key={opt} value={opt}>{opt.replace(/_/g, ' ').toUpperCase()}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Estimated Compensation</label>
                                                                    <input
                                                                        type="text"
                                                                        value={jobForm.budget}
                                                                        onChange={e => setJobForm({ ...jobForm, budget: e.target.value })}
                                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none"
                                                                        placeholder="e.g. IDR 5M / Project or Negotiable"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Estimated Duration</label>
                                                                    <input
                                                                        type="text"
                                                                        value={jobForm.duration}
                                                                        onChange={e => setJobForm({ ...jobForm, duration: e.target.value })}
                                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none"
                                                                        placeholder="e.g. 3 Weeks or Ongoing"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Description / Scope of Work</label>
                                                                <textarea
                                                                    required
                                                                    rows={3}
                                                                    value={jobForm.description}
                                                                    onChange={e => setJobForm({ ...jobForm, description: e.target.value })}
                                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none resize-none leading-relaxed"
                                                                    placeholder="Detail the target phases, structural calculations, blueprints needed, etc."
                                                                />
                                                            </div>
                                                            <div className="flex gap-2 justify-end">
                                                                <button type="button" onClick={() => setEditingJobId(null)} className="px-3.5 py-1.5 border border-slate-250 text-slate-650 rounded-xl text-[9px] font-black uppercase tracking-wider">Cancel</button>
                                                                <button type="submit" className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-wider shadow-sm font-bold">Update Job</button>
                                                            </div>
                                                        </form>
                                                    );
                                                }

                                                // Read-only project display card for owner (with Edit/Delete) or guest
                                                return (
                                                    <div key={job.id} className="p-5 bg-white border border-slate-150 hover:border-indigo-200 rounded-2xl shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center transition-all">
                                                        <div className="flex-1 space-y-2">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <h5 className="font-black text-slate-900 text-sm">{job.title}</h5>
                                                                <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[8px] font-black uppercase tracking-wider rounded border">
                                                                    {roleLabel}
                                                                </span>
                                                            </div>
                                                            <p className="text-[11px] text-slate-655 leading-relaxed font-medium">{job.description}</p>
                                                            <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                                                <span className="flex items-center gap-1"><Coins size={12} className="text-slate-400" /> {job.budget}</span>
                                                                <span className="flex items-center gap-1"><Clock size={12} className="text-slate-400" /> {job.duration}</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex gap-2 shrink-0 self-end sm:self-center">
                                                            {isOwner ? (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleStartEditJob(job)}
                                                                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors"
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteJob(job.id)}
                                                                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-55 rounded-lg transition-colors"
                                                                        title="Delete Job"
                                                                    >
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                // Guest request join triggers
                                                                user && user.role_type?.toLowerCase() === job.role?.toLowerCase() && (
                                                                    isAlreadyMember ? (
                                                                        <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider rounded-xl border border-emerald-100">Member</span>
                                                                    ) : isPendingMember ? (
                                                                        <span className="px-3 py-1.5 bg-amber-50 text-amber-700 text-[9px] font-black uppercase tracking-wider rounded-xl border border-amber-100">Requested</span>
                                                                    ) : (
                                                                        <button
                                                                            onClick={handleJoinRequest}
                                                                            disabled={requestingJoin}
                                                                            className="px-4 py-2 bg-indigo-650 hover:bg-indigo-755 text-white text-[9px] font-black uppercase tracking-widest rounded-xl transition shadow-md disabled:opacity-50 font-bold"
                                                                        >
                                                                            {requestingJoin ? 'Sending...' : 'Apply Role'}
                                                                        </button>
                                                                    )
                                                                )
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="text-center py-6 text-slate-400 text-xs italic font-medium">No jobs posted yet. List roles you want to recruit.</div>
                                        )}
                                    </div>

                                    {/* Inline Add Job Posting Form */}
                                    {isOwner && (
                                        <div className="pt-2">
                                            {isAddingJob ? (
                                                <form onSubmit={handleAddJob} className="p-5 bg-white border-2 border-dashed border-indigo-200 rounded-2xl space-y-4 animate-slide-down">
                                                    <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                                                        <h5 className="text-[10px] font-black text-indigo-650 uppercase tracking-widest">Create New Job Posting</h5>
                                                        <button type="button" onClick={() => setIsAddingJob(false)} className="text-slate-400 hover:text-slate-655"><X size={14} /></button>
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Job Title</label>
                                                            <input
                                                                type="text"
                                                                required
                                                                value={jobForm.title}
                                                                onChange={e => setJobForm({ ...jobForm, title: e.target.value })}
                                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none"
                                                                placeholder="e.g. MEP Systems Coordinator"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Category (Target Role)</label>
                                                            <select
                                                                required
                                                                value={jobForm.role}
                                                                onChange={e => setJobForm({ ...jobForm, role: e.target.value })}
                                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none"
                                                            >
                                                                <option value="" disabled>Select category...</option>
                                                                {(profile.owner.role_type === 'arsitek' 
                                                                    ? ['structural', 'mep', 'interior'] 
                                                                    : ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing']
                                                                ).map(opt => (
                                                                    <option key={opt} value={opt}>{opt.replace(/_/g, ' ').toUpperCase()}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Estimated Compensation</label>
                                                            <input
                                                                type="text"
                                                                value={jobForm.budget}
                                                                onChange={e => setJobForm({ ...jobForm, budget: e.target.value })}
                                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none"
                                                                placeholder="e.g. IDR 12.000.000 or Negotiable"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Estimated Duration</label>
                                                            <input
                                                                type="text"
                                                                value={jobForm.duration}
                                                                onChange={e => setJobForm({ ...jobForm, duration: e.target.value })}
                                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none"
                                                                placeholder="e.g. 1 Month or Ongoing"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Description / Scope of Work</label>
                                                        <textarea
                                                            required
                                                            rows={3}
                                                            value={jobForm.description}
                                                            onChange={e => setJobForm({ ...jobForm, description: e.target.value })}
                                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none resize-none leading-relaxed"
                                                            placeholder="Outline the responsibilities, blueprints required, and calculations expected."
                                                        />
                                                    </div>
                                                    <div className="flex gap-2 justify-end">
                                                        <button type="button" onClick={() => setIsAddingJob(false)} className="px-3.5 py-1.5 border border-slate-250 text-slate-650 rounded-xl text-[9px] font-black uppercase tracking-wider">Cancel</button>
                                                        <button type="submit" className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-wider shadow-sm font-bold">Add Job Posting</button>
                                                    </div>
                                                </form>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsAddingJob(true);
                                                        setJobForm({
                                                            role: profile.owner.role_type === 'arsitek' ? 'structural' : 'civil',
                                                            title: '',
                                                            description: '',
                                                            budget: '',
                                                            duration: ''
                                                        });
                                                    }}
                                                    className="w-full py-3 bg-white hover:bg-slate-100/50 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-600 hover:border-indigo-300 transition-all flex items-center justify-center gap-1.5"
                                                >
                                                    <Plus size={14} /> Add Job Posting
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                        {rosterSubTab === 'members' && (
                            <>
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-black text-slate-900 tracking-tight">Active Roster members</h3>
                                    {isOwner && (
                                        <button
                                            onClick={() => setShowSearch(true)}
                                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md"
                                        >
                                            <Plus size={12} /> Invite Specialist
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                    {/* Lead Professional Card */}
                                    <div className="p-5 bg-gradient-to-br from-slate-50 to-indigo-50/20 border-2 border-indigo-200 rounded-3xl shadow-sm flex flex-col justify-between h-full relative">
                                        <span className="absolute top-4 right-4 px-2 py-0.5 bg-indigo-600 text-white text-[8px] font-black uppercase tracking-widest rounded-full">
                                            Owner
                                        </span>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-2xl bg-indigo-900 flex items-center justify-center text-white font-black text-lg overflow-hidden shrink-0">
                                                    {profile.owner.pic ? (
                                                        <img src={profile.owner.pic} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        profile.owner.name.charAt(0).toUpperCase()
                                                    )}
                                                </div>
                                                <div>
                                                    <h5 className="text-sm font-black text-slate-900 leading-tight">{profile.owner.name}</h5>
                                                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">#{profile.owner.unique_code}</p>
                                                </div>
                                            </div>

                                            <div className="mt-5 space-y-2">
                                                <div className="flex items-center justify-between bg-white border border-indigo-100/60 p-2.5 rounded-2xl">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Squad Position</span>
                                                    <span className={`px-2 py-0.5 border rounded-lg text-[9px] font-black uppercase tracking-wider ${badge.bg} ${badge.text}`}>
                                                        Leader
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between bg-white border border-indigo-100/60 p-2.5 rounded-2xl">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Base Specialty</span>
                                                    <span className="text-[9px] font-black text-indigo-700 uppercase tracking-wider">
                                                        {profile.owner.role_type}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-5 pt-3 border-t border-slate-100 text-[10px] text-slate-400 font-semibold italic text-center">
                                            Primary Squad Lead / Professional
                                        </div>
                                    </div>

                                    {/* Roster List */}
                                    {profile.roster.filter(m => m.status === 'active').map(m => {
                                        const roleBadge = GAMING_BADGES[m.role_in_firm] || { label: 'Specialist', bg: 'bg-slate-100 border-slate-200', text: 'text-slate-700' };
                                        const isAlreadyAssigned = (m.active_projects_count ?? 0) > 0;
                                        const phone = m.member?.phone || m.member?.no_telp;
                                        
                                        return (
                                            <div key={m.id} className="p-5 bg-white border border-slate-100 rounded-3xl shadow-sm hover:border-indigo-200 transition-all flex flex-col justify-between h-full">
                                                <div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-lg overflow-hidden shrink-0">
                                                            {m.member?.pic ? (
                                                                <img src={m.member.pic} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                m.member?.name?.charAt(0)?.toUpperCase()
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h5 className="text-sm font-black text-slate-900 leading-tight">{m.member?.name}</h5>
                                                            <p className="text-[9px] text-slate-400 font-mono mt-0.5">#{m.member?.unique_code}</p>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 space-y-2">
                                                        <div className="flex items-center justify-between bg-slate-50/50 p-2.5 rounded-2xl border border-slate-100/50">
                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Squad Position</span>
                                                            <span className={`px-2 py-0.5 border rounded-lg text-[9px] font-black uppercase tracking-wider ${roleBadge.bg} ${roleBadge.text}`}>
                                                                {roleBadge.label}
                                                            </span>
                                                        </div>
                                                        
                                                        <div className="flex items-center justify-between bg-slate-50/50 p-2.5 rounded-2xl border border-slate-100/50">
                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Specialty</span>
                                                            <span className="text-[9px] font-black text-slate-800 uppercase tracking-wider">{m.role_in_firm}</span>
                                                        </div>
                                                    </div>

                                                    {/* Workload Tracker */}
                                                    <div className="mt-3 px-3 py-2 bg-indigo-50/20 border border-indigo-100/30 rounded-2xl space-y-1">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Workload</span>
                                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                                                isAlreadyAssigned ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                                                            }`}>
                                                                {m.active_projects_count || 0} Projects
                                                            </span>
                                                        </div>
                                                        {m.active_projects && m.active_projects.length > 0 ? (
                                                            <div className="text-[9px] font-bold text-slate-600 truncate max-w-full" title={m.active_projects.join(', ')}>
                                                                {m.active_projects.join(', ')}
                                                            </div>
                                                        ) : (
                                                            <div className="text-[9px] text-slate-400 font-medium italic">No active project workloads.</div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="mt-5 pt-3 border-t border-slate-50 flex gap-2">
                                                    {isOwner && (
                                                        <>
                                                            <button
                                                                onClick={() => setAssigningMember(m)}
                                                                className={`flex-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                                                    isAlreadyAssigned
                                                                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                                                        : "bg-indigo-650 text-white hover:bg-indigo-700"
                                                                }`}
                                                                disabled={isAlreadyAssigned}
                                                            >
                                                                Assign
                                                            </button>
                                                            <button
                                                                onClick={() => handleRemove(m.id)}
                                                                className="px-3 py-2 bg-rose-50 text-rose-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-100 transition-colors"
                                                                disabled={actionLoading !== null}
                                                            >
                                                                Remove
                                                            </button>
                                                        </>
                                                    )}
                                                    {onOpenChat && (
                                                        <button
                                                            onClick={() => onOpenChat({ id: m.member_user_id })}
                                                            className="flex items-center justify-center p-2.5 bg-slate-50 hover:bg-indigo-50 text-slate-650 hover:text-indigo-600 rounded-xl transition-colors"
                                                        >
                                                            <MessageSquare size={12} />
                                                        </button>
                                                    )}
                                                    {phone && (
                                                        <a
                                                            href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=Hi%20${m.member?.name || ''},`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center justify-center p-2.5 bg-[#25D366]/10 text-[#128C7E] rounded-xl hover:bg-[#25D366]/20 transition-colors"
                                                        >
                                                            <Smartphone size={12} />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Pending Invitations (Visible only to owner) */}
                                {isOwner && profile.roster.some(m => m.status === 'invited') && (
                                    <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-6 space-y-4 mt-8">
                                        <div>
                                            <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                                <Users size={16} /> Pending Invitations
                                            </h4>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Members you have invited to join your squad</p>
                                        </div>
                                        <div className="space-y-3">
                                            {profile.roster.filter(m => m.status === 'invited').map(inv => {
                                                const roleLabel = inv.role_in_firm.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                                                return (
                                                    <div key={inv.id} className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm animate-slide-down">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-655 font-black text-sm shrink-0 overflow-hidden">
                                                                {inv.member?.pic ? (
                                                                    <img src={inv.member.pic} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    inv.member?.name?.charAt(0)?.toUpperCase()
                                                                )}
                                                            </div>
                                                            <div>
                                                                <h5 className="text-sm font-black text-slate-900 leading-tight">{inv.member?.name}</h5>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                                                                        Invited as {roleLabel}
                                                                    </span>
                                                                    <span className="text-[9px] font-mono text-slate-400 font-bold">#{inv.member?.unique_code}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => handleCancelInvitation(inv.id)}
                                                                disabled={actionLoading === inv.id}
                                                                className="px-3.5 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-650 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 font-bold"
                                                            >
                                                                {actionLoading === inv.id ? (
                                                                    <Loader2 size={12} className="animate-spin" />
                                                                ) : (
                                                                    'Cancel Invitation'
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'portfolio' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                                    {isOwner && !isAddingProject && (
                                        <button
                                            onClick={() => setIsAddingProject(true)}
                                            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md"
                                        >
                                            <Plus size={12} /> Add Project
                                        </button>
                                    )}
                                </div>

                                {/* Inline Add Project Form */}
                                {isOwner && isAddingProject && (
                            <form onSubmit={handleAddProjectSubmit} className="bg-slate-50 p-6 rounded-3xl border border-indigo-100 space-y-4 animate-slide-down">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">Add New Portfolio Project</h4>
                                    <button 
                                        type="button" 
                                        onClick={() => setIsAddingProject(false)} 
                                        className="text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Project Title</label>
                                        <input
                                            type="text"
                                            required
                                            value={newProjectForm.title}
                                            onChange={e => setNewProjectForm({ ...newProjectForm, title: e.target.value })}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                            placeholder="e.g. Luxury Penthouse in Bali"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Project Duration</label>
                                        <input
                                            type="text"
                                            value={newProjectForm.duration}
                                            onChange={e => setNewProjectForm({ ...newProjectForm, duration: e.target.value })}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                            placeholder="e.g. 8 Months"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Project Description</label>
                                        <textarea
                                            required
                                            rows={3}
                                            value={newProjectForm.description}
                                            onChange={e => setNewProjectForm({ ...newProjectForm, description: e.target.value })}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none leading-relaxed"
                                            placeholder="Describe the scope, materials used, and your squad's achievements..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Client Review / Testimonial (Optional)</label>
                                        <textarea
                                            rows={2}
                                            value={newProjectForm.client_review}
                                            onChange={e => setNewProjectForm({ ...newProjectForm, client_review: e.target.value })}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none leading-relaxed"
                                            placeholder="e.g. Pristine and on schedule. Best contractor in the city."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Project Cover Image</label>
                                        <div className="relative">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={e => setNewProjectForm({ ...newProjectForm, image: e.target.files ? e.target.files[0] : null })}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            <div className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs flex items-center justify-between font-semibold text-slate-600">
                                                <span className="truncate">{newProjectForm.image ? newProjectForm.image.name : 'Select Cover Photo...'}</span>
                                                <Upload size={14} className="text-slate-400" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingProject(false)}
                                        className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSavingProject}
                                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        {isSavingProject ? 'Saving...' : 'Save Project'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Projects Grid */}
                        {profile.portfolios.length === 0 ? (
                            <div className="text-center py-16 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                                <Briefcase size={32} className="mx-auto mb-3 text-slate-300" />
                                <p className="text-sm font-bold text-slate-500">No portfolio projects uploaded yet.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {profile.portfolios.map(p => {
                                    const isEditingCard = editingProjectId === p.id;
                                    return (
                                        <div key={p.id} className="border border-slate-100 rounded-[2rem] overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 bg-white flex flex-col justify-between">
                                            {isEditingCard ? (
                                                /* Card Inline Edit Form */
                                                <form onSubmit={e => handleUpdateProjectSubmit(e, p.id)} className="p-6 space-y-4 flex-1 animate-fade-in">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Editing Portfolio Project</h4>
                                                        <button 
                                                            type="button" 
                                                            onClick={() => setEditingProjectId(null)} 
                                                            className="text-slate-400 hover:text-slate-600"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                    
                                                    <div className="space-y-3">
                                                        <div>
                                                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Project Title</label>
                                                            <input
                                                                type="text"
                                                                required
                                                                value={editingProjectForm.title}
                                                                onChange={e => setEditingProjectForm({ ...editingProjectForm, title: e.target.value })}
                                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:bg-white outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Project Duration</label>
                                                            <input
                                                                type="text"
                                                                value={editingProjectForm.duration}
                                                                onChange={e => setEditingProjectForm({ ...editingProjectForm, duration: e.target.value })}
                                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:bg-white outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Project Description</label>
                                                            <textarea
                                                                required
                                                                rows={3}
                                                                value={editingProjectForm.description}
                                                                onChange={e => setEditingProjectForm({ ...editingProjectForm, description: e.target.value })}
                                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:bg-white outline-none resize-none leading-relaxed"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Client Review / Testimonial</label>
                                                            <textarea
                                                                rows={2}
                                                                value={editingProjectForm.client_review}
                                                                onChange={e => setEditingProjectForm({ ...editingProjectForm, client_review: e.target.value })}
                                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:bg-white outline-none resize-none leading-relaxed"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Replace Photo (Optional)</label>
                                                            <div className="relative">
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    onChange={e => setEditingProjectForm({ ...editingProjectForm, image: e.target.files ? e.target.files[0] : null })}
                                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                                />
                                                                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs flex items-center justify-between font-semibold text-slate-500">
                                                                    <span className="truncate">{editingProjectForm.image ? editingProjectForm.image.name : 'Choose new cover image...'}</span>
                                                                    <Upload size={12} className="text-slate-400" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2 justify-end pt-3 border-t border-slate-100 mt-4">
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingProjectId(null)}
                                                            className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="submit"
                                                            disabled={isUpdatingProject}
                                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors shadow-sm disabled:opacity-50"
                                                        >
                                                            {isUpdatingProject ? 'Saving...' : 'Update'}
                                                        </button>
                                                    </div>
                                                </form>
                                            ) : (
                                                /* Normal Project Display Card */
                                                <>
                                                    <div>
                                                        {p.image_path ? (
                                                            <img src={`/storage/${p.image_path}`} alt={p.title} className="w-full h-48 object-cover" />
                                                        ) : (
                                                            <div className="w-full h-48 bg-slate-50 flex items-center justify-center text-slate-400 text-xs font-bold font-mono">NO PROJECT COVER</div>
                                                        )}
                                                        <div className="p-6">
                                                            <h5 className="font-black text-slate-900 text-base mb-1">{p.title}</h5>
                                                            {p.duration && (
                                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                                                    <Calendar size={10} /> {p.duration}
                                                                </p>
                                                            )}
                                                            <p className="text-xs text-slate-600 leading-relaxed mb-4">{p.description}</p>
                                                            {p.client_review && (
                                                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/60 italic text-[11px] text-slate-500">
                                                                    "{p.client_review}"
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Owner Actions always visible to owner */}
                                                    {isOwner && (
                                                        <div className="px-6 pb-6 pt-2 border-t border-slate-50 flex gap-2 justify-end">
                                                            <button
                                                                onClick={() => handleStartEditProject(p)}
                                                                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors flex items-center gap-1"
                                                            >
                                                                <Edit2 size={10} /> Edit
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteProject(p.id)}
                                                                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}


                {activeTab === 'services' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Squad Bio & Mission</h4>
                                    {isOwner && !isEditing && (
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200/50 rounded-xl text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm font-bold"
                                        >
                                            <Edit2 size={10} /> Edit Bio
                                        </button>
                                    )}
                                </div>
                                {isEditing ? (
                                    <textarea
                                        value={editForm.firm_description}
                                        onChange={e => setEditForm({ ...editForm, firm_description: e.target.value })}
                                        className="w-full text-xs font-semibold text-slate-600 leading-relaxed bg-white border border-indigo-200/50 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        rows={4}
                                        placeholder="Add mission overview..."
                                    />
                                ) : (
                                    <p className="text-xs font-semibold text-slate-600 leading-relaxed whitespace-pre-line">
                                        {profile.firm_description || "No mission description provided yet. This squad focuses on delivering pristine engineering, architectural planning, and execution sync."}
                                    </p>
                                )}
                            </div>

                            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Base Rate & Fees</h4>
                                    {isOwner && !isEditing && (
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200/50 rounded-xl text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm font-bold"
                                        >
                                            <Edit2 size={10} /> Edit Rates
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="px-4 py-3 bg-white border border-slate-100 rounded-2xl">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Hourly / Base Rate (IDR)</p>
                                        {isEditing ? (
                                            <input
                                                type="number"
                                                value={editForm.base_rate}
                                                onChange={e => setEditForm({ ...editForm, base_rate: Number(e.target.value) })}
                                                className="text-base font-black text-slate-950 mt-1 bg-slate-100 border border-indigo-200/50 rounded px-2 py-0.5 outline-none w-36"
                                            />
                                        ) : (
                                            <p className="text-base font-black text-slate-955 mt-1">
                                                {profile.stats.base_rate > 0 ? `IDR ${profile.stats.base_rate.toLocaleString('id-ID')}` : 'Flexible / Negotiation'}
                                            </p>
                                        )}
                                    </div>
                                    <div className="px-4 py-3 bg-white border border-slate-100 rounded-2xl">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Experience (Years)</p>
                                        {isEditing ? (
                                            <input
                                                type="number"
                                                value={editForm.experience_years}
                                                onChange={e => setEditForm({ ...editForm, experience_years: Number(e.target.value) })}
                                                className="text-base font-black text-slate-950 mt-1 bg-slate-100 border border-indigo-200/50 rounded px-2 py-0.5 outline-none w-20"
                                            />
                                        ) : (
                                            <p className="text-base font-black text-slate-950 mt-1">
                                                {profile.stats.experience_years} Years
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-indigo-50/30 p-6 rounded-3xl border border-indigo-100/40 space-y-4">
                                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Squad Integrity</h4>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-xs font-bold">
                                        <span className="text-slate-500">Squad Leader</span>
                                        <span className="text-slate-900">{profile.owner.name}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs font-bold">
                                        <span className="text-slate-500">Leader Unique Code</span>
                                        <span className="text-slate-900 font-mono">#{profile.owner.unique_code}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs font-bold">
                                        <span className="text-slate-500">Verification Status</span>
                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase tracking-wider">Verified</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>



            {/* Invite Specialist Modal */}
            {showSearch && (
                <FirmSearchModal
                    userRoleType={profile.owner.role_type}
                    onClose={() => setShowSearch(false)}
                    onInvited={() => { fetchProfile(); showToast('Invitation sent successfully!', 'success'); }}
                />
            )}

            {/* Quick Assign Modal */}
            {assigningMember && (
                <QuickAssignModal
                    isOpen={true}
                    member={assigningMember}
                    onClose={() => setAssigningMember(null)}
                    onSuccess={() => { fetchProfile(); }}
                />
            )}
        </div>
    );
}
