import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { useDashboardData } from '../hooks/useDashboardData';
import { DashboardSidebar } from '../components/Dashboard/DashboardSidebar';
import { DashboardHeader } from '../components/Dashboard/DashboardHeader';
import { DashboardTabs } from '../components/Dashboard/DashboardTabs';
import { VerificationAlert } from '../components/Dashboard/VerificationAlert';
import ChatOverlay from '../components/Chat/ChatOverlay';
import ProjectPreviewModal from '../components/Projects/ProjectPreviewModal';
import HouseDetailsModal from '../components/Explore/HouseDetailsModal';
import EditProjectModal from '../components/Projects/EditProjectModal';
import ConfirmDeleteModal from '../components/Projects/ConfirmDeleteModal';
import { AnimatePresence } from 'framer-motion';
import { CartProvider } from '../context/CartContext';
import axios from 'axios';

export default function Dashboard() {
    return (
        <CartProvider>
            <DashboardContent />
        </CartProvider>
    );
}

function DashboardContent() {
    const { user, isLoading: isAuthLoading } = useAuth();
    
    if (!isAuthLoading && user && user.role_type === 'admin') {
        return <Navigate to="/admin" replace />;
    }

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [activeSubTab, setActiveSubTab] = useState<string | null>(null);
    
    // Custom Hook for all data fetching and state
    const data = useDashboardData(activeTab);

    // Local Modal States
    const [selectedProject, setSelectedProject] = useState<any>(null);
    const [previewProject, setPreviewProject] = useState<any>(null);
    const [projectToEdit, setProjectToEdit] = useState<any>(null);
    const [projectToDelete, setProjectToDelete] = useState<any>(null);
    const [isDeletingProject, setIsDeletingProject] = useState(false);
    const [selectedProfessional, setSelectedProfessional] = useState<any>(null);
    const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
    const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
    const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
    const [chatUserId, setChatUserId] = useState<number | null>(null);

    // Wishlist logic for modal
    const [wishlist, setWishlist] = useState<Set<number>>(() => {
        try { return new Set(JSON.parse(localStorage.getItem('house_wishlist') || '[]')); } catch { return new Set(); }
    });

    useEffect(() => {
        localStorage.setItem('house_wishlist', JSON.stringify([...wishlist]));
    }, [wishlist]);

    const toggleWishlist = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        setWishlist(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectedHouse = useMemo(() => 
        data.houses.find(h => h.id === selectedHouseId), 
        [data.houses, selectedHouseId]
    );

    const handleDeleteProject = async () => {
        if (!projectToDelete) return;
        setIsDeletingProject(true);
        try {
            await axios.delete(`/projects/${projectToDelete.id}`);
            data.fetchData();
            setProjectToDelete(null);
        } catch (err) {
            console.error('Failed to delete project', err);
        } finally {
            setIsDeletingProject(false);
        }
    };

    useEffect(() => {
        const handleOpenHouse = (e: any) => setSelectedHouseId(e.detail);
        const handleSwitchTab = async (e: any) => {
            if (typeof e.detail === 'object') {
                handleSetActiveTab(e.detail.tab);
                if (e.detail.subTab) setActiveSubTab(e.detail.subTab);
                if (e.detail.chatUserId) setChatUserId(e.detail.chatUserId);
                
                if (e.detail.projectId) {
                    const projectId = Number(e.detail.projectId);
                    let foundProject = 
                        data.projects.find(p => p.id === projectId) || 
                        data.projectFeed.find(p => p.id === projectId) || 
                        data.myBids.find(b => b.project_id === projectId || b.project?.id === projectId)?.project;
                    
                    if (!foundProject) {
                        try {
                            const res = await axios.get(`/projects/${projectId}`);
                            foundProject = res.data.data;
                        } catch (err) {
                            console.error('Failed to fetch project for notification routing:', err);
                        }
                    }
                    
                    if (foundProject) {
                        setSelectedProject(foundProject);
                        const isOwner = user?.id === foundProject.user_id;
                        const isHiredPM = foundProject.pm_id && user?.id === foundProject.pm_id;
                        const isHiredPro = 
                            (foundProject.selected_arsitek_id && (user?.arsitek?.id === foundProject.selected_arsitek_id || foundProject.arsitek?.user_id === user?.id || foundProject.arsitek?.user?.id === user?.id)) ||
                            (foundProject.selected_kontraktor_id && (user?.kontraktor?.id === foundProject.selected_kontraktor_id || foundProject.kontraktor?.user_id === user?.id || foundProject.kontraktor?.user?.id === user?.id)) ||
                            (foundProject.selected_notaris_id && (user?.notaris_profile?.id === foundProject.selected_notaris_id || foundProject.notaris?.user_id === user?.id || foundProject.notaris?.user?.id === user?.id || foundProject.notaris_profile?.user_id === user?.id)) ||
                            (foundProject.selected_interior_id && (user?.interior_profile?.id === foundProject.selected_interior_id || foundProject.interior_profile?.user_id === user?.id || foundProject.interior?.user?.id === user?.id || foundProject.interior_profile?.user?.id === user?.id)) ||
                            (foundProject.structural_id && (user?.structural_engineer?.id === foundProject.structural_id || foundProject.structural_engineer?.user_id === user?.id || foundProject.structural_engineer?.user?.id === user?.id)) ||
                            (foundProject.mep_id && (user?.mep_engineer?.id === foundProject.mep_id || foundProject.mep_engineer?.user_id === user?.id || foundProject.mep_engineer?.user?.id === user?.id)) ||
                            (!!foundProject.sub_professionals && foundProject.sub_professionals.some((s: any) => s.user_id === user?.id && s.status === 'active'));

                        
                        const showWorkspace = isOwner || isHiredPM || isHiredPro;
                        handleSetActiveTab(showWorkspace ? 'project-detail' : 'bidding-brief');
                    }
                }
            } else {
                handleSetActiveTab(e.detail);
                setActiveSubTab(null);
            }
        };
        const handleViewProfile = (e: any) => {
            const { type, data } = e.detail;
            setSelectedProfessional(data);
            handleSetActiveTab(type === 'arsitek' ? 'architects' : type === 'kontraktor' ? 'constructors' : type);
        };
        
        window.addEventListener('openHouseDetails', handleOpenHouse);
        window.addEventListener('switchDashboardTab', handleSwitchTab);
        window.addEventListener('viewProfessionalProfile', handleViewProfile);
        
        return () => {
            window.removeEventListener('openHouseDetails', handleOpenHouse);
            window.removeEventListener('switchDashboardTab', handleSwitchTab);
            window.removeEventListener('viewProfessionalProfile', handleViewProfile);
        };
    }, [user, data.projects, data.projectFeed, data.myBids]);


    // Read URL search params on mount to support links like /dashboard?tab=houses
    useEffect(() => {
        if (isAuthLoading) return;

        const params = new URLSearchParams(window.location.search);
        const tabParam = params.get('tab');
        
        // Enforce guest access redirection for protected tabs/entries
        if (!user) {
            const publicTabs = [
                'houses', 'marketplace-materials', 'marketplace-furniture', 
                'architects', 'constructors', 'interior', 'notaris', 'project_manager'
            ];
            if (!tabParam || !publicTabs.includes(tabParam)) {
                window.location.href = '/login';
                return;
            }
        }
        
        if (tabParam) {
            handleSetActiveTab(tabParam);
        }
    }, [user, isAuthLoading]);

    const handleSetActiveTab = (tab: string) => {
        const protectedTabs = [
            'overview', 'post-project', 'post-house', 'chat', 'saved', 'material-orders', 
            'projects', 'management', 'my-bids', 'my-houses', 'profile', 'profile-edit'
        ];
        if (!user && protectedTabs.includes(tab)) {
            window.location.href = '/login';
        } else {
            setActiveTab(tab);
        }
    };

    const activeProjectsCount = data.projects.filter(p => p.status !== 'completed' && p.status !== 'cancelled').length;
    const biddingBoardCount = data.projectFeed.length;
    const proposalsCount = data.myBids.filter(b => b.status === 'pending' || b.status === 'invited').length;
    const myHousesCount = user ? data.houses.filter(h => h.user_id === user.id).length : 0;

    const navCounts = {
        projects: user?.role_type === 'user' ? activeProjectsCount : biddingBoardCount,
        management: activeProjectsCount,
        'my-bids': proposalsCount,
        'my-houses': myHousesCount,
    };

    if (isAuthLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div></div>;

    return (
        <div className="min-h-screen bg-neutral-100 flex overflow-hidden font-sans">
            <DashboardSidebar 
                sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} 
                activeTab={activeTab} setActiveTab={handleSetActiveTab} 
                counts={navCounts}
            />

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <DashboardHeader 
                    activeTab={activeTab} 
                    setActiveTab={handleSetActiveTab}
                    onMenuClick={() => setSidebarOpen(true)} 
                    counts={navCounts}
                />

                <div className={`flex-1 overflow-y-auto px-4 sm:px-8 relative ${activeTab === 'houses' ? 'py-3 sm:py-4' : 'py-4 sm:py-8'}`}>
                    <div className="max-w-7xl mx-auto">
                        {user && (
                            <VerificationAlert 
                                user={user} 
                                activeTab={activeTab} 
                                setActiveTab={handleSetActiveTab} 
                            />
                        )}
                        <DashboardTabs 
                            activeTab={activeTab} setActiveTab={handleSetActiveTab}
                            activeSubTab={activeSubTab} setActiveSubTab={setActiveSubTab}
                            user={user} houses={data.houses} projects={data.projects}
                            projectFeed={data.projectFeed} latestBids={data.latestBids}
                            myBids={data.myBids} isLoadingData={data.isLoading}
                            isProjectsLoading={data.isProjectsLoading}
                            isFeedLoading={data.isFeedLoading}
                            isBidsLoading={data.isBidsLoading}
                            isHistoryLoading={data.isHistoryLoading}
                            isHousesLoading={data.isHousesLoading}
                            isArchitectsLoading={data.isArchitectsLoading}
                            isConstructorsLoading={data.isConstructorsLoading}
                            isInteriorsLoading={data.isInteriorsLoading}
                            isNotariesLoading={data.isNotariesLoading}
                            isProjectManagersLoading={data.isProjectManagersLoading}
                            isStructuralLoading={data.isStructuralLoading}
                            isMepLoading={data.isMepLoading}
                            hiredProfessionals={data.hiredProfessionals}
                            architects={data.architects} constructors={data.constructors} interiors={data.interiors} notaries={data.notaries} projectManagers={data.projectManagers}
                            structuralEngineers={data.structuralEngineers} mepEngineers={data.mepEngineers}
                            selectedProfessional={selectedProfessional} 
                            setSelectedProfessional={setSelectedProfessional}
                            selectedProject={selectedProject} setSelectedProject={setSelectedProject}
                            selectedStoreId={selectedStoreId} setSelectedStoreId={setSelectedStoreId}
                            selectedMaterial={selectedMaterial} setSelectedMaterial={setSelectedMaterial}
                            handleOpenChat={(u: any) => {
                                setChatUserId(u.id);
                                setActiveTab('chat');
                            }}
                            handleProjectStatusChange={(id: number, s: string) => {}} // data.handleStatusChange
                            setProjectToEdit={setProjectToEdit}
                            setProjectToDelete={setProjectToDelete}
                            handleViewActiveBids={() => {}}
                            onRefresh={data.fetchData}
                            chatUserId={chatUserId}
                            onClearChatUser={() => setChatUserId(null)}
                        />
                    </div>
                </div>
            </main>

            <AnimatePresence>
                {previewProject && (
                    <ProjectPreviewModal 
                        project={previewProject}
                        isOpen={!!previewProject}
                        onClose={() => setPreviewProject(null)}
                        onManage={() => {
                            setSelectedProject(previewProject);
                            setPreviewProject(null);
                            setActiveTab('project-detail');
                        }}
                    />
                )}

                {selectedHouse && (
                    <HouseDetailsModal 
                        house={selectedHouse}
                        allHouses={data.houses}
                        wishlist={wishlist}
                        currentUser={user}
                        onClose={() => setSelectedHouseId(null)}
                        onToggleWishlist={toggleWishlist}
                        onSelectHouse={setSelectedHouseId}
                        onOpenChat={(id) => {
                            setActiveTab('chat');
                            setSelectedHouseId(null);
                        }}
                    />
                )}

                {projectToEdit && (
                    <EditProjectModal 
                        project={projectToEdit}
                        onClose={() => setProjectToEdit(null)}
                        onSuccess={(updated) => {
                            data.fetchData(); // Refresh entire dashboard data
                            setProjectToEdit(null);
                        }}
                    />
                )}

                {projectToDelete && (
                    <ConfirmDeleteModal 
                        title={projectToDelete.title}
                        description="This action cannot be undone."
                        isDeleting={isDeletingProject}
                        onConfirm={handleDeleteProject}
                        onCancel={() => setProjectToDelete(null)}
                    />
                )}
            </AnimatePresence>

            <ChatOverlay 
                activeTab={activeTab}
                onMaximize={() => handleSetActiveTab('chat')} 
            />
        </div>
    );
}
