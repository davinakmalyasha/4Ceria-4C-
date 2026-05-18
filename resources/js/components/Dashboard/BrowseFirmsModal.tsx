import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Search, Send, Loader2, Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

interface BrowseFirmsModalProps {
    onClose: () => void;
}

interface FirmOwner {
    id: number;
    name: string;
    role_type: string;
    pic: string | null;
}

export default function BrowseFirmsModal({ onClose }: BrowseFirmsModalProps) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<FirmOwner[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [requestingId, setRequestingId] = useState<number | null>(null);

    // Search architects and contractors
    useEffect(() => {
        if (query.length < 2) { setResults([]); return; }
        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await axios.get<{ data: FirmOwner[] }>('/firm-members/browse-owners', {
                    params: { query },
                });
                setResults(res.data?.data || []);
            } catch {
                setResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    const handleRequestJoin = async (ownerId: number) => {
        if (!user) return;
        setRequestingId(ownerId);
        try {
            await axios.post('/firm-members/request-join', {
                firm_owner_id: ownerId,
                role_in_firm: user.role_type,
            });
            showToast('Join request sent!', 'success');
            setResults(prev => prev.filter(r => r.id !== ownerId));
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to send request';
            showToast(msg, 'error');
        } finally {
            setRequestingId(null);
        }
    };

    const roleLabel = (rt: string) => {
        const map: Record<string, string> = { arsitek: 'Architect', kontraktor: 'Contractor' };
        return map[rt] || rt;
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden">
                <div className="p-6 pb-4 flex items-center justify-between border-b border-slate-100">
                    <div>
                        <h3 className="text-lg font-black text-slate-900">Browse Firms</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            Find an architect or contractor to join
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 rounded-xl hover:bg-slate-50 transition-all">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="relative">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text" value={query} onChange={e => setQuery(e.target.value)}
                            placeholder="Search by name..."
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-slate-300 outline-none transition-all"
                            autoFocus
                        />
                    </div>

                    <div className="max-h-[300px] overflow-y-auto space-y-2">
                        {isSearching ? (
                            <div className="text-center py-8 text-slate-400 text-sm font-bold flex items-center justify-center gap-2">
                                <Loader2 size={16} className="animate-spin" /> Searching...
                            </div>
                        ) : results.length === 0 && query.length >= 2 ? (
                            <div className="text-center py-8 text-slate-400 text-sm font-bold">No firms found.</div>
                        ) : query.length < 2 ? (
                            <div className="text-center py-8 text-slate-300">
                                <Building2 size={32} className="mx-auto mb-3" />
                                <p className="text-sm font-bold text-slate-400">Type at least 2 characters to search</p>
                            </div>
                        ) : (
                            results.map(r => (
                                <div key={r.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-sm">
                                                {r.pic ? (
                                                    <img src={r.pic} alt="" className="w-full h-full rounded-xl object-cover" />
                                                ) : (
                                                    r.name.charAt(0).toUpperCase()
                                                )}
                                            </div>
                                            <div>
                                                <h5 className="text-sm font-black text-slate-900">{r.name}</h5>
                                                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                                                    {roleLabel(r.role_type)} Firm
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleRequestJoin(r.id)}
                                            disabled={requestingId === r.id}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50"
                                        >
                                            {requestingId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                            Request
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
