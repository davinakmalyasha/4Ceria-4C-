import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Building2, Bell, Users, MessageSquare, Eye, Loader2, Send, Search, CheckCircle, SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { MyFirmEntry, JobPosting } from '../../types/sub_professional.types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import FirmInvitations from './FirmInvitations';
import FirmSquadProfile from './FirmSquadProfile';
import ConfirmModal from '../Projects/ConfirmModal';
import { motion, AnimatePresence } from 'framer-motion';

interface SpecialistFirmHubProps {
    onOpenChat: (user: { id: number }) => void;
}

type HubTabId = 'firms' | 'browse' | 'invitations';

export default function SpecialistFirmHub({ onOpenChat }: SpecialistFirmHubProps) {
    const [activeTab, setActiveTab] = useState<HubTabId>('firms');
    const [selectedOwnerId, setSelectedOwnerId] = useState<number | null>(null);

    const TABS: { id: HubTabId; label: string; icon: React.FC<{ size?: number }> }[] = [
        { id: 'firms', label: 'My Firms', icon: Building2 },
        { id: 'browse', label: 'Find Squads', icon: Users },
        { id: 'invitations', label: 'Invitations', icon: Bell },
    ];

    if (selectedOwnerId !== null) {
        return (
            <div className="space-y-4">
                <button
                    onClick={() => setSelectedOwnerId(null)}
                    className="text-xs font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5"
                >
                    ← Back to List
                </button>
                <FirmSquadProfile 
                    ownerId={selectedOwnerId} 
                    isGuestMode={true} 
                    onCloseGuest={() => setSelectedOwnerId(null)} 
                    onOpenChat={onOpenChat} 
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                    activeTab === tab.id
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                <Icon size={14} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
                {activeTab === 'firms' && (
                    <button
                        onClick={() => setActiveTab('browse')}
                        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md"
                    >
                        <Send size={14} /> Find Squads
                    </button>
                )}
            </div>

            {activeTab === 'firms' && <MyFirmsList onOpenChat={onOpenChat} onViewSquad={setSelectedOwnerId} />}
            {activeTab === 'browse' && <SpecialistBrowseFirmsBoard onViewSquad={setSelectedOwnerId} />}
            {activeTab === 'invitations' && <FirmInvitations isFullPage onOpenChat={onOpenChat} />}
        </div>
    );
}

/* ─── SpecialistBrowseFirmsBoard (Bidding Board for Firms) ─── */

interface SpecialistBrowseFirmsBoardProps {
    onViewSquad: (ownerId: number) => void;
}

interface FirmOwner {
    id: number;
    name: string;
    role_type: string;
    pic: string | null;
    firm_name: string | null;
    firm_slogan: string | null;
    firm_banner_path: string | null;
    firm_banner_url: string | null;
    firm_description: string | null;
    firm_is_hiring: boolean;
    firm_needed_roles: (string | JobPosting)[];
    currentUserMembershipStatus?: string | null;
}

const getNeededRoleStrings = (roles: (string | JobPosting)[] | undefined): string[] => {
    if (!roles || !Array.isArray(roles)) return [];
    return roles.map(item => {
        if (typeof item === 'string') return item;
        return item?.role || '';
    }).filter(Boolean);
};

function SpecialistBrowseFirmsBoard({ onViewSquad }: SpecialistBrowseFirmsBoardProps) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<FirmOwner[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [requestingId, setRequestingId] = useState<number | null>(null);
    
    // Sort and Filters
    const [showFilters, setShowFilters] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState<'all' | 'arsitek' | 'kontraktor'>('all');
    const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
    const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'type-asc'>('name-asc');

    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        ownerId: number | null;
        neededRoles: string[];
        firmName: string;
    }>({
        isOpen: false,
        ownerId: null,
        neededRoles: [],
        firmName: '',
    });

    const ALL_SPECIALTIES = [
        { value: 'structural', label: 'Structural' },
        { value: 'mep', label: 'MEP' },
        { value: 'interior', label: 'Interior' },
        { value: 'civil', label: 'Civil' },
        { value: 'mechanical', label: 'Mechanical' },
        { value: 'electrical', label: 'Electrical' },
        { value: 'plumbing', label: 'Plumbing' },
        { value: 'roofing', label: 'Roofing' },
        { value: 'finishing', label: 'Finishing' },
    ];

    const activeFilterCount = (categoryFilter !== 'all' ? 1 : 0) + selectedSpecialties.length;

    const handleResetFilters = () => {
        setCategoryFilter('all');
        setSelectedSpecialties([]);
        setQuery('');
    };

    const processedResults = React.useMemo(() => {
        let list = [...results];

        // 1. Category Filter
        if (categoryFilter !== 'all') {
            list = list.filter(f => f.role_type === categoryFilter);
        }

        // 2. Specialties Filter
        if (selectedSpecialties.length > 0) {
            list = list.filter(f => {
                const needed = getNeededRoleStrings(f.firm_needed_roles).map(r => r.toLowerCase());
                return selectedSpecialties.some(spec => needed.includes(spec.toLowerCase()));
            });
        }

        // 3. Sorting
        list.sort((a, b) => {
            const nameA = (a.firm_name || a.name).toLowerCase();
            const nameB = (b.firm_name || b.name).toLowerCase();
            if (sortBy === 'name-asc') {
                return nameA.localeCompare(nameB);
            } else if (sortBy === 'name-desc') {
                return nameB.localeCompare(nameA);
            } else if (sortBy === 'type-asc') {
                return a.role_type.localeCompare(b.role_type);
            }
            return 0;
        });

        return list;
    }, [results, categoryFilter, selectedSpecialties, sortBy]);

    const fetchFirms = useCallback(async (searchQuery = '') => {
        setIsLoading(true);
        try {
            const res = await axios.get<{ data: FirmOwner[] }>('/firm-members/browse-owners', {
                params: { query: searchQuery }
            });
            setResults(res.data?.data || []);
        } catch {
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Fetch default (hiring firms) on mount
    useEffect(() => {
        fetchFirms();
    }, [fetchFirms]);

    // Handle search query changes with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchFirms(query);
        }, 300);
        return () => clearTimeout(timer);
    }, [query, fetchFirms]);

    const handleRequestJoin = async (ownerId: number, neededRoles: string[]) => {
        if (!user) return;

        // Verify that the specialist's role matches one of the needed roles
        const isMatch = neededRoles.map(r => r.toLowerCase()).includes(user.role_type.toLowerCase());
        if (!isMatch) {
            showToast(`This squad is not seeking ${user.role_type.toUpperCase()} specialists.`, 'error');
            return;
        }

        setRequestingId(ownerId);
        try {
            await axios.post('/firm-members/request-join', {
                firm_owner_id: ownerId,
                role_in_firm: user.role_type,
            });
            showToast('Join request sent successfully!', 'success');
            // Refresh list or mark as requested
            fetchFirms(query);
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Failed to send request';
            showToast(msg, 'error');
        } finally {
            setRequestingId(null);
        }
    };

    const roleLabel = (rt: string) => {
        const map: Record<string, string> = { arsitek: 'Architect', kontraktor: 'Contractor' };
        return map[rt] || rt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    return (
        <div className="space-y-6">
            {/* Search, Sort and Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
                {/* Search Bar */}
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search squads by name or code (e.g., #S7H5UQ)..."
                        className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:border-indigo-500 outline-none transition-all shadow-sm"
                    />
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Sort Dropdown */}
                    <div className="relative bg-white border border-slate-200 rounded-2xl shadow-sm text-xs group flex items-center pr-2 pl-1 h-[46px]">
                        <div className="pl-2 pr-1.5 border-r border-slate-100 flex items-center text-slate-400 pointer-events-none gap-1">
                            <ArrowUpDown className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-extrabold mr-1 uppercase tracking-wider text-slate-500">Sort</span>
                        </div>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="bg-transparent border-none outline-none py-2 pl-2 pr-8 focus:ring-0 font-bold text-gray-700 cursor-pointer appearance-none text-xs"
                        >
                            <option value="name-asc">Name (A-Z)</option>
                            <option value="name-desc">Name (Z-A)</option>
                            <option value="type-asc">Category</option>
                        </select>
                    </div>

                    {/* Filter Toggle Button */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 h-[46px] rounded-2xl border text-xs font-bold transition-all shadow-sm ${
                            showFilters || activeFilterCount > 0
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        <SlidersHorizontal size={14} />
                        <span>Filter</span>
                        {activeFilterCount > 0 && (
                            <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded-full text-[9px] font-black leading-none">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Filter Panel (Collapsible) */}
            <AnimatePresence>
                {showFilters && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                            <div className="flex flex-col md:flex-row gap-6">
                                {/* Category filter */}
                                <div className="space-y-2 min-w-[200px]">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Firm Category</label>
                                    <div className="flex gap-2">
                                        {(['all', 'arsitek', 'kontraktor'] as const).map(cat => (
                                            <button
                                                key={cat}
                                                onClick={() => setCategoryFilter(cat)}
                                                className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                                                    categoryFilter === cat
                                                        ? 'bg-indigo-600 border-indigo-650 text-white shadow-md'
                                                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                                }`}
                                            >
                                                {cat === 'all' ? 'All' : cat === 'arsitek' ? 'Architect' : 'Contractor'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Specialties Seeking filter */}
                                <div className="space-y-2 flex-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Seeking Specialties</label>
                                    <div className="flex flex-wrap gap-2">
                                        {ALL_SPECIALTIES.map(spec => {
                                            const isSelected = selectedSpecialties.includes(spec.value);
                                            return (
                                                <button
                                                    key={spec.value}
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            setSelectedSpecialties(selectedSpecialties.filter(v => v !== spec.value));
                                                        } else {
                                                            setSelectedSpecialties([...selectedSpecialties, spec.value]);
                                                        }
                                                    }}
                                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                                                        isSelected
                                                            ? 'bg-indigo-150 border-indigo-300 text-indigo-700'
                                                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-350'
                                                    }`}
                                                >
                                                    {spec.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Reset block */}
                            {activeFilterCount > 0 && (
                                <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-xs">
                                    <span className="text-slate-400 font-medium">
                                        {activeFilterCount} active filter{activeFilterCount > 1 ? 's' : ''} · {processedResults.length} squad{processedResults.length === 1 ? '' : 's'} found
                                    </span>
                                    <button
                                        onClick={handleResetFilters}
                                        className="text-indigo-600 hover:text-indigo-800 font-black uppercase tracking-wider text-[10px]"
                                    >
                                        Clear All
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="animate-pulse bg-white border border-slate-100 rounded-3xl h-[280px]" />
                    ))}
                </div>
            ) : processedResults.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-3xl border border-slate-150">
                    <Search size={40} className="mx-auto mb-4 text-slate-300" />
                    <p className="text-sm font-bold text-slate-500">No active hiring squads found.</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting your search criteria or filters.</p>
                    {activeFilterCount > 0 && (
                        <button
                            onClick={handleResetFilters}
                            className="mt-4 px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition shadow-md"
                        >
                            Reset Filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {processedResults.map(firm => {
                        const neededRoleStrings = getNeededRoleStrings(firm.firm_needed_roles);
                        const isEligible = neededRoleStrings.map(r => r.toLowerCase()).includes(user?.role_type.toLowerCase() || '');
                        
                        return (
                            <div key={firm.id} className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-full hover:border-indigo-500">
                                {/* Banner Header */}
                                <div className="h-28 relative bg-slate-100">
                                    {firm.firm_banner_url ? (
                                        <img src={firm.firm_banner_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-tr from-slate-800 to-indigo-950 flex items-center justify-center">
                                            <Building2 className="text-white/10" size={64} />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                    <div className="absolute bottom-3 left-4 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-indigo-600 font-black text-sm shadow-md overflow-hidden shrink-0">
                                            {firm.pic ? (
                                                <img src={firm.pic} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                firm.name.charAt(0).toUpperCase()
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-black text-white truncate max-w-[180px]">
                                                {firm.firm_name || firm.name}
                                            </h4>
                                            <p className="text-[9px] text-indigo-300 font-bold uppercase tracking-widest">
                                                {roleLabel(firm.role_type)} Firm
                                            </p>
                                        </div>
                                    </div>
                                    <div className="absolute top-3 right-3">
                                        <span className="px-2 py-0.5 bg-green-500 text-white rounded text-[8px] font-black uppercase tracking-widest shadow-md">
                                            Recruiting
                                        </span>
                                    </div>
                                </div>

                                {/* Body */}
                                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                                    <div>
                                        {firm.firm_slogan ? (
                                            <p className="text-[11px] font-extrabold text-slate-700 italic line-clamp-1">
                                                "{firm.firm_slogan}"
                                            </p>
                                        ) : (
                                            <p className="text-[11px] font-medium text-slate-400 italic">No tagline set</p>
                                        )}
                                        <p className="text-[10px] font-semibold text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                                            {firm.firm_description || 'We are looking for dedicated sub-professionals to build high-quality execution projects.'}
                                        </p>
                                    </div>

                                    {/* Seeking Roles */}
                                    <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Seeking Specialties</p>
                                        <div className="flex flex-wrap gap-1">
                                            {neededRoleStrings.map(r => {
                                                const isUserRole = r.toLowerCase() === user?.role_type.toLowerCase();
                                                return (
                                                    <span 
                                                        key={r} 
                                                        className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded border ${
                                                            isUserRole 
                                                                ? 'bg-green-50 text-green-700 border-green-200' 
                                                                : 'bg-indigo-50/50 text-indigo-600 border-indigo-100/50'
                                                        }`}
                                                    >
                                                        {r.replace(/_/g, ' ')}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="px-5 pb-5 pt-1 flex gap-2">
                                    <button
                                        onClick={() => onViewSquad(firm.id)}
                                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 border border-slate-200"
                                    >
                                        <Eye size={12} /> View Squad
                                    </button>
                                    {firm.currentUserMembershipStatus === 'active' ? (
                                        <div className="flex-1 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-250 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 font-bold">
                                            <CheckCircle size={12} className="text-emerald-600" /> Member
                                        </div>
                                    ) : firm.currentUserMembershipStatus === 'requested' ? (
                                        <div className="flex-1 py-2.5 bg-amber-50/50 text-amber-700 border border-amber-250 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 font-bold">
                                            Requested
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setConfirmModal({
                                                isOpen: true,
                                                ownerId: firm.id,
                                                neededRoles: neededRoleStrings,
                                                firmName: firm.firm_name || firm.name,
                                            })}
                                            disabled={requestingId === firm.id || !isEligible}
                                            className={`flex-1 py-2.5 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 shadow-md ${
                                                isEligible 
                                                    ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20' 
                                                    : 'bg-slate-300 cursor-not-allowed shadow-none'
                                            }`}
                                            title={isEligible ? 'Send join request' : `Not seeking ${roleLabel(user?.role_type || '')}`}
                                        >
                                            {requestingId === firm.id ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <Send size={12} />
                                            )}
                                            {isEligible ? 'Join Request' : 'Not Hiring'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title="Send Join Request"
                description={`Are you sure you want to apply to join "${confirmModal.firmName}" as a ${roleLabel(user?.role_type || '')}?`}
                confirmText="Apply Now"
                cancelText="Cancel"
                variant="info"
                isLoading={requestingId !== null}
                onConfirm={async () => {
                    if (confirmModal.ownerId) {
                        await handleRequestJoin(confirmModal.ownerId, confirmModal.neededRoles);
                    }
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                }}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}

/* ─── My Firms List (firms I belong to) ─── */

interface MyFirmsListProps {
    onOpenChat: (user: { id: number }) => void;
    onViewSquad: (ownerId: number) => void;
}

function MyFirmsList({ onOpenChat, onViewSquad }: MyFirmsListProps) {
    const [firms, setFirms] = useState<MyFirmEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        axios.get<{ data: MyFirmEntry[] }>('/firm-members/my-firms')
            .then(res => setFirms(res.data?.data || []))
            .catch(() => setFirms([]))
            .finally(() => setIsLoading(false));
    }, []);

    const roleLabel = (r: string) => r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const groupedFirms = React.useMemo(() => {
        const map = new Map<number, {
            firm_owner_id: number;
            firm_owner: MyFirmEntry['firm_owner'];
            roles: string[];
        }>();

        firms.forEach(f => {
            const ownerId = f.firm_owner_id;
            if (!map.has(ownerId)) {
                map.set(ownerId, {
                    firm_owner_id: ownerId,
                    firm_owner: f.firm_owner,
                    roles: []
                });
            }
            const grouped = map.get(ownerId)!;
            if (!grouped.roles.includes(f.role_in_firm)) {
                grouped.roles.push(f.role_in_firm);
            }
        });

        return Array.from(map.values());
    }, [firms]);

    if (isLoading) {
        return <div className="text-center py-12 text-slate-400 text-sm font-bold">Loading firms...</div>;
    }

    if (firms.length === 0) {
        return (
            <div className="text-center py-16 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <Building2 size={40} className="mx-auto mb-4 text-slate-300" />
                <p className="text-sm font-bold text-slate-500">You haven't joined any squads yet.</p>
                <p className="text-xs text-slate-400 mt-1">
                    Accept invitations from architects or contractors, or find open squads looking to hire.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groupedFirms.map(gf => (
                <div key={gf.firm_owner_id} className="p-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-indigo-200 transition-all flex flex-col justify-between h-full">
                    <div>
                        <div className="flex items-start gap-3">
                            <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-sm shrink-0">
                                {gf.firm_owner.pic ? (
                                    <img src={gf.firm_owner.pic} alt="" className="w-full h-full rounded-xl object-cover" />
                                ) : (
                                    gf.firm_owner.name.charAt(0).toUpperCase()
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h5 className="text-sm font-black text-slate-900 truncate">{gf.firm_owner.name}</h5>
                                {gf.firm_owner.company_name && (
                                    <p className="text-[10px] text-slate-500 font-bold truncate">{gf.firm_owner.company_name}</p>
                                )}
                                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                                    {roleLabel(gf.firm_owner.role_type)} Firm
                                </p>
                            </div>
                        </div>

                        {/* Active Roles/Capabilities list */}
                        <div className="mt-4 space-y-1.5">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">My Active Roles</p>
                            <div className="flex flex-wrap gap-1">
                                {gf.roles.map((role, idx) => (
                                    <span key={idx} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[8px] font-black uppercase tracking-wider rounded border border-indigo-100/50">
                                        {roleLabel(role)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 mt-4 pt-3 border-t border-slate-50">
                        <button
                            onClick={() => onViewSquad(gf.firm_owner_id)}
                            className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5"
                        >
                            <Eye size={12} /> View Squad
                        </button>
                        <button
                            onClick={() => onOpenChat({ id: gf.firm_owner_id })}
                            className="flex-1 py-2 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5"
                        >
                            <MessageSquare size={12} /> Chat
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
