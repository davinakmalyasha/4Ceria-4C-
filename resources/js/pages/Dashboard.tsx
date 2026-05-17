import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { useDashboardData } from '../hooks/useDashboardData';
import { DashboardSidebar } from '../components/Dashboard/DashboardSidebar';
import { DashboardHeader } from '../components/Dashboard/DashboardHeader';
import { DashboardTabs } from '../components/Dashboard/DashboardTabs';
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
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [activeSubTab, setActiveSubTab] = useState<string | null>(null);
    
    // Custom Hook for all data fetching and state
    const data = useDashboardData();

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
    const [isEditingProfile, setIsEditingProfile] = useState(false);
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
        const handleSwitchTab = (e: any) => {
            if (typeof e.detail === 'object') {
                setActiveTab(e.detail.tab);
                if (e.detail.subTab) setActiveSubTab(e.detail.subTab);
            } else {
                setActiveTab(e.detail);
                setActiveSubTab(null);
            }
        };
        
        window.addEventListener('openHouseDetails', handleOpenHouse);
        window.addEventListener('switchDashboardTab', handleSwitchTab);
        
        return () => {
            window.removeEventListener('openHouseDetails', handleOpenHouse);
            window.removeEventListener('switchDashboardTab', handleSwitchTab);
        };
    }, []);


    if (isAuthLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div></div>;
    if (!user) return <Navigate to="/login" replace />;

    return (
        <div className="min-h-screen bg-neutral-100 flex overflow-hidden font-sans">
            <DashboardSidebar 
                sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} 
                activeTab={activeTab} setActiveTab={setActiveTab} 
            />

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <DashboardHeader activeTab={activeTab} onMenuClick={() => setSidebarOpen(true)} />

                <div className="flex-1 overflow-y-auto p-4 sm:p-8 relative z-0">
                    <div className="max-w-7xl mx-auto">
                        <DashboardTabs 
                            activeTab={activeTab} setActiveTab={setActiveTab}
                            activeSubTab={activeSubTab} setActiveSubTab={setActiveSubTab}
                            user={user} houses={data.houses} projects={data.projects}
                            projectFeed={data.projectFeed} latestBids={data.latestBids}
                            myBids={data.myBids} isLoadingData={data.isLoading}
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
                            setIsEditingProfile={setIsEditingProfile}
                            isEditingProfile={isEditingProfile}
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
        </div>
    );
}
