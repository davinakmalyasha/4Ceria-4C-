import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Truck, Search, Filter, ChevronDown, Package } from 'lucide-react';
import OrderCard from './OrderCard';
import ReviewModal from './ReviewModal';
import { getApiErrorMessage } from '../../utils/apiError';

export default function MaterialOrdersTab() {
    const { user } = useAuth();
    const isSupplier = user?.role_type === 'supplier';

    const [orders, setOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Review Modal State
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await axios.get('/material-orders');
            setOrders(res.data.data || []);
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load orders'));
        } finally {
            setIsLoading(false);
        }
    };

    const updateOrderStatus = async (orderId: number, nextStatus: string, file?: File) => {
        setIsUpdating(true);
        try {
            const formData = new FormData();
            formData.append('status', nextStatus);
            formData.append('_method', 'PUT');
            if (file) {
                formData.append('delivery_documentation', file);
            }

            const res = await axios.post(`/material-orders/${orderId}`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            setOrders(prev => prev.map(o => o.id === orderId ? res.data.data : o));
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to update order'));
        } finally {
            setIsUpdating(false);
        }
    };

    const filteredOrders = orders.filter(o => 
        o.whatsapp_order_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.supplier?.store_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.user?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isLoading) return <LoadingState />;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto px-4 py-8">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-red-50 rounded-2xl text-[#FF2D20]">
                                <Truck size={32} strokeWidth={2.5} />
                            </div>
                            <h2 className="text-4xl font-black text-gray-900 tracking-tighter uppercase italic">
                                {isSupplier ? 'Logistics Unit' : 'Order Tracking'}
                            </h2>
                        </div>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest ml-1">
                            {isSupplier ? 'Fulfillment Control Center' : 'Monitor material shipments in real-time'}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#FF2D20] transition-colors" size={18} />
                            <input 
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search Order ID..."
                                className="pl-12 pr-6 py-4 bg-white border border-gray-100 rounded-2xl text-xs font-black uppercase tracking-widest focus:ring-4 focus:ring-red-50 focus:border-[#FF2D20] transition-all w-full md:w-64 placeholder:text-gray-300 shadow-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* Orders List */}
                <div className="grid grid-cols-1 gap-6">
                    {error ? (
                        <ErrorState message={error} onRetry={fetchOrders} />
                    ) : filteredOrders.length > 0 ? (
                        filteredOrders.map(order => (
                            <OrderCard
                                key={order.id}
                                order={order}
                                isSupplier={isSupplier}
                                isUpdating={isUpdating}
                                updateOrderStatus={updateOrderStatus}
                                onRefresh={fetchOrders}
                                onReview={(o) => {
                                    setSelectedOrder(o);
                                    setIsReviewOpen(true);
                                }}
                            />
                        ))
                    ) : (
                        <EmptyState />
                    )}
                </div>

                {/* Review Modal */}
                {selectedOrder && (
                    <ReviewModal 
                        isOpen={isReviewOpen} 
                        onClose={() => {
                            setIsReviewOpen(false);
                            setSelectedOrder(null);
                        }}
                        order={selectedOrder}
                        onSuccess={fetchOrders}
                        isReadOnly={!!selectedOrder.review}
                    />
                )}
            </div>
    );
}

const LoadingState = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-16 h-16 border-4 border-red-100 border-t-[#FF2D20] rounded-full animate-spin" />
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Syncing Logistics...</span>
    </div>
);

const EmptyState = () => (
    <div className="bg-gray-50/50 border-2 border-dashed border-gray-100 rounded-[3rem] p-20 flex flex-col items-center text-center space-y-6">
        <div className="p-6 bg-white rounded-full shadow-sm text-gray-200">
            <Package size={48} />
        </div>
        <div className="space-y-2">
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">No Active Missions</h3>
            <p className="text-sm font-medium text-gray-500">There are no orders matching your current criteria.</p>
        </div>
    </div>
);

const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
    <div className="bg-red-50/50 border-2 border-dashed border-red-100 rounded-[3rem] p-16 flex flex-col items-center text-center space-y-6">
        <div className="p-6 bg-white rounded-full shadow-sm text-red-300">
            <Package size={48} />
        </div>
        <div className="space-y-2">
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Something Went Wrong</h3>
            <p className="text-sm font-medium text-gray-500">{message}</p>
        </div>
        <button onClick={onRetry} className="px-6 py-3 bg-[#FF2D20] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-colors">
            Try Again
        </button>
    </div>
);
