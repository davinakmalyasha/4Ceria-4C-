import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { useDashboardData } from '../hooks/useDashboardData';
import { DashboardSidebar } from '../components/Dashboard/DashboardSidebar';
import { DashboardHeader } from '../components/Dashboard/DashboardHeader';
import { DashboardTabs } from '../components/Dashboard/DashboardTabs';
import { ProjectDetailModal } from '../components/ProjectDetailModal';
import { CartProvider } from '../context/CartContext';

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
    
    // Custom Hook for all data fetching and state
    const data = useDashboardData();

    // Local Modal States
    const [selectedProject, setSelectedProject] = useState<any>(null);
    const [selectedProfessional, setSelectedProfessional] = useState<any>(null);
    const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
    const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
    const [isEditingProfile, setIsEditingProfile] = useState(false);


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
                            user={user} houses={data.houses} projects={data.projects}
                            projectFeed={data.projectFeed} latestBids={data.latestBids}
                            myBids={data.myBids} isLoadingData={data.isLoading}
                            architects={data.architects} constructors={data.constructors}
                            selectedProfessional={selectedProfessional} 
                            setSelectedProfessional={setSelectedProfessional}
                            selectedProject={selectedProject} setSelectedProject={setSelectedProject}
                            selectedStoreId={selectedStoreId} setSelectedStoreId={setSelectedStoreId}
                            selectedMaterial={selectedMaterial} setSelectedMaterial={setSelectedMaterial}
                            handleOpenChat={(p: any) => {}} // Hook context or event
                            handleProjectStatusChange={(id: number, s: string) => {}} // data.handleStatusChange
                            setProjectToEdit={() => {}}
                            setProjectToDelete={() => {}}
                            handleViewActiveBids={() => {}}
                            setIsEditingProfile={setIsEditingProfile}
                            onRefresh={data.fetchData}
                        />
                    </div>
                </div>
            </main>

            {selectedProject && (
                <ProjectDetailModal 
                    project={selectedProject} 
                    onClose={() => setSelectedProject(null)} 
                    formatCurrency={(a) => `Rp ${a}`}
                    onViewProfile={() => {}}
                />
            )}
        </div>
    );
}
