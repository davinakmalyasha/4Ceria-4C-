import React, { useState, useCallback, Suspense, lazy } from 'react';
import axios from 'axios';

import { motion, AnimatePresence } from 'framer-motion';
import { FileText } from 'lucide-react';
import OverviewContent from '../OverviewContent';
import SavedItemsDashboard from '../SavedItemsDashboard';
import ProjectBoard from '../Projects/ProjectBoard';
import ProjectBiddingBrief from '../Projects/ProjectBiddingBrief';
import MyBidsList from '../Projects/MyBidsList';
// Heavy / rarely-first-paint tabs are code-split; the shared vendor chunks
// (maps, animations) then only download when their tab is actually opened.
const ExploreHouses = lazy(() => import('../ExploreHouses'));
const ProjectDetailPage = lazy(() => import('../Projects/ProjectDetailPage'));
const ProjectWizard = lazy(() => import('../Wizard/ProjectWizard'));
const MyHousesContent = lazy(() => import('../MyHousesContent'));
const SellHouseForm = lazy(() => import('../SellHouseForm'));
const MarketplaceTab = lazy(() => import('../Marketplace/MarketplaceTab'));
const StoreDetailView = lazy(() => import('../Marketplace/StoreDetailView'));
const QuoteHistoryTab = lazy(() => import('../Marketplace/QuoteHistoryTab'));
const DeliveryJobsTab = lazy(() => import('../Marketplace/DeliveryJobsTab'));
const JobRadarTab = lazy(() => import('../Logistics/JobRadarTab'));
const MyDeliveriesTab = lazy(() => import('../Logistics/MyDeliveriesTab'));
const MaterialOrdersTab = lazy(() => import('../Marketplace/MaterialOrdersTab'));
const LogisticsOverview = lazy(() => import('../Logistics/LogisticsOverview'));
const ProfessionalProfileView = lazy(() => import('../ProfessionalProfileView'));
const ChatTab = lazy(() => import('../Chat/ChatTab'));
const MerchantInventory = lazy(() => import('../MerchantInventory'));
import ExploreArchitects from '../Architects/ExploreArchitects';
import ExploreConstructors from '../Constructors/ExploreConstructors';
import ExploreInterior from '../Interior/ExploreInterior';
import ExploreNotaries from '../Notaris/ExploreNotaries';
import ExploreEngineers from '../Engineers/ExploreEngineers';
import { ExploreProjectManagers } from '../ProjectManagers/ExploreProjectManagers';
import { HirePMWorkspace } from '../ProjectManagers/HirePMWorkspace';
import { PMBid } from '../../types/project_manager.types';
import ProfessionalProjects from '../Projects/ProfessionalProjects';
import MaterialDetailsModal from '../Marketplace/MaterialDetailsModal';
import { UserProfileView } from './UserProfileView';
import EditProfileForm from '../EditProfileForm';
import ExploreTab from './ExploreTab';
import { HireHistoryTab } from './HireHistoryTab';
import FirmHub from './FirmHub';
import FirmInvitations from './FirmInvitations';
import SpecialistFirmHub from './SpecialistFirmHub';
import VerificationPage from './VerificationPage';

import { Project } from '../../types/project.types';
import { House } from '../../types/explore';

interface TabsProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    activeSubTab?: string | null;
    setActiveSubTab?: (tab: string | null) => void;
    user: any;
    houses: House[];
    projects: Project[];
    projectFeed: Project[];
    latestBids: any[];
    myBids: any[];
    isLoadingData: boolean;
    isProjectsLoading?: boolean;
    isFeedLoading?: boolean;
    isBidsLoading?: boolean;
    isHistoryLoading?: boolean;
    isHousesLoading?: boolean;
    isArchitectsLoading?: boolean;
    isConstructorsLoading?: boolean;
    isInteriorsLoading?: boolean;
    isNotariesLoading?: boolean;
    isProjectManagersLoading?: boolean;
    isStructuralLoading?: boolean;
    isMepLoading?: boolean;
    hiredProfessionals?: any[];
    architects: any[];
    constructors: any[];
    interiors?: any[];
    notaries?: any[];
    projectManagers?: any[];
    structuralEngineers?: any[];
    mepEngineers?: any[];
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
    onRefresh?: () => void;
    chatUserId?: number | null;
    onClearChatUser?: (v: null) => void;
}

export const DashboardTabs: React.FC<TabsProps> = (props) => {
    const { activeTab, setActiveTab, activeSubTab, setActiveSubTab, user, houses, projects, projectFeed, latestBids, myBids, 
        isLoadingData,
        isProjectsLoading, isFeedLoading, isBidsLoading, isHistoryLoading, isHousesLoading,
        isArchitectsLoading, isConstructorsLoading, isInteriorsLoading, isNotariesLoading,
        isProjectManagersLoading, isStructuralLoading, isMepLoading,
        hiredProfessionals = [], architects, constructors, interiors, notaries, projectManagers,
        structuralEngineers, mepEngineers,
        selectedProfessional, setSelectedProfessional, 
        selectedProject, setSelectedProject, selectedStoreId, setSelectedStoreId, 
        selectedMaterial, setSelectedMaterial, handleOpenChat, handleProjectStatusChange,
        setProjectToEdit, setProjectToDelete, handleViewActiveBids, 
        onRefresh, chatUserId, onClearChatUser } = props;

    const [selectedPMBid, setSelectedPMBid] = useState<PMBid | null>(null);
    const [detailedProject, setDetailedProject] = useState<any | null>(null);
    const [isProjectDetailLoading, setIsProjectDetailLoading] = useState(false);
    const projectCacheRef = React.useRef<Record<number, any>>({});
    const selectedProjectIdRef = React.useRef<number | null>(null);
    selectedProjectIdRef.current = selectedProject?.id || null;

    const prefetchProject = useCallback((projectId: number) => {
        if (projectCacheRef.current[projectId]) return;

        const promise = axios.get(`/projects/${projectId}`)
            .then(res => {
                const data = res.data.data;
                projectCacheRef.current[projectId] = data;
                if (selectedProjectIdRef.current === projectId) {
                    setDetailedProject(data);
                    setIsProjectDetailLoading(false);
                }
                return data;
            })
            .catch(err => {
                console.error("Failed to prefetch project detail", err);
                delete projectCacheRef.current[projectId];
                throw err;
            });

        projectCacheRef.current[projectId] = promise;
    }, []);

    React.useEffect(() => {
        if (!selectedProject?.id) {
            setDetailedProject(null);
            return;
        }

        const cached = projectCacheRef.current[selectedProject.id];
        // If we have resolved cache data (and not an in-flight promise)
        if (cached && typeof cached.then !== 'function') {
            setDetailedProject(cached);
            setIsProjectDetailLoading(false);
            return;
        }

        let isCurrent = true;
        setIsProjectDetailLoading(true);

        let promise;
        if (cached && typeof cached.then === 'function') {
            promise = cached;
        } else {
            promise = axios.get(`/projects/${selectedProject.id}`)
                .then(res => res.data.data)
                .catch(err => {
                    console.error("Failed to load project detail dynamically", err);
                    delete projectCacheRef.current[selectedProject.id];
                    throw err;
                });
            projectCacheRef.current[selectedProject.id] = promise;
        }

        promise.then(data => {
            if (isCurrent) {
                projectCacheRef.current[selectedProject.id] = data;
                setDetailedProject(data);
                setIsProjectDetailLoading(false);
            }
        }).catch(() => {
            if (isCurrent) {
                setIsProjectDetailLoading(false);
            }
        });

        return () => {
            isCurrent = false;
        };
    }, [selectedProject?.id]);

    const handleWorkspaceRefresh = useCallback(async () => {
        if (!selectedProject?.id) return;
        onRefresh?.();
        try {
            const res = await axios.get(`/projects/${selectedProject.id}`);
            const data = res.data.data;
            projectCacheRef.current[selectedProject.id] = data;
            setDetailedProject(data);
        } catch (err) {
            console.error("Failed to refresh project details dynamically", err);
        }
    }, [selectedProject?.id, onRefresh]);

    const formatCurrency = (amount: number) => 
        new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

    const getIsShortlistedPro = (proj: any) => {
        if (!user) return false;
        const bidKeys = [
            'bids_arsitek',
            'bids_kontraktor',
            'bids_notaris',
            'bids_interior',
            'bids_structural',
            'bids_mep',
            'bids_project_manager'
        ];
        for (const key of bidKeys) {
            const bids = proj[key] || [];
            const found = bids.find((b: any) => {
                const bidderUserId = b.user_id || 
                                     b.bidder?.user_id || 
                                     b.bidder?.user?.id ||
                                     b.pm?.user_id ||
                                     b.pm?.user?.id ||
                                     b.arsitek?.user_id || 
                                     b.kontraktor?.user_id || 
                                     b.notaris?.user_id || 
                                     b.interior?.user_id ||
                                     b.structural_engineer?.user_id || 
                                     b.mep_engineer?.user_id;
                return String(bidderUserId) === String(user.id);
            });
            if (found && ['shortlisted', 'negotiating', 'contract_pending'].includes(found.status)) return true;
        }
        return false;
    };

    const handleViewProject = (project: any) => {
        setSelectedProject(project);
        
        const baseProject = 
            projects.find(p => p.id === project.id) || 
            projectFeed.find(p => p.id === project.id) || 
            myBids.find(b => b.project_id === project.id || b.project?.id === project.id)?.project ||
            project;

        const isOwner = user?.id === baseProject.user_id;
        const isHiredPM = baseProject.pm_id && user?.id === baseProject.pm_id;
        const isHiredPro = 
            (baseProject.selected_arsitek_id && (user?.arsitek?.id === baseProject.selected_arsitek_id || baseProject.arsitek?.user_id === user?.id || baseProject.arsitek?.user?.id === user?.id)) ||
            (baseProject.selected_kontraktor_id && (user?.kontraktor?.id === baseProject.selected_kontraktor_id || baseProject.kontraktor?.user_id === user?.id || baseProject.kontraktor?.user?.id === user?.id)) ||
            (baseProject.selected_notaris_id && (user?.notaris_profile?.id === baseProject.selected_notaris_id || baseProject.notaris?.user_id === user?.id || baseProject.notaris?.user?.id === user?.id || baseProject.notaris_profile?.user_id === user?.id)) ||
            (baseProject.selected_interior_id && (user?.interior_profile?.id === baseProject.selected_interior_id || baseProject.interior_profile?.user_id === user?.id || baseProject.interior?.user?.id === user?.id || baseProject.interior_profile?.user?.id === user?.id)) ||
            (baseProject.structural_id && (user?.structural_engineer?.id === baseProject.structural_id || baseProject.structural_engineer?.user_id === user?.id || baseProject.structural_engineer?.user?.id === user?.id)) ||
            (baseProject.mep_id && (user?.mep_engineer?.id === baseProject.mep_id || baseProject.mep_engineer?.user_id === user?.id || baseProject.mep_engineer?.user?.id === user?.id)) ||
            (!!baseProject.sub_professionals && baseProject.sub_professionals.some((s: any) => s.user_id === user?.id && s.status === 'active'));


        const isShortlistedPro = getIsShortlistedPro(baseProject);

        const showWorkspace = isOwner || isHiredPM || isHiredPro || isShortlistedPro;
        
        if (showWorkspace) {
            setActiveTab('project-detail');
        } else {
            setActiveTab('bidding-brief');
        }
    };

    const availableProsCount = 
        (architects?.length || 0) + 
        (constructors?.length || 0) + 
        (interiors?.length || 0) + 
        (notaries?.length || 0) + 
        (projectManagers?.length || 0) + 
        (structuralEngineers?.length || 0) + 
        (mepEngineers?.length || 0);

    return (
        <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full">
                <Suspense fallback={
                    <div className="py-24 flex flex-col items-center justify-center gap-3">
                        <div className="w-8 h-8 rounded-full border-[3px] border-neutral-200 border-t-[#FF2D20] animate-spin" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Loading module...</p>
                    </div>
                }>
                
                {activeTab === 'overview' && (
                    <>
                    {['structural', 'mep', 'interior', 'kontraktor', 'civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'].includes(user?.role_type) && (
                        <FirmInvitations onOpenChat={handleOpenChat} />
                    )}
                    {user?.role_type === 'logistics' ? (
                        <LogisticsOverview user={user} setActiveTab={setActiveTab} />
                    ) : (
                        <OverviewContent 
                            user={user} houses={houses} relevantProjects={projects} 
                            projectFeed={projectFeed} latestBids={latestBids} isLoadingData={isLoadingData} 
                            setActiveTab={setActiveTab} formatCurrency={formatCurrency} 
                            onViewActiveBids={handleViewActiveBids} onEditProfile={() => setActiveTab('profile')}
                            openTendersCount={projectFeed.length} 
                            myBidsCount={user?.role_type === 'user' 
                                ? projects.reduce((acc, p) => acc + (p.bids_arsitek_count || 0) + (p.bids_kontraktor_count || 0) + (p.bids_notaris_count || 0) + (p.bids_interior_count || 0), 0)
                                : myBids.length}
                            myProjectsCount={projects.length}
                            onPostProject={() => setActiveTab('post-project')}
                            onViewProject={handleViewProject}
                            availableProsCount={availableProsCount}
                            onPrefetch={prefetchProject}
                        />
                    )}
                    </>
                )}

                {activeTab === 'explore' && (
                    <ExploreTab 
                        houses={houses} 
                        isLoadingData={isLoadingData} 
                        architects={architects} 
                        constructors={constructors}
                        interiors={interiors}
                        projectManagers={projectManagers}
                        notaries={notaries}
                        structuralEngineers={structuralEngineers}
                        mepEngineers={mepEngineers}
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

                {(activeTab === 'project-detail' || activeTab === 'bidding-brief') && selectedProject && (() => {
                    const proj = detailedProject || selectedProject;
                    const hasBasicMetadata = proj && proj.title && proj.user_id;

                    if (!hasBasicMetadata) {
                        return (
                            <div className="w-full space-y-6 animate-pulse p-4">
                                <div className="h-48 bg-gray-100 rounded-3xl" />
                                <div className="flex flex-col lg:flex-row gap-6">
                                    <div className="w-full lg:w-52 h-64 bg-gray-100 rounded-3xl shrink-0" />
                                    <div className="flex-1 h-[500px] bg-gray-100 rounded-3xl" />
                                </div>
                            </div>
                        );
                    }

                    const isOwner = user?.id === proj.user_id;
                    const isHiredPM = proj.pm_id && user?.id === proj.pm_id;
                    
                    const isHiredPro = 
                        (proj.selected_arsitek_id && (user?.arsitek?.id === proj.selected_arsitek_id || proj.arsitek?.user_id === user?.id || proj.arsitek?.user?.id === user?.id)) ||
                        (proj.selected_kontraktor_id && (user?.kontraktor?.id === proj.selected_kontraktor_id || proj.kontraktor?.user_id === user?.id || proj.kontraktor?.user?.id === user?.id)) ||
                        (proj.selected_notaris_id && (user?.notaris_profile?.id === proj.selected_notaris_id || proj.notaris?.user_id === user?.id || proj.notaris?.user?.id === user?.id || proj.notaris_profile?.user_id === user?.id)) ||
                        (proj.selected_interior_id && (user?.interior_profile?.id === proj.selected_interior_id || proj.interior_profile?.user_id === user?.id || proj.interior?.user?.id === user?.id || proj.interior_profile?.user?.id === user?.id)) ||
                        (proj.structural_id && (user?.structural_engineer?.id === proj.structural_id || proj.structural_engineer?.user_id === user?.id || proj.structural_engineer?.user?.id === user?.id)) ||
                        (proj.mep_id && (user?.mep_engineer?.id === proj.mep_id || proj.mep_engineer?.user_id === user?.id || proj.mep_engineer?.user?.id === user?.id)) ||
                        (!!proj.sub_professionals && proj.sub_professionals.some((s: any) => s.user_id === user?.id && s.status === 'active'));

                    const isShortlistedPro = getIsShortlistedPro(proj);

                    const showWorkspace = isOwner || isHiredPM || isHiredPro || isShortlistedPro;

                    if (showWorkspace) {
                        return (
                            <ProjectDetailPage 
                                project={proj}
                                user={user}
                                onBack={() => { setSelectedProject(null); setActiveTab('projects'); }}
                                onRefresh={handleWorkspaceRefresh}
                                onOpenChat={handleOpenChat}
                                onViewProfile={(pro, phaseKey) => {
                                    setSelectedProfessional(pro);
                                    const tabMap: any = { design: 'architects', build: 'constructors', legal: 'notaris', interior: 'interior', management: 'project_manager' };
                                    setActiveTab(tabMap[phaseKey] || 'architects');
                                }}
                                isProjectDetailLoading={isProjectDetailLoading || !detailedProject}
                            />
                        );
                    }

                    return (
                        <ProjectBiddingBrief 
                            project={proj}
                            user={user}
                            onBack={() => { setSelectedProject(null); setActiveTab('projects'); }}
                            onRefresh={handleWorkspaceRefresh}
                        />
                    );
                })()}

                {activeTab === 'projects' && (
                    <ProjectBoard 
                        projects={(user?.role_type === 'user' ? projects : projectFeed) as any} 
                        isLoading={isProjectsLoading ?? isLoadingData} userRole={user?.role_type}
                        onPostProject={() => setActiveTab('post-project')}
                        onViewProject={handleViewProject} onEditProject={setProjectToEdit}
                        onDeleteProject={setProjectToDelete} onStatusChange={handleProjectStatusChange}
                        myBidsCount={myBids.length} onViewMyBids={() => setActiveTab('my-bids')}
                        onPrefetch={prefetchProject}
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
                        <MyBidsList 
                            bids={myBids} 
                            isLoading={isBidsLoading ?? isLoadingData} 
                            onViewProject={(project) => handleViewProject(project)} 
                            initialSubTab={activeSubTab}
                            onSubTabChange={(tab) => setActiveSubTab?.(tab)}
                            onPrefetch={prefetchProject}
                        />
                    </div>
                )}

                {activeTab === 'hire-history' && (
                    <HireHistoryTab 
                        history={hiredProfessionals} 
                        isLoading={isHistoryLoading ?? isLoadingData} 
                        onOpenChat={(uid) => handleOpenChat({ id: uid })}
                        onBrowseProfessionals={() => setActiveTab('architects')}
                    />
                )}

                {activeTab === 'post-project' && (
                    <ProjectWizard
                        onCancel={() => setActiveTab('overview')} 
                        onSuccess={() => { onRefresh?.(); setActiveTab('projects'); }} 
                    />
                )}

                {activeTab === 'houses' && (
                    <ExploreHouses houses={houses} isLoading={isHousesLoading ?? isLoadingData} 
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

                {(activeTab === 'marketplace' || activeTab === 'marketplace-materials' || activeTab === 'marketplace-furniture') && (
                    <>
                        {selectedStoreId ? (
                            <StoreDetailView storeId={selectedStoreId} onBack={() => setSelectedStoreId(null)} onOpenChat={handleOpenChat} onOpenDetails={setSelectedMaterial} />
                        ) : (
                            <MarketplaceTab 
                                onOpenChat={handleOpenChat} 
                                onOpenDetails={setSelectedMaterial} 
                                onOpenCart={() => {}} 
                                onOpenStore={setSelectedStoreId} 
                                initialMarketType={activeTab === 'marketplace-furniture' ? 'furniture' : 'materials'}
                            />
                        )}
                        <AnimatePresence>{selectedMaterial && <MaterialDetailsModal material={selectedMaterial} onClose={() => setSelectedMaterial(null)} onOpenChat={handleOpenChat} />}</AnimatePresence>
                    </>
                )}

                {activeTab === 'profile' && (
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-7xl w-full">
                        {!['project_manager', 'structural', 'mep', 'civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'].includes(user?.role_type) && (
                            <h3 className="text-2xl font-black text-gray-900 mb-8">Edit Profile</h3>
                        )}
                        <EditProfileForm onCancel={() => {
                            setActiveTab('overview');
                        }} />
                    </div>
                )}

                {activeTab === 'verification' && (
                    <VerificationPage onBack={() => setActiveTab('overview')} />
                )}

                {activeTab === 'material-orders' && <MaterialOrdersTab />}
                {activeTab === 'orders' && <MaterialOrdersTab />}
                {activeTab === 'quotes' && <QuoteHistoryTab user={user} />}

                {activeTab === 'architects' && (
                    selectedProfessional ? (
                        <ProfessionalProfileView type="architect" data={selectedProfessional} projects={projects} onClose={() => setSelectedProfessional(null)} onOpenChat={handleOpenChat} />
                    ) : <ExploreArchitects architects={architects} isLoading={isArchitectsLoading ?? isLoadingData} onSelectArchitect={setSelectedProfessional} />
                )}

                {activeTab === 'constructors' && (
                    selectedProfessional ? (
                        <ProfessionalProfileView type="constructor" data={selectedProfessional} projects={projects} onClose={() => setSelectedProfessional(null)} onOpenChat={handleOpenChat} />
                    ) : <ExploreConstructors constructors={constructors} isLoading={isConstructorsLoading ?? isLoadingData} onSelectConstructor={setSelectedProfessional} />
                )}

                {activeTab === 'interior' && (
                    selectedProfessional ? (
                        <ProfessionalProfileView type="interior" data={selectedProfessional} projects={projects} onClose={() => setSelectedProfessional(null)} onOpenChat={handleOpenChat} />
                    ) : <ExploreInterior designers={interiors || []} isLoading={isInteriorsLoading ?? isLoadingData} onSelectDesigner={setSelectedProfessional} />
                )}

                {activeTab === 'find-engineers' && (
                    <div className="space-y-12">
                        <div>
                            <h3 className="text-xl font-black text-gray-900 mb-6 px-4 border-l-4 border-zinc-900">Structural Engineers</h3>
                            <ExploreEngineers engineers={structuralEngineers || []} isLoading={isStructuralLoading ?? isLoadingData} type="structural" onSelect={(e) => { setSelectedProfessional(e); setActiveTab('structural'); }} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900 mb-6 px-4 border-l-4 border-zinc-900">MEP Specialists</h3>
                            <ExploreEngineers engineers={mepEngineers || []} isLoading={isMepLoading ?? isLoadingData} type="mep" onSelect={(e) => { setSelectedProfessional(e); setActiveTab('mep'); }} />
                        </div>
                    </div>
                )}

                {activeTab === 'find-sub-contractors' && (
                    <div className="space-y-6">
                        <div className="flex flex-col gap-2 mb-6">
                            <h3 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                                <span className="w-10 h-10 rounded-xl bg-zinc-100 text-zinc-500 flex items-center justify-center shadow-sm border border-zinc-200">
                                    <FileText size={20} />
                                </span>
                                Hire Sub-Contractors
                            </h3>
                            <p className="text-gray-500 text-sm">Browse and invite specialist contractors (roofing, pool, HVAC, etc.) to your active projects.</p>
                        </div>
                        <ExploreConstructors constructors={constructors} isLoading={isConstructorsLoading ?? isLoadingData} onSelectConstructor={setSelectedProfessional} />
                    </div>
                )}

                {activeTab === 'structural' && (
                    selectedProfessional ? (
                        <ProfessionalProfileView type="structural" data={selectedProfessional} projects={projects} onClose={() => setSelectedProfessional(null)} onOpenChat={handleOpenChat} />
                    ) : <ExploreEngineers engineers={structuralEngineers || []} isLoading={isStructuralLoading ?? isLoadingData} type="structural" onSelect={setSelectedProfessional} />
                )}

                {activeTab === 'mep' && (
                    selectedProfessional ? (
                        <ProfessionalProfileView type="mep" data={selectedProfessional} projects={projects} onClose={() => setSelectedProfessional(null)} onOpenChat={handleOpenChat} />
                    ) : <ExploreEngineers engineers={mepEngineers || []} isLoading={isMepLoading ?? isLoadingData} type="mep" onSelect={setSelectedProfessional} />
                )}

                {activeTab === 'notaris' && (
                    selectedProfessional ? (
                        <ProfessionalProfileView type="notaris" data={selectedProfessional} projects={projects} onClose={() => setSelectedProfessional(null)} onOpenChat={handleOpenChat} />
                    ) : <ExploreNotaries notaries={notaries || []} isLoading={isNotariesLoading ?? isLoadingData} onSelect={setSelectedProfessional} />
                )}
                
                {activeTab === 'project_manager' && (
                    selectedPMBid ? (
                        <HirePMWorkspace 
                            project={projects.find(p => p.id === selectedPMBid.project_id)}
                            user={user}
                            bid={selectedPMBid}
                            onBack={() => setSelectedPMBid(null)}
                            onRefresh={onRefresh}
                        />
                    ) : selectedProfessional ? (
                        <ProfessionalProfileView 
                            type="project_manager" 
                            data={selectedProfessional} 
                            projects={projects} 
                            onClose={() => setSelectedProfessional(null)} 
                            onOpenChat={handleOpenChat}
                            onHirePM={(bid) => {
                                setSelectedPMBid(bid);
                                setSelectedProfessional(null);
                            }}
                        />
                    ) : <ExploreProjectManagers projectManagers={projectManagers || []} isLoading={isProjectManagersLoading ?? isLoadingData} onSelectPM={setSelectedProfessional} />
                )}

                {activeTab === 'chat' && <ChatTab initialUserId={chatUserId} onClearInitialUser={() => onClearChatUser?.(null)} />}

                {activeTab === 'management' && (
                    <ProfessionalProjects projects={projects} isLoading={isProjectsLoading ?? isLoadingData} onViewProject={handleViewProject} formatCurrency={formatCurrency} onPrefetch={prefetchProject} />
                )}

                {activeTab === 'my-firm' && (user?.role_type === 'arsitek' || user?.role_type === 'kontraktor') && (
                    <FirmHub onOpenChat={handleOpenChat} />
                )}

                {activeTab === 'my-firms' && ['structural', 'mep', 'interior', 'civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'].includes(user?.role_type) && (
                    <SpecialistFirmHub onOpenChat={handleOpenChat} />
                )}

                {activeTab === 'delivery-jobs' && <DeliveryJobsTab />}
                {activeTab === 'job-radar' && <JobRadarTab />}
                {activeTab === 'my-deliveries' && <MyDeliveriesTab />}
                {activeTab === 'inventory' && <MerchantInventory />}
                {activeTab === 'store' && user.role_type === 'supplier' && (
                    <StoreDetailView storeId={user.id} onBack={() => setActiveTab('overview')} onOpenChat={handleOpenChat} onOpenDetails={() => {}} />
                )}
                </Suspense>
            </motion.div>
        </AnimatePresence>
    );
};
