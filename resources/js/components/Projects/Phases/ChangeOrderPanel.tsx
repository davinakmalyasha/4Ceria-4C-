import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    FileText, Plus, AlertCircle, Check, X, 
    ChevronDown, ChevronUp, DollarSign, Clock, MessageSquare, Layers 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../../context/ToastContext';
import { ChangeOrder } from '../../../types/phase.types';

interface ChangeOrderPanelProps {
    project: any;
    isPM: boolean;
    isOwner: boolean;
    isPro: boolean;
}

export default function ChangeOrderPanel({ project, isPM, isOwner, isPro }: ChangeOrderPanelProps) {
    const [orders, setOrders] = useState<ChangeOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const { showToast } = useToast();

    // Form State
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [costImpact, setCostImpact] = useState('');
    const [timeImpact, setTimeImpact] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchOrders = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/change-orders`);
            setOrders(res.data.data);
        } catch (err) {
            console.error('Failed to fetch change orders');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchOrders(); }, [project.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/change-orders`, {
                title,
                description,
                cost_impact: costImpact,
                time_impact_days: timeImpact || 0,
            });
            showToast('Change order submitted for review.', 'success');
            setShowForm(false);
            setTitle('');
            setDescription('');
            setCostImpact('');
            setTimeImpact('');
            fetchOrders();
        } catch (err) {
            showToast('Failed to submit change order.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handlePMReview = async (id: number | string, action: 'approve' | 'reject') => {
        const notes = window.prompt(`Enter ${action} notes for Owner review:`);
        if (notes === null) return;
        
        // Strip prefix if string
        const cleanId = typeof id === 'string' ? id.replace('co-', '') : id;

        try {
            await axios.post(`/projects/${project.id}/change-orders/${cleanId}/pm-review`, {
                pm_notes: notes,
                action
            });
            showToast('Change order review submitted.', 'success');
            fetchOrders();
        } catch (err) {
            showToast('Failed to review change order.', 'error');
        }
    };

    const handleOwnerDecide = async (id: number | string, action: 'approve' | 'reject') => {
        const notes = window.prompt(`Enter feedback for professional:`);
        if (notes === null) return;

        // Strip prefix if string
        const cleanId = typeof id === 'string' ? id.replace('co-', '') : id;

        try {
            await axios.post(`/projects/${project.id}/change-orders/${cleanId}/owner-decide`, {
                owner_notes: notes,
                action
            });
            showToast('Decision recorded.', 'success');
            fetchOrders();
        } catch (err) {
            showToast('Failed to record decision.', 'error');
        }
    };

    if (loading) return <div className="py-10 text-center animate-pulse text-[10px] font-black uppercase text-slate-400">Loading Change Orders...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        <FileText size={18} className="text-slate-500" />
                        Change Order Log
                    </h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tracking scope & budget adjustments</p>
                </div>
                {isPro && !showForm && (
                    <button 
                        onClick={() => setShowForm(true)}
                        className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg"
                    >
                        <Plus size={14} className="inline mr-1" /> Propose Change
                    </button>
                )}
            </div>

            {showForm && (
                <motion.form 
                    initial={{ opacity: 0, y: -20 }} 
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={handleSubmit} 
                    className="bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-6 space-y-4"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Title</label>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Tile Upgrade B1-B5" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black outline-none focus:border-slate-900" required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cost Impact (Rp)</label>
                                <input type="number" value={costImpact} onChange={e => setCostImpact(e.target.value)} placeholder="500000" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black outline-none focus:border-slate-900" required />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Time Impact (Days)</label>
                                <input type="number" value={timeImpact} onChange={e => setTimeImpact(e.target.value)} placeholder="2" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black outline-none focus:border-slate-900" />
                            </div>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Justification</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Explain why this change is necessary..." className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-slate-900 min-h-[80px]" required />
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" disabled={submitting} className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Submit Proposal</button>
                        <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 bg-white border border-slate-200 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancel</button>
                    </div>
                </motion.form>
            )}

            <div className="space-y-3">
                {orders.length === 0 ? (
                    <div className="py-12 text-center bg-slate-50 border-2 border-dashed border-slate-100 rounded-[2rem]">
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No change orders recorded</p>
                    </div>
                ) : (
                    orders.map(order => (
                        <div key={order.id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                            <button 
                                onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-all"
                            >
                                <div className="flex items-center gap-4 text-left">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                        order.status === 'owner_approved' ? 'bg-emerald-100 text-emerald-600' :
                                        order.status === 'rejected' ? 'bg-red-100 text-red-600' :
                                        'bg-amber-100 text-amber-600'
                                    }`}>
                                        <AlertCircle size={18} />
                                    </div>
                                    <div>
                                        <h5 className="text-xs font-black text-slate-900">{order.title}</h5>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            {(order.status || 'proposed').replace('_', ' ')} • By {order.requester?.name} {order.role_type && `(${order.role_type})`}
                                            {order.milestone_id && (
                                                <span className="flex items-center gap-1 text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                                                    <Layers size={8} /> Milestone #{order.milestone_id}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-right hidden md:block">
                                        <p className="text-xs font-black text-slate-900">Rp {Number(order.cost_impact).toLocaleString('id-ID')}</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cost Impact</p>
                                    </div>
                                    {expandedId === order.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </div>
                            </button>

                            <AnimatePresence>
                                {expandedId === order.id && (
                                    <motion.div 
                                        initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                                        className="overflow-hidden bg-slate-50/50"
                                    >
                                        <div className="p-4 pt-0 space-y-4">
                                            <div className="p-4 bg-white border border-slate-100 rounded-xl text-xs text-slate-600 font-medium">
                                                {order.description}
                                            </div>
                                            
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                                    <DollarSign size={14} className="text-emerald-500" />
                                                    <span>Impact: Rp {Number(order.cost_impact).toLocaleString('id-ID')}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                                    <Clock size={14} className="text-slate-500" />
                                                    <span>Extension: {order.time_impact_days} Days</span>
                                                </div>
                                            </div>

                                            {/* Review Notes Section */}
                                            <div className="space-y-2">
                                                {order.pm_notes && (
                                                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1 flex items-center gap-1">
                                                            <Check size={10} /> PM Review Note
                                                        </p>
                                                        <p className="text-xs font-medium text-slate-700 italic">"{order.pm_notes}"</p>
                                                    </div>
                                                )}
                                                {order.owner_notes && (
                                                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                                                        <p className="text-[9px] font-black uppercase text-emerald-400 tracking-widest mb-1 flex items-center gap-1">
                                                            <MessageSquare size={10} /> Owner Response
                                                        </p>
                                                        <p className="text-xs font-medium text-emerald-700 italic">"{order.owner_notes}"</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Buttons (Only for real Change Orders) */}
                                            {order.type !== 'addendum' && isPM && order.status === 'proposed' && (
                                                <div className="flex gap-2 pt-2 border-t border-slate-100">
                                                    <button onClick={() => handlePMReview(order.id, 'approve')} className="flex-1 py-3 bg-zinc-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-colors">Approve & Forward to Owner</button>
                                                    <button onClick={() => handlePMReview(order.id, 'reject')} className="px-6 py-3 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest">Reject</button>
                                                </div>
                                            )}
                                            
                                            {order.type !== 'addendum' && isOwner && order.status === 'pm_reviewed' && (
                                                <div className="flex gap-2 pt-2 border-t border-slate-100">
                                                    <button onClick={() => handleOwnerDecide(order.id, 'approve')} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors">Authorize Budget Increase</button>
                                                    <button onClick={() => handleOwnerDecide(order.id, 'reject')} className="px-6 py-3 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest">Decline</button>
                                                </div>
                                            )}

                                            {order.type === 'addendum' && (
                                                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 opacity-60">
                                                    <div className="px-2 py-1 bg-slate-100 rounded text-[8px] font-black uppercase tracking-widest text-slate-500">Negotiated via Financial Hub</div>
                                                    <span className="text-[8px] font-medium text-slate-400 italic">This adjustment was handled through the specialized negotiation workflow.</span>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
