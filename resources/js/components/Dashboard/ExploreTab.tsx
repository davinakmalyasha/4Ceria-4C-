import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Home as HomeIcon, Users, ShoppingBag, Heart } from 'lucide-react';
import ExploreHouses from '../ExploreHouses';
import SavedItemsDashboard from '../SavedItemsDashboard';
import MarketplaceTab from '../Marketplace/MarketplaceTab';
import StoreDetailView from '../Marketplace/StoreDetailView';
import MaterialDetailsModal from '../Marketplace/MaterialDetailsModal';
import ExploreArchitects from '../Architects/ExploreArchitects';
import ExploreConstructors from '../Constructors/ExploreConstructors';

interface ExploreTabProps {
    houses?: any[];
    isLoadingData?: boolean;
    architects?: any[];
    constructors?: any[];
    selectedProfessional?: any;
    setSelectedProfessional?: (p: any) => void;
    selectedStoreId?: number | null;
    setSelectedStoreId?: (id: number | null) => void;
    selectedMaterial?: any;
    setSelectedMaterial?: (m: any) => void;
    handleOpenChat?: (professional: any) => void;
    setActiveTab?: (tab: string) => void;
}

const SUB_TABS = [
    { id: 'houses', label: 'Houses', icon: HomeIcon },
    { id: 'professionals', label: 'Professionals', icon: Users },
    { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
    { id: 'saved', label: 'Saved', icon: Heart },
];

export default function ExploreTab(props: ExploreTabProps) {
    const [subTab, setSubTab] = useState('houses');

    return (
        <div className="w-full space-y-6">
            <div>
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">Explore</h2>
                <p className="text-gray-400 text-sm font-medium mt-1">Browse houses, find professionals, and shop materials.</p>
            </div>

            {/* Sub-tab pills */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {SUB_TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = subTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setSubTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                                isActive
                                    ? 'bg-gray-900 text-white shadow-lg shadow-black/10'
                                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                            }`}
                        >
                            <Icon size={14} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Content placeholder – will be wired to existing components in Batch 3 */}
            <motion.div
                key={subTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 min-h-[400px]"
            >
                <ExploreContent subTab={subTab} props={props} />
            </motion.div>
        </div>
    );
}

function ExploreContent({ subTab, props }: { subTab: string, props: ExploreTabProps }) {
    if (subTab === 'houses') {
        return <ExploreHouses houses={props.houses || []} isLoading={props.isLoadingData || false} 
            onSelectHouse={(id) => { const h = props.houses?.find(x => x.id === id); if (h) window.dispatchEvent(new CustomEvent('openHouseDetails', { detail: h.id })); }} 
        />;
    }

    if (subTab === 'professionals') {
        return (
            <div className="space-y-12 pb-8">
                <div>
                    <h3 className="text-xl font-black text-gray-900 mb-4 px-4 border-l-4 border-[#FF2D20]">Architects & Designers</h3>
                    <ExploreArchitects architects={props.architects || []} isLoading={props.isLoadingData || false} onSelectArchitect={(a) => { props.setActiveTab?.('architects'); props.setSelectedProfessional?.({ type: 'architect', data: a }); }} />
                </div>
                <div>
                    <h3 className="text-xl font-black text-gray-900 mb-4 px-4 border-l-4 border-[#FF2D20]">Constructors & Build Teams</h3>
                    <ExploreConstructors constructors={props.constructors || []} isLoading={props.isLoadingData || false} onSelectConstructor={(c) => { props.setActiveTab?.('constructors'); props.setSelectedProfessional?.({ type: 'constructor', data: c }); }} />
                </div>
            </div>
        );
    }

    if (subTab === 'marketplace') {
        return (
            <>
                {props.selectedStoreId ? (
                    <StoreDetailView storeId={props.selectedStoreId} onBack={() => props.setSelectedStoreId?.(null)} onOpenChat={props.handleOpenChat!} onOpenDetails={props.setSelectedMaterial!} />
                ) : (
                    <MarketplaceTab onOpenChat={props.handleOpenChat!} onOpenDetails={props.setSelectedMaterial!} onOpenCart={() => {}} onOpenStore={props.setSelectedStoreId!} />
                )}
                {props.selectedMaterial && <MaterialDetailsModal material={props.selectedMaterial} onClose={() => props.setSelectedMaterial?.(null)} onOpenChat={props.handleOpenChat!} />}
            </>
        );
    }

    if (subTab === 'saved') {
        return <SavedItemsDashboard houses={props.houses || []} architects={props.architects || []} constructors={props.constructors || []} 
            onSelectHouse={() => props.setActiveTab?.('houses')}
            onSelectArchitect={(a) => { props.setActiveTab?.('architects'); props.setSelectedProfessional?.({ type: 'architect', data: a }); }}
            onSelectConstructor={(c) => { props.setActiveTab?.('constructors'); props.setSelectedProfessional?.({ type: 'constructor', data: c }); }} 
        />;
    }

    return null;
}
