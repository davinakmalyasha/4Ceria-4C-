import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Home,
    Users,
    Briefcase,
    Trash2,
    Paintbrush,
    Scale,
    ClipboardList,
    Ruler,
    Wrench,
    Package,
    Loader2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { House } from '../types/explore';
import { Architect } from '../types/architect.types';
import { ConstructorData } from '../types/constructor.types';
import { FavoriteItem, FavoriteType, fetchFavoriteItems, toggleFavoriteItem } from '../hooks/useFavorites';

interface SavedItemsProps {
    houses?: House[];
    architects?: Architect[];
    constructors?: ConstructorData[];
    onSelectHouse?: (id: number) => void;
    onSelectArchitect?: (a: Architect) => void;
    onSelectConstructor?: (c: ConstructorData) => void;
    onBrowse?: (tab: string) => void;
}

const TABS: { type: FavoriteType; label: string; icon: React.ElementType; browseTab: string }[] = [
    { type: 'house', label: 'Houses', icon: Home, browseTab: 'houses' },
    { type: 'arsitek', label: 'Architects', icon: Users, browseTab: 'architects' },
    { type: 'kontraktor', label: 'Contractors', icon: Briefcase, browseTab: 'constructors' },
    { type: 'interior', label: 'Interior', icon: Paintbrush, browseTab: 'interior' },
    { type: 'notaris', label: 'Notaries', icon: Scale, browseTab: 'notaris' },
    { type: 'project_manager', label: 'PMs', icon: ClipboardList, browseTab: 'project_manager' },
    { type: 'structural', label: 'Structural', icon: Ruler, browseTab: 'structural' },
    { type: 'mep', label: 'MEP', icon: Wrench, browseTab: 'mep' },
    { type: 'material', label: 'Materials', icon: Package, browseTab: 'marketplace-materials' },
];

export default function SavedItemsDashboard({
    houses = [],
    architects = [],
    constructors = [],
    onSelectHouse,
    onSelectArchitect,
    onSelectConstructor,
    onBrowse,
}: SavedItemsProps) {
    const [items, setItems] = useState<Record<string, FavoriteItem[]>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<FavoriteType>('house');

    const refresh = useCallback(async () => {
        setIsLoading(true);
        const data = await fetchFavoriteItems();
        setItems(data);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const visibleTabs = useMemo(
        () => TABS.map((tab) => ({ ...tab, count: items[tab.type]?.length ?? 0 })),
        [items]
    );

    const totalSaved = visibleTabs.reduce((acc, tab) => acc + tab.count, 0);

    // Keep the active tab on something that exists.
    useEffect(() => {
        if (totalSaved === 0) return;
        if ((items[activeTab]?.length ?? 0) === 0) {
            const first = visibleTabs.find((tab) => tab.count > 0);
            if (first) setActiveTab(first.type);
        }
    }, [items, activeTab, totalSaved, visibleTabs]);

    const handleRemove = async (type: FavoriteType, id: number) => {
        await toggleFavoriteItem(type, id);
        refresh();
    };

    const handleOpen = (item: FavoriteItem) => {
        if (item.type === 'house') {
            if (houses.some((h) => h.id === item.id)) {
                onSelectHouse?.(item.id);
            } else {
                onBrowse?.('houses');
            }
            return;
        }
        if (item.type === 'arsitek') {
            const full = architects.find((a) => a.id === item.id);
            if (full) onSelectArchitect?.(full);
            else onBrowse?.('architects');
            return;
        }
        if (item.type === 'kontraktor') {
            const full = constructors.find((c) => c.id === item.id);
            if (full) onSelectConstructor?.(full);
            else onBrowse?.('constructors');
            return;
        }
        const tab = TABS.find((t) => t.type === item.type);
        onBrowse?.(tab?.browseTab ?? 'overview');
    };

    const formatPrice = (price: number | null) =>
        price !== null && price > 0 ? `Rp ${price.toLocaleString('id-ID')}` : null;

    const renderCard = (item: FavoriteItem) => (
        <div
            key={`${item.type}-${item.id}`}
            className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all cursor-pointer group"
            onClick={() => handleOpen(item)}
        >
            <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-gray-300">
                {item.image ? (
                    <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                    />
                ) : (
                    <Package size={22} />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <h4 className="font-bold text-gray-900 line-clamp-1">{item.title}</h4>
                {item.subtitle && <p className="text-xs text-gray-500 line-clamp-1">{item.subtitle}</p>}
                {formatPrice(item.price) && (
                    <p className="text-[#FF2D20] font-black mt-1 text-sm">{formatPrice(item.price)}</p>
                )}
            </div>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(item.type, item.id);
                }}
                className="p-3 text-red-500 hover:bg-red-50 rounded-full transition-colors shrink-0"
                aria-label="Remove from saved"
            >
                <Trash2 size={18} />
            </button>
        </div>
    );

    const activeItems = items[activeTab] ?? [];

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-6xl mx-auto pb-20">
            <div className="flex flex-col gap-2 relative z-10">
                <h3 className="text-3xl font-black text-gray-900">My Shortlist</h3>
                <p className="text-gray-500">
                    You have saved <span className="font-bold text-gray-900">{totalSaved}</span> items across the platform.
                </p>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-20 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                </div>
            ) : totalSaved === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-300">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <Home className="w-8 h-8 text-gray-300" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">No items saved yet</h3>
                    <p className="text-gray-500">Go explore the platform and shortlist your favorites!</p>
                </div>
            ) : (
                <>
                    <div className="flex gap-2 p-1 bg-white border border-gray-100 rounded-2xl w-fit shadow-sm overflow-x-auto no-scrollbar">
                        {visibleTabs
                            .filter((tab) => tab.count > 0)
                            .map((tab) => (
                                <button
                                    key={tab.type}
                                    onClick={() => setActiveTab(tab.type)}
                                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                                        activeTab === tab.type ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'
                                    }`}
                                >
                                    <tab.icon className={`w-4 h-4 ${activeTab === tab.type ? 'text-white' : ''}`} />
                                    {tab.label}
                                    <span
                                        className={`px-2 py-0.5 rounded-full text-xs ${
                                            activeTab === tab.type ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-900'
                                        }`}
                                    >
                                        {tab.count}
                                    </span>
                                </button>
                            ))}
                    </div>

                    <div className="mt-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {activeItems.map((item) => renderCard(item))}
                        </div>
                    </div>
                </>
            )}
        </motion.div>
    );
}
