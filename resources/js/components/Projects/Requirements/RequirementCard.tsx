import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Trash2, ShoppingCart, History, AlertTriangle, 
    CheckCircle2, Plus, Minus, Loader2, Calendar, User, Clock, Image as ImageIcon, FileText, Pencil
} from 'lucide-react';
import axios from 'axios';

interface RequirementCardProps {
    project: any;
    req: any;
    onDelete: (id: number) => void;
    onEdit?: () => void;
    onOpenLogModal: (mode: 'restock' | 'use', requirement: any) => void;
    folders?: any[];
    onMoveToFolder?: (requirementId: number, folderId: number | null) => void;
    canMutate?: boolean;
}

export default function RequirementCard({
    project, req, onDelete, onEdit, onOpenLogModal, folders = [], onMoveToFolder, canMutate = false
}: RequirementCardProps) {
    const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
    const [historyLogs, setHistoryLogs] = useState<any[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    const onSite = Number(req.quantity_on_site || 0);
    const used = Number(req.quantity_used || 0);
    const required = Number(req.quantity_required || 0);
    const totalProcured = onSite + used;
    
    const progOnSite = Math.min(Math.round((totalProcured / required) * 100), 100);
    const progUsed = Math.min(Math.round((used / required) * 100), 100);
    const isShortage = totalProcured < required;

    const toggleHistory = async () => {
        if (!isHistoryExpanded) {
            setIsHistoryLoading(true);
            try {
                const res = await axios.get(`/projects/${project.id}/requirements/${req.id}/history`);
                setHistoryLogs(res.data.data || []);
            } catch (err) {
                console.error('Failed to load requirement logs', err);
            } finally {
                setIsHistoryLoading(false);
            }
        }
        setIsHistoryExpanded(!isHistoryExpanded);
    };

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:scale-[1.01] transition-all group relative overflow-hidden flex flex-col h-full cursor-grab active:cursor-grabbing"
            draggable={true}
            onDragStart={(e) => {
                e.dataTransfer.setData('requirementId', req.id.toString());
                e.dataTransfer.effectAllowed = 'move';
            }}
        >
            <div className={`absolute top-0 right-0 w-32 h-32 blur-[80px] opacity-10 rounded-full translate-x-12 -translate-y-12 ${isShortage ? 'bg-red-500' : 'bg-slate-500'}`} />

            {/* Author Header */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between z-10 relative">
                <div className="flex items-center gap-2 text-slate-500">
                    <User size={10} className="text-slate-400" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Added by {req.user?.name || 'Unknown'} ({req.user?.role_type || 'N/A'})</span>
                    <span className="text-[9px] font-bold mx-1 opacity-50">•</span>
                    <span className="text-[9px] font-bold opacity-70 flex items-center gap-1">
                        <Clock size={10} /> {new Date(req.created_at).toLocaleDateString()}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {canMutate && onEdit && (
                        <button 
                            onClick={onEdit}
                            className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-500 transition-all rounded-lg hover:bg-slate-50"
                            title="Edit Material"
                        >
                            <Pencil size={12} />
                        </button>
                    )}
                    {canMutate && (
                        <button 
                            onClick={() => onDelete(req.id)}
                            className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all rounded-lg hover:bg-red-50"
                            title="Delete Material"
                        >
                            <Trash2 size={12} />
                        </button>
                    )}
                </div>
            </div>

            <div className="p-6 md:p-8 flex-1 flex flex-col relative z-10">
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h4 className="text-md md:text-lg font-black text-slate-900 tracking-tight leading-tight">{req.name}</h4>
                            {progUsed === 100 && <CheckCircle2 className="text-emerald-500" size={16} />}
                            {req.quality_level && (
                                <span className="text-[8px] font-black tracking-widest uppercase bg-slate-100 px-2 py-0.5 rounded text-slate-500">
                                    {req.quality_level}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                                {req.quantity_required} {req.unit}
                            </span>
                            {req.estimated_unit_cost && (
                                <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                                    Rp {Number(req.estimated_unit_cost).toLocaleString()} / {req.unit}
                                </span>
                            )}
                            {isShortage && (
                                <span className="text-[8px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded">
                                    <AlertTriangle size={10} /> Shortage
                                </span>
                            )}
                        </div>
                        {req.estimated_unit_cost && (
                            <div className="mt-1">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                    Total Est: Rp {(Number(req.quantity_required) * Number(req.estimated_unit_cost)).toLocaleString()}
                                </span>
                            </div>
                        )}
                    </div>
                    {(req.image_url || req.image_path) && (
                        <button 
                            onClick={() => setIsImageModalOpen(true)}
                            className="w-16 h-16 rounded-2xl border-2 border-slate-100 overflow-hidden shadow-sm hover:scale-105 transition-transform"
                        >
                            <img src={req.image_url || `/storage/${req.image_path}`} alt={req.name} className="w-full h-full object-cover" />
                        </button>
                    )}
                </div>

                {req.purpose && (
                    <div className="mb-4 p-3 bg-slate-50/50 rounded-xl border border-slate-100/50 flex items-start gap-2">
                        <FileText size={14} className="text-slate-400 mt-0.5 shrink-0" />
                        <div>
                            <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Purpose / Why</span>
                            <p className="text-[10px] text-slate-900 font-medium leading-relaxed">{req.purpose}</p>
                        </div>
                    </div>
                )}

                {/* Progress Meters */}
                <div className="space-y-4 mb-6 mt-auto">
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-end">
                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">Procured Progress</span>
                            <span className="text-[10px] font-black text-slate-900">
                                {totalProcured} / {required} {req.unit} ({progOnSite}%)
                            </span>
                        </div>
                        <div className="h-2.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100 p-0.5">
                            <div style={{ width: `${progOnSite}%` }} className="h-full bg-gradient-to-r from-slate-500 to-slate-500 rounded-full shadow-sm transition-all duration-500" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex justify-between items-end">
                            <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest italic">Usage On Site</span>
                            <span className="text-[10px] font-black text-slate-900">
                                {used} consumed ({progUsed}%)
                            </span>
                        </div>
                        <div className="h-2.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100 p-0.5">
                            <div style={{ width: `${progUsed}%` }} className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full shadow-sm transition-all duration-500" />
                        </div>
                    </div>
                </div>

                {/* Quick Actions Hub */}
                <div className="flex flex-wrap items-center gap-2 justify-between">
                    {canMutate && (
                        <div className="flex items-center gap-1.5">
                            <button 
                                onClick={() => onOpenLogModal('restock', req)}
                                className="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl transition-colors flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-wider shadow-sm"
                                title="Restock / Add Quantity"
                            >
                                <Plus size={12} /> Restock
                            </button>
                            <button 
                                onClick={() => onOpenLogModal('use', req)}
                                disabled={onSite <= 0}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 p-2.5 rounded-xl transition-colors flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-wider disabled:opacity-40 disabled:pointer-events-none shadow-sm"
                                title="Use / Deduct Quantity"
                            >
                                <Minus size={12} /> Use Stock
                            </button>
                        </div>
                    )}

                    <div className="flex items-center gap-1.5">
                        <button 
                            onClick={toggleHistory}
                            className={`p-2.5 rounded-xl border text-[9px] font-black uppercase tracking-widest flex items-center gap-1 transition-all shadow-sm ${isHistoryExpanded ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300'}`}
                        >
                            <History size={12} /> History
                        </button>
                        <a 
                            href={`/marketplace?search=${encodeURIComponent(req.name)}`}
                            className="bg-white border border-slate-100 text-slate-700 hover:border-red-500 hover:text-red-500 p-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1 shadow-sm"
                        >
                            <ShoppingCart size={12} /> Buy
                        </a>
                    </div>
                </div>

                {/* Collapsible Local History Logs */}
                <AnimatePresence>
                    {isHistoryExpanded && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-5 pt-5 border-t border-slate-50 overflow-hidden"
                        >
                            <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Inventory Log History</h5>
                            
                            {isHistoryLoading ? (
                                <div className="flex justify-center py-4">
                                    <Loader2 className="animate-spin text-slate-300" size={16} />
                                </div>
                            ) : historyLogs.length === 0 ? (
                                <p className="text-[10px] text-slate-400 italic">No transaction records found for this material.</p>
                            ) : (
                                <div className="space-y-3.5 pl-2 relative border-l border-slate-100 ml-1 mt-2">
                                    {historyLogs.map((log: any) => {
                                        const isRestock = log.type === 'restock';
                                        return (
                                            <div key={log.id} className="relative group/log">
                                                {/* Dot indicator */}
                                                <div className={`absolute -left-[13px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white ${isRestock ? 'bg-slate-500 shadow-slate-100 shadow' : 'bg-emerald-500 shadow-emerald-100 shadow'}`} />
                                                
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1">
                                                        <span className={`inline-block text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded mr-2 ${isRestock ? 'bg-slate-50 text-slate-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                            {isRestock ? '+' : '-'}{log.quantity} {req.unit}
                                                        </span>
                                                        <span className="text-[9px] text-slate-400 font-bold">by {log.user?.name || 'Unknown'}</span>
                                                        {log.notes && <p className="text-[10px] text-slate-600 font-medium mt-0.5 leading-relaxed">{log.notes}</p>}
                                                    </div>
                                                    <span className="text-[8px] text-slate-400 font-bold whitespace-nowrap mt-0.5 flex items-center gap-1">
                                                        <Clock size={8} /> {new Date(log.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {req.notes && !isHistoryExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-50 flex items-start gap-2 italic">
                        <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                            <span className="font-black uppercase not-italic text-[8px] tracking-wider text-slate-300 mr-1.5">Note:</span>
                            {req.notes}
                        </p>
                    </div>
                )}
            </div>

            {/* Image Viewer Modal */}
            <AnimatePresence>
                {isImageModalOpen && (req.image_url || req.image_path) && (
                    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4" onClick={() => setIsImageModalOpen(false)}>
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-[2rem] p-2 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <img src={req.image_url || `/storage/${req.image_path}`} alt={req.name} className="w-full h-auto max-h-[80vh] object-contain rounded-[1.5rem]" />
                            <button onClick={() => setIsImageModalOpen(false)} className="absolute top-4 right-4 bg-black/50 hover:bg-black text-white p-3 rounded-full backdrop-blur-md transition-all">
                                <Minus size={20} className="rotate-45" /> {/* Use minus rotated 45 as close icon if X not available */}
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
