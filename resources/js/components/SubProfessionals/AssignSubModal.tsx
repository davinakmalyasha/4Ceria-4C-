import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Search, UserPlus, Loader2, FileText } from 'lucide-react';
import { ContractorSubspecialty, ParentRole } from '../../types/sub_professional.types';

interface AssignSubModalProps {
    parentRole: ParentRole;
    subspecialties: ContractorSubspecialty[];
    availableProfessionals: Array<{ id: number; user_id: number; name: string; spesialisasi?: string }>;
    isSubmitting: boolean;
    onAssign: (userId: number, subRole: string, scopeNotes: string) => void;
    onClose: () => void;
}

const ARCHITECT_SUB_ROLES = [
    { slug: 'structural', label: 'Structural Engineer' },
    { slug: 'mep', label: 'MEP Engineer' },
];

export default function AssignSubModal({
    parentRole, subspecialties, availableProfessionals, isSubmitting, onAssign, onClose,
}: AssignSubModalProps): React.ReactElement {
    const [search, setSearch] = useState('');
    const [selectedRole, setSelectedRole] = useState('');
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [scopeNotes, setScopeNotes] = useState('');

    const roleOptions = useMemo(() => {
        if (parentRole === 'arsitek') return ARCHITECT_SUB_ROLES;
        return subspecialties.map(s => ({ slug: s.slug, label: s.label }));
    }, [parentRole, subspecialties]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return availableProfessionals.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.spesialisasi || '').toLowerCase().includes(q)
        );
    }, [availableProfessionals, search]);

    const handleSubmit = () => {
        if (!selectedUserId || !selectedRole) return;
        onAssign(selectedUserId, selectedRole, scopeNotes);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 flex flex-col max-h-[85vh]">
                <div className="relative h-24 bg-gradient-to-br from-gray-900 to-gray-800 p-5 flex items-end">
                    <div className="absolute right-0 top-0 w-28 h-28 bg-[#FF2D20] rounded-full blur-[50px] opacity-30 mix-blend-screen" />
                    <button onClick={onClose} className="absolute top-3 right-3 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md">
                        <X size={14} />
                    </button>
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                            <UserPlus size={18} className="text-white" />
                        </div>
                        <div className="text-white">
                            <h3 className="font-extrabold text-lg leading-tight">Assign Sub-Professional</h3>
                            <p className="text-gray-300 text-xs">{parentRole === 'arsitek' ? 'Design Consultant' : 'Build Specialist'}</p>
                        </div>
                    </div>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto flex-1">
                    {/* Role Selector */}
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-2">Sub-Role</label>
                        <div className="flex flex-wrap gap-2">
                            {roleOptions.map(r => (
                                <button key={r.slug} type="button" onClick={() => setSelectedRole(r.slug)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${selectedRole === r.slug ? 'border-[#FF2D20] bg-red-50 text-[#FF2D20]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search professionals..."
                            className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-[#FF2D20] focus:ring-2 focus:ring-red-100 outline-none transition-all" />
                    </div>

                    {/* Professional List */}
                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                        {filtered.length === 0 ? (
                            <p className="text-center text-xs text-gray-400 py-6">No professionals found.</p>
                        ) : filtered.map(p => (
                            <div key={p.id} onClick={() => setSelectedUserId(p.user_id)}
                                className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 ${selectedUserId === p.user_id ? 'border-[#FF2D20] bg-red-50/50 shadow-[0_0_0_3px_rgba(255,45,32,0.1)]' : 'border-gray-100 hover:border-gray-200'}`}>
                                <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-black text-zinc-600 shrink-0">
                                    {p.name.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-900 truncate">{p.name}</p>
                                    <p className="text-[11px] text-gray-400 truncate">{p.spesialisasi || 'Specialist'}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Scope Notes */}
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                            <FileText size={12} className="text-[#FF2D20]" /> Scope Notes (Optional)
                        </label>
                        <textarea value={scopeNotes} onChange={e => setScopeNotes(e.target.value)} rows={2} placeholder="Describe the work scope..."
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-[#FF2D20] focus:ring-2 focus:ring-red-100 outline-none resize-none transition-all" />
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100">
                    <button onClick={handleSubmit} disabled={!selectedUserId || !selectedRole || isSubmitting}
                        className="w-full py-3 bg-gray-900 hover:bg-[#FF2D20] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2">
                        {isSubmitting ? <><Loader2 size={16} className="animate-spin" /> Assigning...</> : <><UserPlus size={16} /> Assign to Project</>}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
