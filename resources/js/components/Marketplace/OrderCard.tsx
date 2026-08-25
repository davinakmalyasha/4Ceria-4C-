import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Box, MapPin, Truck, CheckCircle2, MessageCircle, 
    Smartphone, Package, User, Building2, Upload, X, Image as ImageIcon, Eye
} from 'lucide-react';
import TrackingTimeline from './TrackingTimeline';
import { OrderReviewForm } from './OrderReviewForm';
import { SupplierActions, BuyerActions } from './OrderActions';

const ClockIcon = ({size}:any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const AlertCircleIcon = ({size}:any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;

const getStatusConfig = (status: string) => {
    switch (status) {
        case 'pending': return { label: 'Pesanan Masuk', color: 'bg-zinc-100 text-zinc-600', icon: ClockIcon };
        case 'processing': return { label: 'Diproses Toko', color: 'bg-amber-100 text-amber-600', icon: Box };
        case 'ready_for_pickup': return { label: 'Siap Diambil', color: 'bg-blue-100 text-blue-600', icon: Package };
        case 'shipping': return { label: 'Dalam Pengiriman', color: 'bg-indigo-100 text-indigo-600', icon: Truck };
        case 'delivered': return { label: 'Sampai di Lokasi', color: 'bg-green-100 text-green-600', icon: CheckCircle2 };
        case 'completed': return { label: 'Selesai', color: 'bg-emerald-100 text-emerald-600', icon: CheckCircle2 };
        case 'cancelled': return { label: 'Dibatalkan', color: 'bg-red-100 text-red-600', icon: AlertCircleIcon };
        default: return { label: status, color: 'bg-gray-100 text-gray-600', icon: Box };
    }
};

interface OrderCardProps {
    order: any;
    isSupplier: boolean;
    isUpdating: boolean;
    updateOrderStatus: (id: number, status: string, file?: File) => void;
    onReview: (order: any) => void;
    onRefresh?: () => void;
}

const OrderCard: React.FC<OrderCardProps> = ({ order, isSupplier, isUpdating, updateOrderStatus, onReview, onRefresh }) => {
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

    const derivedStatus = (order.delivery_job?.status === 'delivered' && order.status !== 'completed') ? 'delivered' : order.status;
    const config = getStatusConfig(derivedStatus);

    return (
        <motion.div 
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`group bg-white rounded-[2.5rem] p-8 shadow-sm hover:shadow-xl transition-all border border-gray-100/50 ${order.status === 'cancelled' ? 'opacity-75 grayscale-[0.5]' : ''}`}
        >
            <div className="grid grid-cols-12 gap-6 items-start">
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

                <div className={`${(isSupplier && order.delivery_method === 'Supplier Fleet' && order.latitude) ? 'xl:col-span-4' : 'xl:col-span-9'} col-span-12 space-y-4`}>
                    <TrackingTimeline order={order} />

                    {!isSupplier && order.delivery_method === 'Hire Platform Courier' && (
                        derivedStatus === 'delivered' || order.status === 'completed' ? (
                            !order.review && (
                                <OrderReviewForm order={order} />
                            )
                        ) : (
                            ['ready_for_pickup', 'shipping'].includes(order.status) && (
                                <div className="bg-indigo-50/80 rounded-[2rem] p-5 border border-indigo-100 flex items-start gap-4">
                                    <div className="p-3 bg-white rounded-2xl shadow-sm">
                                        <Truck size={20} className="text-indigo-500" />
                                    </div>
                                    <div className="space-y-1.5 flex-1">
                                        {order.delivery_job?.status === 'pending' || !order.delivery_job ? (
                                            <>
                                                <h6 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Menunggu Kurir Platform</h6>
                                                <p className="text-xs font-bold text-gray-700 leading-relaxed">
                                                    Penjual telah menyiapkan pesanan Anda. Saat ini kami sedang mencarikan Kurir untuk menjemput barang. Anda bisa menunggu di halaman ini atau kurir akan menghubungi via WhatsApp.
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <h6 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center justify-between">
                                                    <span>Kurir Ditemukan: {order.delivery_job?.logistics?.name || order.delivery_job?.driver_name || 'Driver'}</span>
                                                    <span className="bg-indigo-500 text-white px-2 py-0.5 rounded-full text-[9px]">Biaya: Rp {(Number(order.delivery_job?.agreed_fee) || 0).toLocaleString()}</span>
                                                </h6>
                                                <p className="text-xs font-bold text-gray-700 leading-relaxed mt-1">
                                                    Mohon hubungi kurir untuk koordinasi pengiriman dan pembayaran tunai/transfer setibanya di lokasi (sebelum dibongkar).
                                                </p>
                                                
                                                <div className="flex flex-wrap gap-2 mt-4">
                                                    <button 
                                                        onClick={() => window.dispatchEvent(new CustomEvent('start_chat', { detail: order.delivery_job?.logistics_id }))}
                                                        className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md active:scale-95 group"
                                                    >
                                                        <MessageCircle size={16} className="group-hover:rotate-12 transition-transform" />
                                                        Internal Chat
                                                    </button>

                                                    {(order.delivery_job?.logistics?.phone || order.delivery_job?.driver_phone || order.delivery_job?.logistics?.phone_number?.[0]?.contact) && (
                                                        <a 
                                                            href={`https://wa.me/${order.delivery_job?.logistics?.phone || order.delivery_job?.driver_phone || order.delivery_job?.logistics?.phone_number?.[0]?.contact}?text=Halo%20Kurir%204Ceria,%20saya%20pembeli%20pesanan%20${order.whatsapp_order_id}`}
                                                            target="_blank"
                                                            className="inline-flex items-center gap-2 bg-[#25D366] text-white px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#20bd5a] transition-all shadow-md active:scale-95 group"
                                                        >
                                                            <Smartphone size={16} className="group-hover:scale-110 transition-transform" />
                                                            Chat via WhatsApp
                                                        </a>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )
                        )
                    )}
                    
                    <div className="flex flex-col gap-3">
                        {isSupplier && order.status === 'processing' && (
                            <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50 space-y-3">
                                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2 px-1">
                                    <ImageIcon size={12} /> Dispatch Documentation (Optional)
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
                                    onRefresh={onRefresh}
                                />
                            ) : (
                                <BuyerActions order={order} isUpdating={isUpdating} updateOrderStatus={updateOrderStatus} onReview={onReview} onRefresh={onRefresh} />
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {order.notes && (
                <div className="mt-6 pt-6 border-t border-dashed border-gray-100 flex items-start gap-4 bg-amber-50/30 p-6 rounded-[2rem] border border-amber-100/50">
                    <MessageCircle size={20} className="text-amber-500 mt-1" />
                    <div className="space-y-1">
                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Buyer's Note</p>
                        <p className="text-sm font-bold text-gray-700 italic">
                            {order.notes}
                        </p>
                    </div>
                </div>
            )}

            {(order.delivery_documentation_path || order.delivery_job) && (
                <div className="mt-8 pt-8 border-t border-gray-100 space-y-8">
                    <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em] flex items-center gap-3">
                            <ImageIcon size={16} className="text-indigo-500" /> Shipping & Delivery Evidence
                        </h5>
                    </div>

                    <div className="flex flex-col gap-10 w-full max-w-3xl">
                        {order.delivery_documentation_path && (
                            <div className="space-y-3">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Supplier Packaging Proof</span>
                                <div className="space-y-4 max-w-sm">
                                    <div className="relative group cursor-pointer aspect-video rounded-[2rem] overflow-hidden bg-gray-50 border border-gray-100 shadow-sm" onClick={() => setShowFullDoc(true)}>
                                        <img 
                                            src={`/storage/${order.delivery_documentation_path}`} 
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                                            alt="Supplier Proof"
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                            <Eye size={20} className="text-white" />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 px-2">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                            <Package size={14} className="text-gray-500" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-gray-900 line-clamp-1">{order.supplier?.store_name || order.supplier?.user?.name || 'Supplier'}</span>
                                            <div className="flex items-center gap-1.5 text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                                                <span className="text-indigo-500">Supplier</span>
                                                <span className="opacity-50">•</span>
                                                <span>{new Date(order.updated_at).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {(order.delivery_job?.pickup_photos || order.delivery_job?.delivery_photos) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full relative">
                                <div className="absolute left-6 top-8 bottom-8 w-px bg-gray-100 sm:hidden"></div>
                                
                                {order.delivery_job?.pickup_photos && (
                                    <div className="space-y-3 z-10 relative">
                                        <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest px-1">Courier Pickup Evidence</span>
                                        <div className="space-y-4 max-w-xs">
                                            <div className="grid grid-cols-2 gap-2">
                                                {(Array.isArray(order.delivery_job.pickup_photos) 
                                                    ? order.delivery_job.pickup_photos 
                                                    : JSON.parse(order.delivery_job.pickup_photos || '[]')
                                                ).map((path: string, i: number) => (
                                                    <div key={i} className="relative group cursor-pointer aspect-square rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 shadow-sm" onClick={() => window.open(`/storage/${path}`, '_blank')}>
                                                        <img src={`/storage/${path}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-3 px-2">
                                                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                                                    <Truck size={14} className="text-indigo-500" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-gray-900 line-clamp-1">{order.delivery_job?.logistics?.name || 'Platform Courier'}</span>
                                                    <div className="flex items-center gap-1.5 text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                                                        <span className="text-indigo-500">Delivery</span>
                                                        <span className="opacity-50">•</span>
                                                        <span>{new Date(order.delivery_job?.updated_at || order.updated_at).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {order.delivery_job?.delivery_photos && (
                                    <div className="space-y-3 z-10 relative">
                                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest px-1">Final Delivery Evidence</span>
                                        <div className="space-y-4 max-w-xs">
                                            <div className="grid grid-cols-2 gap-2">
                                                {(Array.isArray(order.delivery_job.delivery_photos) 
                                                    ? order.delivery_job.delivery_photos 
                                                    : JSON.parse(order.delivery_job.delivery_photos || '[]')
                                                ).map((path: string, i: number) => (
                                                    <div key={i} className="relative group cursor-pointer aspect-square rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 shadow-sm" onClick={() => window.open(`/storage/${path}`, '_blank')}>
                                                        <img src={`/storage/${path}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-3 px-2">
                                                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                                                    <CheckCircle2 size={14} className="text-emerald-500" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-gray-900 line-clamp-1">{order.delivery_job?.logistics?.name || 'Platform Courier'}</span>
                                                    <div className="flex items-center gap-1.5 text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                                                        <span className="text-emerald-500">Delivery</span>
                                                        <span className="opacity-50">•</span>
                                                        <span>{new Date(order.delivery_job?.updated_at || order.updated_at).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

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

export default OrderCard;
