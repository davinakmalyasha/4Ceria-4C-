import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    Package, Truck, CheckCircle, Clock, AlertTriangle, 
    ExternalLink, MessageCircle, ChevronDown, ChevronUp
} from 'lucide-react';
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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pending_payment: { label: 'Awaiting Payment', color: 'amber', icon: Clock },
    processing: { label: 'Processing', color: 'blue', icon: Package },
    shipped: { label: 'Shipped', color: 'indigo', icon: Truck },
    delivered: { label: 'Delivered', color: 'emerald', icon: CheckCircle },
    cancelled: { label: 'Cancelled', color: 'red', icon: AlertTriangle },
};

export default function MaterialOrderTracker({ project, currentUser }: MaterialOrderTrackerProps) {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const { showToast } = useToast();

    const fetchOrders = async () => {
        try {
            const res = await axios.get(`/material-orders`, {
                params: { project_id: project.id }
            });
            setOrders(res.data?.data || []);
        } catch (err) {
            console.error('Failed to fetch material orders', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchOrders(); }, [project?.id]);

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

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
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
        </div>
    );
}
