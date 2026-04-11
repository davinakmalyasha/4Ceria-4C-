import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText } from 'lucide-react';
import OverviewContent from '../OverviewContent';
import ExploreHouses from '../ExploreHouses';
import SavedItemsDashboard from '../SavedItemsDashboard';
import ProjectBoard from '../Projects/ProjectBoard';
import ProjectDetailPage from '../Projects/ProjectDetailPage';
import MyBidsList from '../Projects/MyBidsList';
import ProjectWizard from '../Wizard/ProjectWizard';
import MyHousesContent from '../MyHousesContent';
import SellHouseForm from '../SellHouseForm';
import MarketplaceTab from '../Marketplace/MarketplaceTab';
import StoreDetailView from '../Marketplace/StoreDetailView';
import QuoteHistoryTab from '../Marketplace/QuoteHistoryTab';
import DeliveryJobsTab from '../Marketplace/DeliveryJobsTab';
import JobRadarTab from '../Logistics/JobRadarTab';
import MyDeliveriesTab from '../Logistics/MyDeliveriesTab';
import MaterialOrdersTab from '../Marketplace/MaterialOrdersTab';
import LogisticsOverview from '../Logistics/LogisticsOverview';
import ProfessionalProfileView from '../ProfessionalProfileView';
import ExploreArchitects from '../Architects/ExploreArchitects';
import ExploreConstructors from '../Constructors/ExploreConstructors';
import ProfessionalProjects from '../Projects/ProfessionalProjects';
import ChatTab from '../Chat/ChatTab';
import MerchantInventory from '../MerchantInventory';
import MaterialDetailsModal from '../Marketplace/MaterialDetailsModal';
import { UserProfileView } from './UserProfileView';
import EditProfileForm from '../EditProfileForm';
import ExploreTab from './ExploreTab';

import { Project } from '../../types/project.types';
import { House } from '../../types/explore';

interface TabsProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    user: any;
    houses: House[];
    projects: Project[];
    projectFeed: Project[];
    latestBids: any[];
    myBids: any[];
    isLoadingData: boolean;
    architects: any[];
    constructors: any[];
    selectedProfessional: any;
    setSelectedProfessional: (p: any) => void;
    selectedProject: any;
    setSelectedProject: (p: any) => void;
    selectedStoreId: number | null;
    setSelectedStoreId: (id: number | null) => void;
    selectedMaterial: any;
    setSelectedMaterial: (m: any) => void;
    handleOpenChat: (professional: any) => void;
    handleProjectStatusChange: (id: number, status: string) => void;
    setProjectToEdit: (p: any) => void;
    setProjectToDelete: (p: any) => void;
    handleViewActiveBids: () => void;
    setIsEditingProfile: (v: boolean) => void;
    isEditingProfile: boolean;
    onRefresh?: () => void;
}

export const DashboardTabs: React.FC<TabsProps> = (props) => {
    const { activeTab, setActiveTab, user, houses, projects, projectFeed, latestBids, myBids, 
        isLoadingData, architects, constructors, selectedProfessional, setSelectedProfessional, 
        selectedProject, setSelectedProject, selectedStoreId, setSelectedStoreId, 
        selectedMaterial, setSelectedMaterial, handleOpenChat, handleProjectStatusChange,
        setProjectToEdit, setProjectToDelete, handleViewActiveBids, setIsEditingProfile, 
        isEditingProfile, onRefresh } = props;

    const formatCurrency = (amount: number) => 
        new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

    const handleViewProject = (project: any) => {
        setSelectedProject(project);
        setActiveTab('project-detail');
    };

    return (
        <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full">
                
                {activeTab === 'overview' && (
                    user?.role_type === 'logistics' ? (
                        <LogisticsOverview user={user} setActiveTab={setActiveTab} />
                    ) : (
                        <OverviewContent 
                            user={user} houses={houses} relevantProjects={projects} 
                            projectFeed={projectFeed} latestBids={latestBids} isLoadingData={isLoadingData} 
                            setActiveTab={setActiveTab} formatCurrency={formatCurrency} 
                            onViewActiveBids={handleViewActiveBids} onEditProfile={() => setActiveTab('profile')}
                            openTendersCount={projectFeed.length} myBidsCount={myBids.length}
                            myProjectsCount={projects.length}
                            onPostProject={() => setActiveTab('post-project')}
                            onViewProject={handleViewProject}
                        />
                    )
                )}

                {activeTab === 'explore' && (
                    <ExploreTab 
                        houses={houses} 
                        isLoadingData={isLoadingData} 
                        architects={architects} 
                        constructors={constructors}
                        selectedProfessional={selectedProfessional} 
                        setSelectedProfessional={setSelectedProfessional}
                        selectedStoreId={selectedStoreId} 
                        setSelectedStoreId={setSelectedStoreId}
                        selectedMaterial={selectedMaterial} 
                        setSelectedMaterial={setSelectedMaterial}
                        handleOpenChat={handleOpenChat}
                        setActiveTab={setActiveTab}
                    />
                )}

                {activeTab === 'project-detail' && selectedProject && (
                    <ProjectDetailPage 
                        project={selectedProject} user={user}
                        onBack={() => { setSelectedProject(null); setActiveTab('projects'); }}
                        onRefresh={() => onRefresh?.()}
                    />
                )}

                {activeTab === 'projects' && (
                    <ProjectBoard 
                        projects={(user?.role_type === 'user' ? projects : projectFeed) as any} 
                        isLoading={isLoadingData} userRole={user?.role_type}
                        onPostProject={() => setActiveTab('post-project')}
                        onViewProject={handleViewProject} onEditProject={setProjectToEdit}
                        onDeleteProject={setProjectToDelete} onStatusChange={handleProjectStatusChange}
                        myBidsCount={myBids.length} onViewMyBids={() => setActiveTab('my-bids')}
                    />
                )}

                {activeTab === 'my-bids' && (
                    <div className="space-y-6">
                        <div className="flex flex-col gap-2 mb-6">
                            <h3 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                                <span className="w-10 h-10 rounded-xl bg-zinc-100 text-zinc-500 flex items-center justify-center shadow-sm border border-zinc-200">
                                    <FileText size={20} />
                                </span>
                                My Proposals Pipeline
                            </h3>
                            <p className="text-gray-500 text-sm">Track the status of all your submitted project bids.</p>
                        </div>
                        <MyBidsList bids={myBids} isLoading={isLoadingData} onViewProject={(id) => handleViewProject(projects.find(p => p.id === id))} />
                    </div>
                )}

                {activeTab === 'post-project' && (
                    <ProjectWizard
                        onCancel={() => setActiveTab('overview')} 
                        onSuccess={() => { onRefresh?.(); setActiveTab('projects'); }} 
                    />
                )}

                {activeTab === 'houses' && (
                    <ExploreHouses houses={houses} isLoading={isLoadingData} 
                        onSelectHouse={(id) => { const h = houses.find(x => x.id === id); if (h) window.dispatchEvent(new CustomEvent('openHouseDetails', { detail: h.id })); }} 
                    />
                )}

                {activeTab === 'my-houses' && (
                    <MyHousesContent houses={houses.filter((h: any) => h.user_id === user?.id)} 
                        onAddProperty={() => setActiveTab('post-house')} onBack={() => setActiveTab('overview')}
                        onHouseDeleted={() => {}} onHouseUpdated={() => {}} />
                )}
                {activeTab === 'post-house' && <SellHouseForm onCancel={() => setActiveTab('my-houses')} onSuccess={() => setActiveTab('my-houses')} />}

                {activeTab === 'saved' && (
                    <SavedItemsDashboard houses={houses} architects={architects} constructors={constructors} 
                        onSelectHouse={() => setActiveTab('houses')}
                        onSelectArchitect={(a) => { setActiveTab('architects'); setSelectedProfessional({ type: 'architect', data: a }); }}
                        onSelectConstructor={(c) => { setActiveTab('constructors'); setSelectedProfessional({ type: 'constructor', data: c }); }} />
                )}

                {activeTab === 'marketplace' && (
                    <>
                        {selectedStoreId ? (
                            <StoreDetailView storeId={selectedStoreId} onBack={() => setSelectedStoreId(null)} onOpenChat={handleOpenChat} onOpenDetails={setSelectedMaterial} />
                        ) : (
                            <MarketplaceTab onOpenChat={handleOpenChat} onOpenDetails={setSelectedMaterial} onOpenCart={() => {}} onOpenStore={setSelectedStoreId} />
                        )}
                        <AnimatePresence>{selectedMaterial && <MaterialDetailsModal material={selectedMaterial} onClose={() => setSelectedMaterial(null)} onOpenChat={handleOpenChat} />}</AnimatePresence>
                    </>
                )}

                {activeTab === 'profile' && (
                    isEditingProfile ? (
                        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-4xl">
                            <h3 className="text-2xl font-black text-gray-900 mb-8">Edit Profile</h3>
                            <EditProfileForm onCancel={() => setIsEditingProfile(false)} />
                        </div>
                    ) : <UserProfileView user={user} setIsEditingProfile={setIsEditingProfile} />
                )}

                {activeTab === 'material-orders' && <MaterialOrdersTab />}
                {activeTab === 'orders' && <MaterialOrdersTab />}
                {activeTab === 'quotes' && <QuoteHistoryTab user={user} />}

                {activeTab === 'architects' && (
                    selectedProfessional ? (
                        <ProfessionalProfileView type="architect" data={selectedProfessional} projects={projects} onClose={() => setSelectedProfessional(null)} onOpenChat={handleOpenChat} />
                    ) : <ExploreArchitects architects={architects} isLoading={isLoadingData} onSelectArchitect={setSelectedProfessional} />
                )}

                {activeTab === 'constructors' && (
                    selectedProfessional ? (
                        <ProfessionalProfileView type="constructor" data={selectedProfessional} projects={projects} onClose={() => setSelectedProfessional(null)} onOpenChat={handleOpenChat} />
                    ) : <ExploreConstructors constructors={constructors} isLoading={isLoadingData} onSelectConstructor={setSelectedProfessional} />
                )}

                {activeTab === 'chat' && <ChatTab initialUserId={null} onClearInitialUser={() => {}} />}

                {activeTab === 'management' && (
                    <ProfessionalProjects projects={projects} isLoading={isLoadingData} onViewProject={handleViewProject} formatCurrency={formatCurrency} />
                )}

                {activeTab === 'delivery-jobs' && <DeliveryJobsTab />}
                {activeTab === 'job-radar' && <JobRadarTab />}
                {activeTab === 'my-deliveries' && <MyDeliveriesTab />}
                {activeTab === 'inventory' && <MerchantInventory />}
                {activeTab === 'store' && user.role_type === 'supplier' && (
                    <StoreDetailView storeId={user.id} onBack={() => setActiveTab('overview')} onOpenChat={handleOpenChat} onOpenDetails={() => {}} />
                )}
            </motion.div>
        </AnimatePresence>
    );
};
