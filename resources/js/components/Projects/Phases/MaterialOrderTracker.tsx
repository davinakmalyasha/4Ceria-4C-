import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    Package, Truck, CheckCircle, Clock, AlertTriangle, 
    ExternalLink, MessageCircle, ChevronDown, ChevronUp,
    AlertCircle, Check, X, Send, User, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../../context/ToastContext';

interface MaterialOrderTrackerProps {
    project: any;
    currentUser: any;
}

interface OrderItem {
    id: number;
    material: { name: string; unit: string };
    quantity: number;
    price_at_purchase: number;
}

interface Order {
    id: number;
    status: string;
    total_price: number;
    created_at: string;
    supplier?: { business_name: string; user?: { name: string } };
    items: OrderItem[];
    delivery_method?: string;
    tracking_number?: string;
}

interface ProcurementRequest {
    id: number;
    project_id: number;
    requirement_id: number;
    requested_by: number;
    quantity_needed: number;
    estimated_cost: number | null;
    message: string | null;
    offer_to_buy: boolean;
    status: 'pending_pm' | 'pending_owner' | 'authorized' | 'rejected';
    pm_note: string | null;
    created_at: string;
    requirement?: { name: string; unit: string };
    requester?: { name: string; role_type: string };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pending_payment: { label: 'Awaiting Payment', color: 'amber', icon: Clock },
    processing: { label: 'Processing', color: 'blue', icon: Package },
    shipped: { label: 'Shipped', color: 'indigo', icon: Truck },
    delivered: { label: 'Delivered', color: 'emerald', icon: CheckCircle },
    cancelled: { label: 'Cancelled', color: 'red', icon: AlertTriangle },
};

export default function MaterialOrderTracker({ project, currentUser }: MaterialOrderTrackerProps) {
    const [orders, setOrders] = useState<Order[]>([]);
    const [procurementRequests, setProcurementRequests] = useState<ProcurementRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    
    // PM Verification State
    const [verifyingRequest, setVerifyingRequest] = useState<ProcurementRequest | null>(null);
    const [estimatedCost, setEstimatedCost] = useState<string>('');
    const [pmNote, setPmNote] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);

    const { showToast } = useToast();

    const fetchData = async () => {
        try {
            const [ordersRes, requestsRes] = await Promise.all([
                axios.get(`/material-orders`, { params: { project_id: project.id } }),
                axios.get(`/projects/${project.id}/procurement-requests`)
            ]);
            setOrders(ordersRes.data?.data || []);
            setProcurementRequests(requestsRes.data?.data || []);
        } catch (err) {
            console.error('Failed to fetch data', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [project?.id]);

    const handleVerifySubmit = async () => {
        if (!verifyingRequest || !estimatedCost) return;
        setSubmitting(true);
        try {
            await axios.post(`/projects/${project.id}/procurement-requests/${verifyingRequest.id}/verify`, {
                estimated_cost: estimatedCost,
                pm_note: pmNote
            });
            showToast('Request forwarded to Owner for budget approval', 'success');
            setVerifyingRequest(null);
            setEstimatedCost('');
            setPmNote('');
            fetchData();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Verification failed', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRejectRequest = async (requestId: number) => {
        const reason = window.prompt('Enter reason for rejection:');
        if (!reason) return;

        try {
            await axios.post(`/projects/${project.id}/procurement-requests/${requestId}/reject`, {
                pm_note: reason
            });
            showToast('Request rejected', 'success');
            fetchData();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Rejection failed', 'error');
        }
    };

    // Cross-reference BOM vs ordered quantities for shortage detection
    const requirements = project?.requirements || [];
    const orderedQuantities: Record<string, number> = {};
    orders.forEach(order => {
        if (order.status === 'cancelled') return;
        order.items?.forEach(item => {
            const name = item.material?.name || '';
            orderedQuantities[name] = (orderedQuantities[name] || 0) + item.quantity;
        });
    });

    const shortages = requirements.filter((req: any) => {
        const orderedMarketplace = orderedQuantities[req.name] || 0;
        const totalProcured = orderedMarketplace + Number(req.quantity_procured_externally || 0);
        return totalProcured < req.quantity_required;
    });

    const activeOrders = orders.filter(o => o.status !== 'cancelled');
    const marketplaceSpent = activeOrders.reduce((sum, o) => sum + Number(o.total_price || 0), 0);
    const manualSpent = requirements.reduce((sum: number, req: any) => sum + Number(req.external_cost || 0), 0);
    const totalSpent = marketplaceSpent + manualSpent;

    const activeRequests = procurementRequests.filter(r => r.status === 'pending_pm');
    const isPM = currentUser?.role_type === 'project_manager' && project.pm_id === currentUser.id;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* PM PROCUREMENT INBOX */}
            {isPM && activeRequests.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-black text-slate-900">Procurement Inbox</h3>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Review Material Requests from Contractor</p>
                        </div>
                        <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse">
                            {activeRequests.length} Pending Actions
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {activeRequests.map(req => (
                            <motion.div 
                                key={req.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white border-2 border-slate-100 rounded-2xl p-6 shadow-sm hover:border-slate-300 transition-all"
                            >
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 shrink-0">
                                            <Package size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-base font-black text-slate-900">{req.requirement?.name}</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Required: {req.quantity_needed} {req.requirement?.unit}</span>
                                                <span className="w-1 h-1 bg-slate-300 rounded-full" />
                                                <span className="text-xs font-bold text-slate-400">By {req.requester?.name}</span>
                                            </div>
                                            {req.message && (
                                                <div className="mt-3 p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-100 italic">
                                                    "{req.message}"
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {req.offer_to_buy && (
                                            <div className="mr-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                                <Info size={12} />
                                                Offered to Buy
                                            </div>
                                        )}
                                        <button 
                                            onClick={() => setVerifyingRequest(req)}
                                            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black shadow-lg shadow-slate-200 hover:scale-105 transition-transform flex items-center gap-2"
                                        >
                                            <Check size={14} />
                                            Verify & Forward
                                        </button>
                                        <button 
                                            onClick={() => handleRejectRequest(req.id)}
                                            className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Orders</p>
                    <h4 className="text-2xl font-black text-slate-900">{activeOrders.length}</h4>
                </div>
                <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1">Delivered</p>
                    <h4 className="text-2xl font-black text-emerald-700">{orders.filter(o => o.status === 'delivered').length}</h4>
                </div>
                <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-1">In Transit</p>
                    <h4 className="text-2xl font-black text-blue-700">{orders.filter(o => o.status === 'shipped').length}</h4>
                </div>
                <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">Total Spent</p>
                    <h4 className="text-lg font-black text-amber-800">Rp {totalSpent.toLocaleString('id-ID')}</h4>
                </div>
            </div>

            {/* Shortage Alerts */}
            {shortages.length > 0 && (
                <div className="p-5 bg-red-50 border border-red-200 rounded-2xl">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={16} className="text-red-500" />
                        <h4 className="text-xs font-black uppercase tracking-widest text-red-700">Material Shortages Detected</h4>
                    </div>
                    <div className="space-y-2">
                        {shortages.map((req: any) => {
                            const orderedMarketplace = orderedQuantities[req.name] || 0;
                            const totalProcured = orderedMarketplace + Number(req.quantity_procured_externally || 0);
                            const deficit = req.quantity_required - totalProcured;
                            return (
                                <div key={req.id} className="flex items-center justify-between text-xs font-bold text-red-600">
                                    <span>{req.name}</span>
                                    <span>Need {deficit} more {req.unit} (procured {totalProcured}/{req.quantity_required})</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Order Cards */}
            {orders.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                    <Package size={40} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">No material orders yet</p>
                    <p className="text-xs text-slate-400 mt-1">Order materials from the Marketplace to see them tracked here.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {orders.map(order => {
                        const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending_payment;
                        const StatusIcon = cfg.icon;
                        const isExpanded = expandedId === order.id;

                        return (
                            <div key={order.id} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                                <button 
                                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                                    className="w-full p-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${cfg.color}-100 text-${cfg.color}-600`}>
                                            <StatusIcon size={18} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-black text-slate-900">{order.supplier?.business_name || 'Unknown Supplier'}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{cfg.label} • {new Date(order.created_at).toLocaleDateString('id-ID')}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-black text-slate-700">Rp {Number(order.total_price).toLocaleString('id-ID')}</span>
                                        {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="px-5 pb-5 border-t border-slate-50">
                                        <div className="mt-4 space-y-2">
                                            {order.items?.map((item, i) => (
                                                <div key={i} className="flex justify-between text-xs font-bold text-slate-600 py-1 border-b border-slate-50 last:border-0">
                                                    <span>{item.material?.name || 'Item'} × {item.quantity} {item.material?.unit || ''}</span>
                                                    <span className="text-slate-400">Rp {Number(item.price_at_purchase * item.quantity).toLocaleString('id-ID')}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {order.tracking_number && (
                                            <div className="mt-3 p-3 bg-indigo-50 rounded-xl flex items-center gap-2 text-xs font-bold text-indigo-700">
                                                <Truck size={14} />
                                                <span>Tracking: {order.tracking_number}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* PM VERIFICATION MODAL */}
            <AnimatePresence>
                {verifyingRequest && (
                    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setVerifyingRequest(null)}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 overflow-hidden"
                        >
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                                    <AlertCircle size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Technical Verification</h3>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Assign estimated cost for Owner approval</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Material Requested</p>
                                    <p className="text-sm font-black text-slate-900">{verifyingRequest.requirement?.name}</p>
                                    <p className="text-xs font-bold text-slate-500 mt-1">{verifyingRequest.quantity_needed} {verifyingRequest.requirement?.unit}</p>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Estimated Total Cost (Rp)</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">Rp</span>
                                        <input 
                                            type="number"
                                            value={estimatedCost}
                                            onChange={(e) => setEstimatedCost(e.target.value)}
                                            placeholder="2.500.000"
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-black text-slate-900 focus:border-slate-900 focus:bg-white transition-all outline-none"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold mt-2 ml-1">Owner will see this amount in their budget authorization gate.</p>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">PM Note for Owner (Optional)</label>
                                    <textarea 
                                        value={pmNote}
                                        onChange={(e) => setPmNote(e.target.value)}
                                        placeholder="Technical justification for this purchase..."
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-xs font-bold text-slate-900 focus:border-slate-900 focus:bg-white transition-all outline-none min-h-[100px] resize-none"
                                    />
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button 
                                        onClick={() => setVerifyingRequest(null)}
                                        className="flex-1 px-4 py-4 bg-slate-100 text-slate-600 rounded-2xl text-xs font-black hover:bg-slate-200 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={handleVerifySubmit}
                                        disabled={!estimatedCost || submitting}
                                        className="flex-[2] px-4 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black shadow-xl shadow-slate-200 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                                    >
                                        {submitting ? (
                                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <Send size={14} />
                                                Forward to Owner
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
