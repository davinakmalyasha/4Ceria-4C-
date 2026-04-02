import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, User as UserIcon, LogOut, Compass, MessageSquare, Menu, FileText, CheckCircle, ChevronRight, Play, Briefcase, Users, Star, Heart, Phone, PlusCircle, Building, CheckSquare } from 'lucide-react';
import axios from 'axios';
import ExploreHouses from '../components/ExploreHouses';
import PostProjectForm from '../components/PostProjectForm';
import EditProfileForm from '../components/EditProfileForm';
import SellHouseForm from '../components/SellHouseForm';
import MyHousesContent from '../components/MyHousesContent';
import OverviewContent from '../components/OverviewContent';
import ProfessionalProfileView from '../components/ProfessionalProfileView';
import ProjectDetailModal from '../components/ProjectDetailModal';
import ProjectBoard from '../components/Projects/ProjectBoard';
import EditProjectModal from '../components/Projects/EditProjectModal';
import ConfirmDeleteModal from '../components/Projects/ConfirmDeleteModal';
import MyBidsList from '../components/Projects/MyBidsList';
import RatingModal from '../components/Projects/RatingModal';
import { Project } from '../types/project.types';
import ExploreArchitects from '../components/Architects/ExploreArchitects';
import ExploreConstructors from '../components/Constructors/ExploreConstructors';
import SavedItemsDashboard from '../components/SavedItemsDashboard';
import ChatWidget from '../components/ChatWidget';
import NotificationsDropdown from '../components/NotificationsDropdown';
import ProjectQuickSelectModal from '../components/Projects/ProjectQuickSelectModal';
import ProfessionalProfileModal from '../components/ProfessionalProfileModal';
import ProfessionalProjects from '../components/Projects/ProfessionalProjects';


interface House {
    id: number;
    name: string;
    price: number;
    description: string;
    address?: { street?: string; kelurahan?: string; kecamatan?: string; city: string; province: string; postal_code?: string; coordinates?: string; };
    dimensions?: { width: number; length: number; floors: number };
    rooms?: { bedrooms: number; bathrooms: number };
    housePic?: { dir: string }[];
}


export default function Dashboard() {
    const { user, logout, isLoading: isAuthLoading } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    
    const [houses, setHouses] = useState<House[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [myBids, setMyBids] = useState<any[]>([]);
    const [architects, setArchitects] = useState<any[]>([]);
    const [constructors, setConstructors] = useState<any[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [selectedProfessional, setSelectedProfessional] = useState<{ type: 'architect' | 'constructor', data: any } | null>(null);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [activeChat, setActiveChat] = useState<any | null>(null);

    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
    const [isDeletingProject, setIsDeletingProject] = useState(false);
    const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
    const [ratingProject, setRatingProject] = useState<Project | null>(null);
    const [profModalData, setProfModalData] = useState<{ type: 'architect' | 'constructor', data: any } | null>(null);
    const [quickSelectProjects, setQuickSelectProjects] = useState<Project[]>([]);
    const [isManagementMode, setIsManagementMode] = useState(false);

    const handleViewActiveBids = () => {
        setIsManagementMode(true);
        const projectsWithBids = projects.filter(p => 
            p.owner_id === user?.id && 
            ((p.bids_arsitek_count || 0) + (p.bids_kontraktor_count || 0)) > 0
        );

        if (projectsWithBids.length === 1) {
            setSelectedProject(projectsWithBids[0]);
        } else if (projectsWithBids.length > 1) {
            setQuickSelectProjects(projectsWithBids);
        }
    };

    const handleViewBidderProfile = (type: 'architect' | 'constructor', bidderId: number) => {
        const source = type === 'architect' ? architects : constructors;
        const prof = source.find(p => p.id === bidderId);
        if (prof) {
            setProfModalData({ type, data: prof });
        }
    };

    const handleProjectUpdated = (updated: Project) => {
        setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
    };

    const handleDeleteProjectConfirm = async () => {
        if (!projectToDelete) return;
        setIsDeletingProject(true);
        try {
            await axios.delete(`/projects/${projectToDelete.id}`);
            setProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
            setProjectToDelete(null);
        } catch (err) {
            console.error('Failed to delete project', err);
            alert('Failed to delete project. Please try again.');
        } finally {
            setIsDeletingProject(false);
        }
    };

    const handleProjectEdited = (updatedProject: Project) => {
        setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
        setProjectToEdit(null);
    };

    const handleProjectStatusChange = async (projectId: number, newStatus: string) => {
        const originalProject = projects.find(p => p.id === projectId);
        if (!originalProject || originalProject.status === newStatus) return;

        // If dropping to completed and user is the owner, show rating modal first
        if (newStatus === 'completed' && user?.role_type === 'user' && originalProject.owner_id === user?.id) {
            // Optimistic update
            setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: newStatus } : p));
            try {
                await axios.put(`/projects/${projectId}`, { status: newStatus });
                setRatingProject(originalProject);
            } catch (err: any) {
                console.error('Failed to change status', err);
                setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: originalProject.status } : p));
                alert(err.response?.data?.message || 'Failed to update project status.');
            }
            return;
        }

        // Optimistic update
        setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: newStatus } : p));

        try {
            await axios.put(`/projects/${projectId}`, { status: newStatus });
        } catch (err: any) {
            console.error('Failed to change status', err);
            // Revert on failure
            setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: originalProject.status } : p));
            if (err.response?.status === 403) {
                alert(err.response.data.message || 'Unauthorized. Only the project owner or hired professional can do this.');
            } else {
                alert('Failed to update project status. Please try again.');
            }
        }
    };

    // Backend securely handles specific filtering now
    const relevantProjects = user?.role_type === 'user' 
        ? projects.filter(p => p.owner_id === user.id)
        : projects;

    const filteredSourceProjects = projects;

    useEffect(() => {
        if (!user) return;
        
        const fetchData = async () => {
            try {
                const [houseRes, projectRes, archRes, constrRes] = await Promise.all([
                    axios.get('/houses'),
                    axios.get('/projects?all=true'), // Fetch all so assigned projects are guaranteed
                    axios.get('/arsitek'),
                    axios.get('/kontraktor')
                ]);
                setHouses(houseRes.data.data);
                setProjects(projectRes.data.data);
                setArchitects(archRes.data.data);
                setConstructors(constrRes.data.data);

                if (user.role_type === 'arsitek' || user.role_type === 'kontraktor') {
                    const bidsRes = await axios.get('/my-bids');
                    setMyBids(bidsRes.data.data || []);
                }
            } catch (err) {
                console.error('Failed to fetch dashboard data', err);
            } finally {
                setIsLoadingData(false);
            }
        };

        fetchData();
    }, [user]);

    if (!isAuthLoading && !user) return <Navigate to="/login" replace />;

    if (isAuthLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF2D20]"></div>
            </div>
        );
    }

    const navItems = (() => {
        const base = [{ id: 'overview', label: 'Overview', icon: Home }];
        
        if (user?.role_type === 'user') {
            return [
                ...base,
                { id: 'houses', label: 'Explore Houses', icon: Compass },
                { id: 'my-houses', label: 'My Properties', icon: Building },
                { id: 'projects', label: 'My Projects', icon: MessageSquare },
                { id: 'architects', label: 'Hire Architect', icon: Users },
                { id: 'constructors', label: 'Hire Constructor', icon: Briefcase },
                { id: 'saved', label: 'Saved Items', icon: Heart },
                { id: 'profile', label: 'My Profile', icon: UserIcon },
            ];
        }
        // Architect & Contractor see bidding-focused nav
        return [
            ...base,
            { id: 'projects', label: 'Bidding Board', icon: MessageSquare },
            { id: 'management', label: 'Project Management', icon: CheckSquare },
            { id: 'my-bids', label: 'My Proposals', icon: FileText },
            { id: 'profile', label: 'My Profile', icon: UserIcon },
        ];
    })();

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    return (
        <>
        <div className="min-h-screen bg-neutral-100 flex overflow-hidden font-sans">
            {sidebarOpen && (
                <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Sidebar */}
            <motion.aside 
                initial={{ x: -300 }}
                animate={{ x: sidebarOpen ? 0 : (window.innerWidth >= 768 ? 0 : -300) }}
                className={`fixed md:relative inset-y-0 left-0 w-52 bg-white shadow-xl shadow-black/5 z-50 transform transition-transform duration-300 flex flex-col`}
            >


                <div className="p-4 flex items-center gap-3 border-b border-gray-100">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold">
                        {user?.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-[13px] font-semibold text-gray-900 leading-tight">{user?.name}</p>
                        <p className="text-[11px] text-gray-500 capitalize">{user?.role_type}</p>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <button 
                                key={item.id}
                                onClick={() => { 
                                    setActiveTab(item.id); 
                                    setSelectedProfessional(null); 
                                    setIsEditingProfile(false); 
                                    setSidebarOpen(false); 
                                    // Set management mode true for management-focused tabs
                                    setIsManagementMode(
                                        item.id === 'management' || 
                                        (user?.role_type === 'user' && item.id === 'projects')
                                    );
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors ${isActive ? 'bg-red-50 text-[#FF2D20]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                            >
                                <Icon className="w-5 h-5" />
                                {item.label}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-gray-100">
                    <button onClick={logout} className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-[13.5px] text-gray-600 hover:bg-red-50 hover:text-red-600 font-medium transition-colors">
                        <LogOut className="w-5 h-5" />
                        Sign Out
                    </button>
                </div>
            </motion.aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <header className="h-14 bg-white/80 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-6 z-30 shrink-0">
                    <button className="p-2 -ml-2 rounded-lg text-gray-600 hover:bg-gray-100 md:hidden" onClick={() => setSidebarOpen(true)}>
                        <Menu className="w-6 h-6" />
                    </button>
                    <div className="hidden md:block text-sm font-semibold text-gray-500 capitalize">{activeTab.replace('-', ' ')}</div>
                    <div className="flex items-center gap-2">
                        <NotificationsDropdown />
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-4 sm:p-8 scrollbar-thin">
                    <div className="max-w-7xl mx-auto">
                        <AnimatePresence mode="wait">
                            {/* OVERVIEW TAB */}
                            {activeTab === 'overview' && (
                                <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full">
                                    <OverviewContent 
                                        user={user} 
                                        houses={houses} 
                                        relevantProjects={filteredSourceProjects} 
                                        isLoadingData={isLoadingData} 
                                        setActiveTab={setActiveTab} 
                                        formatCurrency={formatCurrency} 
                                        onViewActiveBids={handleViewActiveBids}
                                        onEditProfile={() => setIsEditingProfile(true)}
                                    />
                                </motion.div>
                            )}

                            {/* HOUSES TAB */}
                            {activeTab === 'houses' && (
                                <motion.div key="houses" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full">
                                    <ExploreHouses houses={houses} isLoading={isLoadingData} onSelectHouse={(id) => {
                                        const h = houses.find(x => x.id === id);
                                        // Usually ExploreHouses has its own modal, it passes internal ID
                                    }} />
                                </motion.div>
                            )}

                            {/* SAVED ITEMS TAB */}
                            {activeTab === 'saved' && (
                                <motion.div key="saved" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full">
                                    <SavedItemsDashboard 
                                        houses={houses} 
                                        architects={architects as any} 
                                        constructors={constructors as any} 
                                        onSelectHouse={() => setActiveTab('houses')}
                                        onSelectArchitect={(a) => { setActiveTab('architects'); setSelectedProfessional({ type: 'architect', data: a }); }}
                                        onSelectConstructor={(c) => { setActiveTab('constructors'); setSelectedProfessional({ type: 'constructor', data: c }); }}
                                    />
                                </motion.div>
                            )}

                            {/* PROJECTS TAB (Bidding Board for Pros) */}
                            {activeTab === 'projects' && (
                                <motion.div key="projects" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6 flex flex-col w-full">
                                    <ProjectBoard 
                                        projects={(user?.role_type === 'user' 
                                            ? filteredSourceProjects 
                                            : projects.filter(p => p.status === 'open')
                                        ) as any} 
                                        isLoading={isLoadingData} 
                                        userRole={user?.role_type}
                                        onPostProject={() => setActiveTab('post-project')}
                                        onViewProject={setSelectedProject}
                                        onEditProject={setProjectToEdit}
                                        onDeleteProject={setProjectToDelete}
                                        onStatusChange={handleProjectStatusChange}
                                        myBidsCount={myBids.length}
                                        onViewMyBids={() => {
                                            setActiveTab('my-bids');
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                    />

                                    {/* Action Modals moved to global scope */}
                                </motion.div>
                            )}

                            {/* MY BIDS TAB (Professionals Only) */}
                            {activeTab === 'my-bids' && (
                                <motion.div key="my-bids" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                                    <div className="flex flex-col gap-2 mb-6">
                                        <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                            <FileText className="w-6 h-6 text-[#FF2D20]" /> My Proposals Pipeline
                                        </h3>
                                        <p className="text-gray-500 text-sm">Track the status of all your submitted project bids and connect with homeowners.</p>
                                    </div>
                                    <MyBidsList 
                                        bids={myBids} 
                                        isLoading={isLoadingData} 
                                        onViewProject={(id) => {
                                            const proj = projects.find(p => p.id === id);
                                            if (proj) setSelectedProject(proj);
                                        }}
                                    />
                                </motion.div>
                            )}

                            {/* POST PROJECT TAB */}
                            {activeTab === 'post-project' && (
                                <motion.div key="post-project" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full">
                                    <PostProjectForm onCancel={() => setActiveTab('overview')} onSuccess={() => setActiveTab('projects')} />
                                </motion.div>
                            )}

                            {/* MY PROPERTIES TAB */}
                            {activeTab === 'my-houses' && (
                                <motion.div key="my-houses" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full">
                                    <MyHousesContent 
                                        houses={houses.filter((h: any) => h.user_id === user?.id)} 
                                        onAddProperty={() => setActiveTab('post-house')} 
                                        onBack={() => setActiveTab('overview')}
                                    />
                                </motion.div>
                            )}

                            {/* SELL HOUSE TAB */}
                            {activeTab === 'post-house' && (
                                <motion.div key="post-house" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full">
                                    <SellHouseForm onCancel={() => setActiveTab('my-houses')} onSuccess={() => {
                                        setActiveTab('my-houses');
                                        axios.get('/houses').then(res => setHouses(res.data.data));
                                    }} />
                                </motion.div>
                            )}

                            {/* ARCHITECTS TAB */}
                            {activeTab === 'architects' && (
                                <motion.div key="architects" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full">
                                    {selectedProfessional?.type === 'architect' ? (
                                        <ProfessionalProfileView 
                                            type="architect" 
                                            data={selectedProfessional.data}
                                            projects={relevantProjects}
                                            onClose={() => setSelectedProfessional(null)} 
                                            onOpenChat={(prof) => setActiveChat(prof)}
                                        />
                                    ) : (
                                        <ExploreArchitects 
                                            architects={architects as any} 
                                            isLoading={isLoadingData} 
                                            onSelectArchitect={(arch) => setSelectedProfessional({ type: 'architect', data: arch })} 
                                        />
                                    )}
                                </motion.div>
                            )}


                            {/* CONSTRUCTORS TAB */}
                            {activeTab === 'constructors' && (
                                <motion.div key="constructors" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full">
                                    {selectedProfessional?.type === 'constructor' ? (
                                        <ProfessionalProfileView 
                                            type="constructor" 
                                            data={selectedProfessional.data}
                                            projects={relevantProjects}
                                            onClose={() => setSelectedProfessional(null)} 
                                            onOpenChat={(prof) => setActiveChat(prof)}
                                        />
                                    ) : (
                                        <ExploreConstructors 
                                            constructors={constructors as any} 
                                            isLoading={isLoadingData} 
                                            onSelectConstructor={(cons) => setSelectedProfessional({ type: 'constructor', data: cons })} 
                                        />
                                    )}
                                </motion.div>
                            )}

                            {/* PROFESSIONAL PROJECT MANAGEMENT TAB */}
                            {activeTab === 'management' && (
                                <motion.div key="management" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full">
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col gap-2">
                                                <h3 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                                                    <span className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center text-lg shadow-sm border-red-100">🏗️</span> 
                                                    Active Managed Projects
                                                </h3>
                                                <p className="text-gray-500 text-sm">Manage your accepted projects, coordinate with clients, and track milestones.</p>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    setIsLoadingData(true);
                                                    axios.get('/projects?all=true').then(res => {
                                                        setProjects(res.data.data);
                                                        setIsLoadingData(false);
                                                    });
                                                }}
                                                className="ml-auto p-3 bg-white border border-gray-200 text-gray-500 hover:text-red-600 rounded-xl hover:shadow-md transition-all active:scale-95"
                                                title="Refresh Projects"
                                            >
                                                <svg className={`w-5 h-5 ${isLoadingData ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                            </button>
                                        </div>
                                    <ProfessionalProjects 
                                        projects={projects.filter(p => {
                                            const profId = user?.role_type === 'arsitek' ? user?.arsitek?.id : user?.kontraktor?.id;
                                            
                                            // 1. Direct ID match
                                            const isDirectMatch = (user?.role_type === 'arsitek' && String(p.selected_architect_id) === String(profId)) ||
                                                          (user?.role_type === 'kontraktor' && String(p.selected_contractor_id) === String(profId));
                                            
                                            // 2. Status match (if I'm the one who it says is accepted)
                                            const isAcceptedStatus = (user?.role_type === 'arsitek' && p.status === 'accepted_arsitek') ||
                                                                   (user?.role_type === 'kontraktor' && p.status === 'accepted_kontraktor') ||
                                                                   (p.status === 'in_progress');
                                            
                                            // Log for debugging
                                            if (p.status !== 'open') {
                                                console.log(`Checking project ${p.id}: isDirectMatch=${isDirectMatch}, isAcceptedStatus=${isAcceptedStatus}`);
                                            }
                                            
                                            return isDirectMatch || (isAcceptedStatus && isDirectMatch); // Keep it grounded to match for now, but ensure in_progress shows if ID matches
                                        })}
                                        isLoading={isLoadingData}
                                        onViewProject={(p) => setSelectedProject(p)}
                                        formatCurrency={formatCurrency}
                                    />
                                </motion.div>
                            )}

                            {/* PROFILE TAB */}
                            {activeTab === 'profile' && (
                                <motion.div key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                                    <h3 className="text-2xl font-bold text-gray-900">My Profile</h3>
                                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 max-w-3xl">
                                        <div className="flex items-center gap-6">
                                            <div className="w-24 h-24 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-extrabold text-4xl">
                                                {user?.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <h4 className="text-2xl font-bold text-gray-900">{user?.name}</h4>
                                                <p className="text-gray-500">{user?.email}</p>
                                            </div>
                                        </div>
                                        <hr className="my-8 border-gray-100" />
                                        
                                        {isEditingProfile ? (
                                            <EditProfileForm onCancel={() => setIsEditingProfile(false)} />
                                        ) : (
                                            <div className="space-y-6">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Username</label>
                                                        <div className="text-gray-900 font-semibold text-lg">{user?.username}</div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Email Address</label>
                                                        <div className="text-gray-900 font-semibold text-lg">{user?.email}</div>
                                                    </div>
                                                </div>

                                                {/* Role Specific Read-Only Data */}
                                                {user?.role_type === 'arsitek' && (
                                                    <div className="space-y-4 pt-4 border-t border-gray-100">
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                            <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Rate (Hourly)</label><div className="text-gray-900 font-semibold text-lg">{user?.arsitek?.rate_harga ? `Rp ${user.arsitek.rate_harga}` : '-'}</div></div>
                                                            <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Experience</label><div className="text-gray-900 font-semibold text-lg">{user?.arsitek?.pengalaman_tahun ? `${user.arsitek.pengalaman_tahun} Years` : '-'}</div></div>
                                                            <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Location</label><div className="text-gray-900 font-semibold text-lg">{user?.arsitek?.lokasi || '-'}</div></div>
                                                        </div>
                                                        {user?.arsitek?.pendidikan && (
                                                            <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Study Experience</label><div className="text-gray-900 text-sm bg-gray-50 p-3 rounded-xl border border-gray-100">{user.arsitek.pendidikan}</div></div>
                                                        )}
                                                        {user?.arsitek?.alasan_hire && (
                                                            <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Why Hire Me</label><div className="text-gray-900 text-sm bg-gray-50 p-3 rounded-xl border border-gray-100 italic">"{user.arsitek.alasan_hire}"</div></div>
                                                        )}
                                                    </div>
                                                )}

                                                {user?.role_type === 'kontraktor' && (
                                                    <div className="space-y-4 pt-4 border-t border-gray-100">
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                            <div className="col-span-1 md:col-span-2"><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Company</label><div className="text-gray-900 font-semibold text-lg">{user?.kontraktor?.nama_perusahaan || '-'}</div></div>
                                                            <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Est. Rate</label><div className="text-gray-900 font-semibold text-lg">{user?.kontraktor?.rate_harga ? `Rp ${user.kontraktor.rate_harga}` : '-'}</div></div>
                                                        </div>
                                                        {user?.kontraktor?.pendidikan && (
                                                            <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Company Background</label><div className="text-gray-900 text-sm bg-gray-50 p-3 rounded-xl border border-gray-100">{user.kontraktor.pendidikan}</div></div>
                                                        )}
                                                        {user?.kontraktor?.alasan_hire && (
                                                            <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Value Prop</label><div className="text-gray-900 text-sm bg-gray-50 p-3 rounded-xl border border-gray-100 italic">"{user.kontraktor.alasan_hire}"</div></div>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="pt-4 border-t border-gray-100">
                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Verified Phone Numbers</label>
                                                    <div className="space-y-2">
                                                        {user?.phone_number && user.phone_number.length > 0 ? (
                                                            user.phone_number.map((phone) => (
                                                                <div key={phone.id} className="flex items-center gap-3 bg-gray-50 border border-gray-100 p-3 rounded-xl">
                                                                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-[#FF2D20] shadow-sm">
                                                                        <Phone size={14} />
                                                                    </div>
                                                                    <span className="font-bold text-gray-700">{phone.contact}</span>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <p className="text-sm text-gray-400 italic">No phone numbers added.</p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="pt-4 border-t border-gray-100">
                                                    <button onClick={() => setIsEditingProfile(true)} className="px-6 py-2 bg-[#FF2D20]/5 text-[#FF2D20] font-bold rounded-xl hover:bg-[#FF2D20]/10 transition-colors">
                                                        Edit Profile Details
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
            </div>
        </div>
    </main>
</div>

{/* Global Project Modals */}
<AnimatePresence>
    {selectedProject && (
        <ProjectDetailModal 
            project={selectedProject as any}
            onClose={() => setSelectedProject(null)}
            formatCurrency={formatCurrency}
            onViewProfile={handleViewBidderProfile}
            onProjectUpdated={handleProjectUpdated}
            isManagementView={isManagementMode}
            onNavigate={(tab) => setActiveTab(tab)}
        />
    )}
    {projectToEdit && (
        <EditProjectModal 
            project={projectToEdit}
            onClose={() => setProjectToEdit(null)}
            onSuccess={handleProjectEdited}
        />
    )}
    {projectToDelete && (
        <ConfirmDeleteModal 
            title={projectToDelete.title}
            description="This action cannot be undone and will remove all associated bids."
            isDeleting={isDeletingProject}
            onConfirm={handleDeleteProjectConfirm}
            onCancel={() => setProjectToDelete(null)}
        />
    )}
</AnimatePresence>

{/* Global Chat Widget */}
<AnimatePresence>
    {activeChat && <ChatWidget professional={activeChat} onClose={() => setActiveChat(null)} />}
</AnimatePresence>

{/* Rating Modal - shown when dropping project to Completed */}
<AnimatePresence>
    {ratingProject && (
        <RatingModal
            projectId={ratingProject.id}
            projectTitle={ratingProject.title}
            hasArsitek={!!ratingProject.selected_architect_id}
            hasKontraktor={!!ratingProject.selected_contractor_id}
            onClose={() => setRatingProject(null)}
            onRated={() => setRatingProject(null)}
        />
    )}
    {quickSelectProjects.length > 0 && (
        <ProjectQuickSelectModal
            projects={quickSelectProjects}
            onSelect={setSelectedProject}
            onClose={() => setQuickSelectProjects([])}
            formatCurrency={formatCurrency}
        />
    )}
    {profModalData && (
        <ProfessionalProfileModal
            type={profModalData.type}
            data={profModalData.data}
            projects={relevantProjects}
            onClose={() => setProfModalData(null)}
            onOpenChat={(prof) => {
                setProfModalData(null);
                setActiveChat(prof);
            }}
        />
    )}
</AnimatePresence>
</>
    );
}
