import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Box, MapPin, Truck, CheckCircle2, MessageCircle, 
    Smartphone, Package, Star, User, Building2, Upload, Camera, X, Image as ImageIcon, Eye
} from 'lucide-react';
import TrackingTimeline from './TrackingTimeline';

interface OrderCardProps {
    order: any;
    isSupplier: boolean;
    isUpdating: boolean;
    updateOrderStatus: (id: number, status: string, file?: File) => void;
    onReview: (order: any) => void;
}

const OrderCard: React.FC<OrderCardProps> = ({ order, isSupplier, isUpdating, updateOrderStatus, onReview }) => {
    const [docFile, setDocFile] = useState<File | null>(null);
    const [docPreview, setDocPreview] = useState<string | null>(null);
    const [showFullDoc, setShowFullDoc] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setDocFile(file);
            setDocPreview(URL.createObjectURL(file));
        }
    };

    const clearFile = () => {
        setDocFile(null);
        setDocPreview(null);
    };

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'pending': return { label: 'Pesanan Masuk', color: 'bg-zinc-100 text-zinc-600', icon: Clock };
            case 'processing': return { label: 'Diproses Toko', color: 'bg-amber-100 text-amber-600', icon: Box };
            case 'ready_for_pickup': return { label: 'Siap Diambil', color: 'bg-blue-100 text-blue-600', icon: Package };
            case 'shipping': return { label: 'Dalam Pengiriman', color: 'bg-indigo-100 text-indigo-600', icon: Truck };
            case 'delivered': return { label: 'Sampai di Lokasi', color: 'bg-green-100 text-green-600', icon: CheckCircle2 };
            case 'completed': return { label: 'Selesai', color: 'bg-emerald-100 text-emerald-600', icon: CheckCircle2 };
            case 'cancelled': return { label: 'Dibatalkan', color: 'bg-red-100 text-red-600', icon: AlertCircle };
            default: return { label: status, color: 'bg-gray-100 text-gray-600', icon: Box };
        }
    };

    const config = getStatusConfig(order.status);

    return (
        <motion.div 
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`group bg-white rounded-[2.5rem] p-8 shadow-sm hover:shadow-xl transition-all border border-gray-100/50 ${order.status === 'cancelled' ? 'opacity-75 grayscale-[0.5]' : ''}`}
        >
            <div className="grid grid-cols-12 gap-6 items-start">
                {/* Column 1: Material & Buyer Info */}
                <div className="col-span-12 xl:col-span-3 space-y-6 min-w-0">
                    <div className="flex items-center gap-4">
                        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border ${config.color}`}>
                            <config.icon size={14} />
                            {config.label}
                        </div>
                    </div>

                    <div className="flex items-start gap-6">
                        <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-300 shrink-0">
                            <Box size={32} />
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-baseline gap-3">
                                <h4 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                                    {isSupplier ? order.user?.name : order.supplier?.store_name}
                                </h4>
                                <span className="text-[10px] font-black text-gray-300 font-mono tracking-wider">
                                    #{order.whatsapp_order_id}
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 font-medium line-clamp-1 flex gap-2">
                                <span className="text-red-500 font-bold">{order.items?.length} Items:</span>
                                {order.items?.map((i: any) => `${i.quantity}x ${i.material?.name}`).join(', ')}
                            </p>
                            <div className="flex items-center gap-1.5 uppercase tracking-widest text-[#FF2D20] text-[10px] font-black mt-2">
                                {isSupplier ? <User size={12} /> : <Building2 size={12} />}
                                {isSupplier ? order.user?.name : order.supplier?.store_name}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Column 2: Logistics Sidebar */}
                {isSupplier && (order.delivery_method === 'Supplier Fleet' || order.delivery_method === 'Supplier Delivery') && (
                    <div className="col-span-12 xl:col-span-5 flex flex-col md:flex-row items-center gap-5 bg-gray-50/80 rounded-[2rem] p-5 border border-gray-100 shadow-inner overflow-hidden min-w-0 mb-4 xl:mb-0">
                        {order.latitude && (
                            <div className="flex flex-col gap-3 w-full md:w-40 shrink-0">
                                <div className="relative h-36 w-full rounded-2xl overflow-hidden border border-white shadow-sm ring-1 ring-black/5">
                                    <iframe 
                                        width="100%" height="100%" frameBorder="0" scrolling="no"
                                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(order.longitude)-0.005},${parseFloat(order.latitude)-0.005},${parseFloat(order.longitude)+0.005},${parseFloat(order.latitude)+0.005}&layer=mapnik&marker=${order.latitude},${order.longitude}`}
                                    />
                                </div>
                                <a href={`https://www.google.com/maps/dir/?api=1&destination=${order.latitude},${order.longitude}`} 
                                   target="_blank" className="py-2 bg-white text-blue-600 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5 border border-blue-100 shadow-sm">
                                    <MapPin size={10} /> Direction
                                </a>
                            </div>
                        )}
                        <div className="hidden md:block w-px h-16 bg-gray-200/60" />
                        <div className="flex-1 flex flex-col gap-3 min-w-0 w-full">
                            <span className="text-[8px] font-black text-red-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <MapPin size={10} /> Delivery Location
                            </span>
                            <span className="text-[11px] font-black text-gray-900 uppercase tracking-tight leading-snug">
                                {order.delivery_address || 'Address not specified'}
                            </span>
                            {order.address_detail && (
                                <div className="p-3 bg-white/80 rounded-2xl border border-white shadow-sm">
                                    <span className="text-[10px] font-bold text-gray-700 italic">"{order.address_detail}"</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Column 3: Status / Timeline */}
                <div className={`${(isSupplier && order.delivery_method === 'Supplier Fleet' && order.latitude) ? 'xl:col-span-4' : 'xl:col-span-9'} col-span-12 space-y-4`}>
                    <TrackingTimeline order={order} />
                    
                    {/* Actions */}
                    <div className="flex flex-col gap-3">
                        {isSupplier && order.status === 'processing' && (
                            <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50 space-y-3">
                                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2 px-1">
                                    <Camera size={12} /> Dispatch Documentation (Optional)
                                </span>
                                <div className="flex items-center gap-3">
                                    {docPreview ? (
                                        <div className="relative w-20 h-20 rounded-xl overflow-hidden shadow-sm border-2 border-white ring-1 ring-indigo-100 group">
                                            <img src={docPreview} className="w-full h-full object-cover" />
                                            <button 
                                                onClick={clearFile}
                                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="w-20 h-20 flex flex-col items-center justify-center bg-white border-2 border-dashed border-indigo-100 rounded-xl cursor-pointer hover:bg-indigo-50 transition-all group">
                                            <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                                            <Upload size={18} className="text-indigo-400 group-hover:-translate-y-1 transition-transform" />
                                            <span className="text-[8px] font-black text-indigo-400 mt-1 uppercase tracking-widest">Add</span>
                                        </label>
                                    )}
                                    <div className="flex-1">
                                        <p className="text-[10px] font-medium text-gray-500 italic leading-relaxed">
                                            Dokumentasi pengiriman membantu mempercepat proses konfirmasi penerimaan oleh pembeli.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3">
                            {isSupplier ? (
                                <SupplierActions 
                                    order={order} 
                                    isUpdating={isUpdating} 
                                    updateOrderStatus={updateOrderStatus}
                                    onReview={onReview} 
                                    docFile={docFile || undefined}
                                />
                            ) : (
                                <BuyerActions order={order} isUpdating={isUpdating} updateOrderStatus={updateOrderStatus} onReview={onReview} />
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {order.notes && (
                <div className="mt-4 pt-4 border-t border-dashed border-gray-100 flex items-start gap-2">
                    <MessageCircle size={14} className="text-indigo-400 mt-0.5" />
                    <p className="text-xs font-bold text-gray-500 bg-indigo-50/30 px-3 py-2 rounded-lg border border-indigo-100 italic">
                        CATATAN: {order.notes}
                    </p>
                </div>
            )}

            {order.delivery_documentation_path && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em] flex items-center gap-2">
                            <ImageIcon size={14} className="text-red-500" /> Delivery Documentation Evidence
                        </span>
                        <button 
                            onClick={() => setShowFullDoc(true)}
                            className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 hover:underline"
                        >
                            <Eye size={12} /> View Full
                        </button>
                    </div>
                    <div className="relative group cursor-pointer" onClick={() => setShowFullDoc(true)}>
                        <div className="w-full h-48 md:h-64 rounded-3xl overflow-hidden bg-gray-50 border border-gray-100 shadow-inner">
                            <img 
                                src={`/storage/${order.delivery_documentation_path}`} 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                                alt="Delivery Proof"
                            />
                        </div>
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-3xl backdrop-blur-[2px]">
                            <div className="px-6 py-3 bg-white rounded-2xl shadow-xl flex items-center gap-2">
                                <Eye size={16} className="text-gray-900" />
                                <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest leading-none">Inspect Documentation</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Documentation Modal */}
            <AnimatePresence>
                {showFullDoc && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-12"
                        onClick={() => setShowFullDoc(false)}
                    >
                        <button className="absolute top-8 right-8 text-white hover:rotate-90 transition-transform">
                            <X size={32} strokeWidth={3} />
                        </button>
                        <motion.img 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            src={`/storage/${order.delivery_documentation_path}`}
                            className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

const SupplierActions = ({ order, isUpdating, updateOrderStatus, onReview, docFile }: any) => {
    if (order.status === 'pending') return <ActionButton icon={<Box size={14} />} label="Start Packing" onClick={() => updateOrderStatus(order.id, 'processing')} isUpdating={isUpdating} color="bg-gray-900" />;
    if (order.status === 'processing') return <ActionButton icon={<Truck size={14} />} label="Dispatch Armada" onClick={() => updateOrderStatus(order.id, 'shipping', docFile)} isUpdating={isUpdating} color="bg-indigo-600" />;
    if (order.status === 'shipping') return <ActionButton icon={<CheckCircle2 size={14} />} label="Confirm Delivered" onClick={() => updateOrderStatus(order.id, 'delivered')} isUpdating={isUpdating} color="bg-green-600" />;
    if (order.review) return <ActionButton icon={<Star size={14} className="fill-amber-400 text-amber-400" />} label={`Ulasan Pembeli (${order.review.rating} ⭐)`} onClick={() => onReview(order)} isUpdating={false} color="bg-indigo-600" />;
    return null;
};

const BuyerActions = ({ order, isUpdating, updateOrderStatus, onReview }: any) => {
    if (order.status === 'delivered') return <ActionButton icon={<CheckCircle2 size={14} />} label="Pesanan Diterima & Selesai" onClick={() => updateOrderStatus(order.id, 'completed')} isUpdating={isUpdating} color="bg-green-600" />;
    if (order.status === 'completed' && !order.review) return <ActionButton icon={<Star size={14} className="fill-white" />} label="Beri Ulasan Toko" onClick={() => onReview(order)} isUpdating={false} color="bg-indigo-600" />;
    if (order.review) return <ActionButton icon={<Star size={14} className="fill-amber-400 text-amber-400" />} label={`Lihat Ulasan (${order.review.rating} ⭐)`} onClick={() => onReview(order)} isUpdating={false} color="bg-gray-900" />;
    return null;
};

const ActionButton = ({ icon, label, onClick, isUpdating, color }: any) => (
    <button 
        disabled={isUpdating}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={`w-full py-4 ${color} text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2`}
    >
        {icon} {label}
    </button>
);

// Helper Icons for getStatusConfig
const Clock = (props:any) => <ClockIcon {...props} />;
const ClockIcon = ({size}:any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const AlertCircle = (props:any) => <AlertCircleIcon {...props} />;
const AlertCircleIcon = ({size}:any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;

export default OrderCard;
