import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, User as UserIcon, LogOut, Compass, MessageSquare, Menu, FileText, CheckCircle, ChevronRight, Play, Briefcase, Users, Star, Heart } from 'lucide-react';
import axios from 'axios';
import ExploreHouses from '../components/ExploreHouses';
import PostProjectForm from '../components/PostProjectForm';
import EditProfileForm from '../components/EditProfileForm';
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

    const relevantProjects = user?.role_type === 'user' 
        ? projects.filter(p => p.owner_id === user.id)
        : projects;

    useEffect(() => {
        if (!user) return;
        
        const fetchData = async () => {
            try {
                const [houseRes, projectRes, archRes, constrRes] = await Promise.all([
                    axios.get('/houses'),
                    axios.get('/projects'),
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
            { id: 'my-bids', label: 'My Proposals', icon: FileText },
            { id: 'houses', label: 'Explore Houses', icon: Compass },
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
                                onClick={() => { setActiveTab(item.id); setSelectedProfessional(null); setIsEditingProfile(false); setSidebarOpen(false); }}
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
                                <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
                                    <div>
                                        <h3 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name.split(' ')[0]}! 👋</h3>
                                        <p className="mt-1 text-gray-500">Here's what's happening in the 4C marketplace today.</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between h-40">
                                            <p className="text-gray-500 font-medium">
                                                {user?.role_type === 'user' ? 'My Posted Projects' : 'Open Bidding Tenders'}
                                            </p>
                                            <h4 className="text-4xl font-extrabold text-[#FF2D20]">{relevantProjects.length > 0 ? relevantProjects.length : '0'}</h4>
                                        </div>
                                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between h-40">
                                            <p className="text-gray-500 font-medium">Available Houses</p>
                                            <h4 className="text-4xl font-extrabold text-gray-900">{houses.length > 0 ? houses.length : '0'}</h4>
                                        </div>
                                        {user?.role_type === 'user' ? (
                                            <div className="bg-gradient-to-br from-red-600 to-[#FF2D20] p-6 rounded-2xl shadow-lg shadow-red-500/30 flex flex-col justify-between h-40 text-white">
                                                <p className="font-medium opacity-90">Post a new project</p>
                                                <div className="mt-4">
                                                    <button onClick={() => setActiveTab('post-project')} className="bg-white text-red-600 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors w-fit">
                                                        Upload Spec
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-2xl shadow-lg shadow-blue-500/30 flex flex-col justify-between h-40 text-white">
                                                <p className="font-medium opacity-90">Track your proposals</p>
                                                <div className="mt-4">
                                                    <button onClick={() => setActiveTab('my-bids')} className="bg-white text-blue-600 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors w-fit shadow-sm">
                                                        View Pending Bids
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        {/* Quick Houses List */}
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-lg font-bold text-gray-900">Recently Listed Houses</h3>
                                                <button onClick={() => setActiveTab('houses')} className="text-sm font-medium text-red-600 hover:text-red-700">View all</button>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {isLoadingData ? <p>Loading...</p> : houses.slice(0, 2).map((h) => (
                                                    <div key={h.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 p-4 pb-5">
                                                        <h4 className="font-bold text-gray-900 truncate">{h.name}</h4>
                                                        <p className="text-sm text-gray-500 truncate mt-1">{h.address?.city}</p>
                                                        <div className="mt-3"><span className="text-lg font-extrabold text-[#FF2D20]">{formatCurrency(h.price)}</span></div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        {/* Quick Projects List */}
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-lg font-bold text-gray-900">
                                                    {user?.role_type === 'user' ? 'My Recent Projects' : 'Active Tenders'}
                                                </h3>
                                                <button onClick={() => setActiveTab('projects')} className="text-sm font-medium text-red-600 hover:text-red-700">Explore board</button>
                                            </div>
                                            <div className="space-y-3">
                                                {isLoadingData ? <p>Loading...</p> : relevantProjects.slice(0, 2).map((p) => (
                                                    <div key={p.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                                        <div className="flex justify-between"><h4 className="font-bold truncate">{p.title}</h4> <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">{p.status}</span></div>
                                                        <div className="mt-2 text-sm text-gray-500 truncate">Budget: {formatCurrency(p.budget)}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
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

                            {/* PROJECTS TAB */}
                            {activeTab === 'projects' && (
                                <motion.div key="projects" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6 flex flex-col w-full">
                                    <ProjectBoard 
                                        projects={relevantProjects as any} 
                                        isLoading={isLoadingData} 
                                        userRole={user?.role_type}
                                        onPostProject={() => setActiveTab('post-project')}
                                        onViewProject={setSelectedProject}
                                        onEditProject={setProjectToEdit}
                                        onDeleteProject={setProjectToDelete}
                                        onStatusChange={handleProjectStatusChange}
                                    />

                                    {/* Action Modals */}
                                    <AnimatePresence>
                                        {selectedProject && (
                                            <ProjectDetailModal 
                                                project={selectedProject as any}
                                                onClose={() => setSelectedProject(null)}
                                                formatCurrency={formatCurrency}
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
                                                <span className="inline-block mt-2 px-3 py-1 bg-red-50 text-[#FF2D20] text-sm font-semibold rounded-lg capitalize">
                                                    Account Type: {user?.role_type}
                                                </span>
                                            </div>
                                        </div>
                                        <hr className="my-8 border-gray-100" />
                                        
                                        {isEditingProfile ? (
                                            <EditProfileForm onCancel={() => setIsEditingProfile(false)} />
                                        ) : (
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700">Username</label>
                                                    <div className="mt-1 p-3 bg-gray-50 rounded-lg text-gray-900">{user?.username}</div>
                                                </div>
                                                <button onClick={() => setIsEditingProfile(true)} className="text-[#FF2D20] font-semibold hover:underline">Edit Profile Details &rarr;</button>
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
        </AnimatePresence>
        </>
    );
}
