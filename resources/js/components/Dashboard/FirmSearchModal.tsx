import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { X, Search, UserPlus, Loader2, ArrowDownAZ, ArrowUpZA, Hash, TrendingUp } from 'lucide-react';
import { ContractorSubspecialty } from '../../types/sub_professional.types';
import { getApiErrorMessage } from '../../utils/apiError';

interface FirmSearchModalProps {
    userRoleType: string;
    onClose: () => void;
    onInvited: () => void;
}

interface SearchResult {
    id: number;
    name: string;
    unique_code: string;
    role_type: string;
    pic: string | null;
}

export default function FirmSearchModal({ userRoleType, onClose, onInvited }: FirmSearchModalProps) {
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<'a-z' | 'z-a'>('a-z');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);
    const [invitingId, setInvitingId] = useState<number | null>(null);
    const [subspecialties, setSubspecialties] = useState<ContractorSubspecialty[]>([]);
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
    const [rolePickerId, setRolePickerId] = useState<number | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    const isContractor = userRoleType === 'kontraktor';
    const architectRoles = [
        { value: 'structural', label: 'Structural Engineer' },
        { value: 'mep', label: 'MEP Engineer' },
        { value: 'interior', label: 'Interior Designer' },
    ];

    // Load subspecialties for contractors
    useEffect(() => {
        if (isContractor) {
            axios.get<{ data: ContractorSubspecialty[] }>('/contractor-subspecialties')
                .then(res => setSubspecialties(res.data?.data || []))
                .catch((err) => { console.warn(getApiErrorMessage(err, 'Failed to load subspecialties')); });
        }
    }, [isContractor]);

    // Load suggestions on mount
    useEffect(() => {
        setIsLoadingSuggestions(true);
        axios.get<{ data: SearchResult[] }>('/firm-members/suggestions')
            .then(res => setSuggestions(res.data?.data || []))
            .catch(() => setSuggestions([]))
            .finally(() => setIsLoadingSuggestions(false));
    }, []);

    // Search with debounce
    useEffect(() => {
        if (query.length < 2) { setResults([]); return; }
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await axios.post<{ data: SearchResult[] }>('/firm-members/search', { query, sort });
                setResults(res.data?.data || []);
            } catch { setResults([]); }
            finally { setIsSearching(false); }
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [query, sort]);

    const handleInvite = async (userId: number) => {
        if (selectedRoles.length === 0) return;
        setInvitingId(userId);
        try {
            await axios.post('/firm-members/invite', { member_user_id: userId, roles_in_firm: selectedRoles });
            onInvited();
            setRolePickerId(null);
            setSelectedRoles([]);
            setResults(prev => prev.filter(r => r.id !== userId));
            setSuggestions(prev => prev.filter(r => r.id !== userId));
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to invite';
            alert(msg);
        } finally { setInvitingId(null); }
    };

    const roleOptions = isContractor
        ? subspecialties.map(s => ({ value: s.slug, label: s.label }))
        : architectRoles;

    const roleLabel = (rt: string) => {
        const map: Record<string, string> = { structural: 'Structural', mep: 'MEP', interior: 'Interior', kontraktor: 'Contractor' };
        return map[rt] || rt;
    };

    // Show suggestions when no query, show search results when query >= 2
    const showingSuggestions = query.length < 2;
    const displayList = showingSuggestions ? suggestions : results;
    const isLoading = showingSuggestions ? isLoadingSuggestions : isSearching;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="p-6 pb-4 flex items-center justify-between border-b border-slate-100">
                    <div>
                        <h3 className="text-lg font-black text-slate-900">Find & Invite</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Search by name or unique code</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 rounded-xl hover:bg-slate-50 transition-all">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text" value={query} onChange={e => setQuery(e.target.value)}
                                placeholder="Name or code (e.g. A3K9X2)"
                                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-slate-300 outline-none transition-all"
                                autoFocus
                            />
                        </div>
                        <button
                            onClick={() => setSort(s => s === 'a-z' ? 'z-a' : 'a-z')}
                            className="px-3 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-slate-500 hover:bg-slate-100 transition-all"
                            title={`Sort ${sort === 'a-z' ? 'Z-A' : 'A-Z'}`}
                        >
                            {sort === 'a-z' ? <ArrowDownAZ size={18} /> : <ArrowUpZA size={18} />}
                        </button>
                    </div>

                    {/* Section label */}
                    {showingSuggestions && !isLoading && displayList.length > 0 && (
                        <div className="flex items-center gap-2 text-[10px] font-black text-amber-600 uppercase tracking-widest">
                            <TrendingUp size={12} />
                            Suggested for You
                        </div>
                    )}

                    <div className="max-h-[300px] overflow-y-auto space-y-2">
                        {isLoading ? (
                            <div className="text-center py-8 text-slate-400 text-sm font-bold flex items-center justify-center gap-2">
                                <Loader2 size={16} className="animate-spin" /> {showingSuggestions ? 'Loading suggestions...' : 'Searching...'}
                            </div>
                        ) : displayList.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-sm font-bold">
                                {showingSuggestions ? 'No suggestions available.' : 'No professionals found.'}
                            </div>
                        ) : (
                            displayList.map(r => (
                                <ResultCard
                                    key={r.id}
                                    result={r}
                                    roleLabel={roleLabel}
                                    rolePickerId={rolePickerId}
                                    setRolePickerId={setRolePickerId}
                                    selectedRoles={selectedRoles}
                                    setSelectedRoles={setSelectedRoles}
                                    roleOptions={roleOptions}
                                    invitingId={invitingId}
                                    onInvite={handleInvite}
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Extracted Result Card ─── */

interface ResultCardProps {
    result: SearchResult;
    roleLabel: (rt: string) => string;
    rolePickerId: number | null;
    setRolePickerId: (id: number | null) => void;
    selectedRoles: string[];
    setSelectedRoles: (roles: string[]) => void;
    roleOptions: { value: string; label: string }[];
    invitingId: number | null;
    onInvite: (userId: number) => void;
}

function ResultCard({ result: r, roleLabel, rolePickerId, setRolePickerId, selectedRoles, setSelectedRoles, roleOptions, invitingId, onInvite }: ResultCardProps) {
    const isPicking = rolePickerId === r.id;

    const toggleRole = (val: string) => {
        if (selectedRoles.includes(val)) {
            setSelectedRoles(selectedRoles.filter(v => v !== val));
        } else {
            setSelectedRoles([...selectedRoles, val]);
        }
    };

    return (
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-sm shrink-0">
                        {r.pic ? <img src={r.pic} alt="" className="w-full h-full rounded-xl object-cover" /> : r.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h5 className="text-sm font-black text-slate-900">{r.name}</h5>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">{roleLabel(r.role_type)}</span>
                            <span className="text-[9px] font-mono text-slate-400 flex items-center gap-0.5"><Hash size={8} />{r.unique_code}</span>
                        </div>
                    </div>
                </div>

                {!isPicking && (
                    <button
                        onClick={() => { setRolePickerId(r.id); setSelectedRoles([]); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all"
                    >
                        <UserPlus size={12} /> Invite
                    </button>
                )}
            </div>

            {isPicking && (
                <div className="mt-4 pt-3 border-t border-slate-200">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Select Roles for Firm</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                        {roleOptions.map(ro => {
                            const selected = selectedRoles.includes(ro.value);
                            return (
                                <button
                                    key={ro.value}
                                    onClick={() => toggleRole(ro.value)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
                                        selected 
                                            ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500' 
                                            : 'bg-white text-slate-500 border border-slate-200 hover:border-indigo-300'
                                    }`}
                                >
                                    {ro.label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => { setRolePickerId(null); setSelectedRoles([]); }}
                            className="px-3 py-1.5 bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-300 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onInvite(r.id)}
                            disabled={selectedRoles.length === 0 || invitingId === r.id}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50"
                        >
                            {invitingId === r.id ? <Loader2 size={12} className="animate-spin" /> : 'Send Invite'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
