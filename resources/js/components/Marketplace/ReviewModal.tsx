import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, Upload, Loader2, CheckCircle2, Building2, Truck, Camera, MessageSquare } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';


interface ReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: any;
    onSuccess: () => void;
    isReadOnly?: boolean;
}

const ReviewModal: React.FC<ReviewModalProps> = ({ isOpen, onClose, order, onSuccess, isReadOnly = false }) => {
    const { user } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    
    // Shop States
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');
    const [shopImages, setShopImages] = useState<File[]>([]);
    const [shopPreviews, setShopPreviews] = useState<string[]>([]);
    
    // Delivery States
    const [deliveryRating, setDeliveryRating] = useState(5);
    const [deliveryComment, setDeliveryComment] = useState('');
    const [deliveryImages, setDeliveryImages] = useState<File[]>([]);
    const [deliveryPreviews, setDeliveryPreviews] = useState<string[]>([]);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const { showToast } = useToast();


    useEffect(() => {
        if (isOpen && order.review) {
            setRating(order.review.rating || 5);
            setComment(order.review.comment || '');
            setShopPreviews(order.review.image_paths ? order.review.image_paths.map((p: string) => `/storage/${p}`) : []);
            
            setDeliveryRating(order.review.delivery_rating || 5);
            setDeliveryComment(order.review.delivery_comment || '');
            setDeliveryPreviews(order.review.delivery_image_paths ? order.review.delivery_image_paths.map((p: string) => `/storage/${p}`) : []);
        }
    }, [isOpen, order.review]);

    const isOwner = user?.id === order.review?.user_id;
    const effectiveReadOnly = isReadOnly && !isEditing;

    const handleImageChange = (files: FileList | null, type: 'shop' | 'delivery') => {
        if (!files) return;
        const newFiles = Array.from(files);
        const currentPreviews = type === 'shop' ? shopPreviews : deliveryPreviews;
        
        if (newFiles.length + currentPreviews.length > 3) {
            showToast('You can only upload up to 3 images per section', 'error');
            return;
        }


        const newUrls = newFiles.map(file => URL.createObjectURL(file));
        
        if (type === 'shop') {
            setShopImages(prev => [...prev, ...newFiles].slice(0, 3 - (shopPreviews.length - shopImages.length)));
            setShopPreviews(prev => [...prev, ...newUrls].slice(0, 3));
        } else {
            setDeliveryImages(prev => [...prev, ...newFiles].slice(0, 3 - (deliveryPreviews.length - deliveryImages.length)));
            setDeliveryPreviews(prev => [...prev, ...newUrls].slice(0, 3));
        }
    };

    const removeImage = (index: number, type: 'shop' | 'delivery') => {
        if (type === 'shop') {
            // Determine if it was a File (newly added) or a URL (existing)
            const newShopPreviews = [...shopPreviews];
            newShopPreviews.splice(index, 1);
            setShopPreviews(newShopPreviews);
            
            // If it was a new file, remove it from shopImages too
            const existingCount = (order.review?.image_paths?.length || 0);
            if (index >= existingCount) {
                const newShopImages = [...shopImages];
                newShopImages.splice(index - existingCount, 1);
                setShopImages(newShopImages);
            }
        } else {
            const newDelPreviews = [...deliveryPreviews];
            newDelPreviews.splice(index, 1);
            setDeliveryPreviews(newDelPreviews);
            
            const existingCount = (order.review?.delivery_image_paths?.length || 0);
            if (index >= existingCount) {
                const newDelImages = [...deliveryImages];
                newDelImages.splice(index - existingCount, 1);
                setDeliveryImages(newDelImages);
            }
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        const formData = new FormData();
        formData.append('rating', rating.toString());
        formData.append('comment', comment);
        
        shopImages.forEach((img) => formData.append('shop_images[]', img));

        if (order.delivery_job) {
            formData.append('delivery_rating', deliveryRating.toString());
            formData.append('delivery_comment', deliveryComment);
            deliveryImages.forEach((img) => formData.append('delivery_images[]', img));
        }

        try {
            if (isEditing) {
                formData.append('_method', 'PUT');
                await axios.post(`/material-order-reviews/${order.review.id}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            } else {
                formData.append('order_id', order.id.toString());
                await axios.post('/material-order-reviews', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            setIsSuccess(true);
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 2000);
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to submit review', 'error');
        } finally {

            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Are you sure you want to delete this review?')) return;
        setIsSubmitting(true);
        try {
            await axios.delete(`/material-order-reviews/${order.review.id}`);
            onSuccess();
            onClose();
        } catch (error: any) {
            showToast('Failed to delete review', 'error');
        } finally {

            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-8 pb-4 flex items-center justify-between bg-white/80 backdrop-blur-sm shrink-0 z-10 border-b border-gray-50">
                        <div>
                            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
                                {isEditing ? 'Edit Ulasan' : isReadOnly ? 'Order Feedback' : 'Beri Ulasan'}
                            </h2>
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mt-1">Pesanan #{order.whatsapp_order_id || order.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {effectiveReadOnly && isOwner && (
                                <>
                                    <button onClick={() => setIsEditing(true)} className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                    <button onClick={handleDelete} className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all">
                                        <X size={20} />
                                    </button>
                                </>
                            )}
                            <button onClick={onClose} className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:text-gray-900 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {isSuccess ? (
                            <div className="p-12 flex flex-col items-center justify-center text-center space-y-6">
                                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center text-green-500 animate-bounce">
                                    <CheckCircle2 size={48} strokeWidth={3} />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Berhasil!</h3>
                                    <p className="text-sm font-bold text-gray-500">Terima kasih atas ulasan Anda.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="p-8 space-y-12">
                                {/* Shop Review Section */}
                                <section className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 shadow-sm">
                                            <Building2 size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Kualitas Produk & Toko</h4>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Bagaimana kualitas barang yang dikirim?</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-center py-6 bg-amber-50/30 rounded-[2rem] border border-amber-100/50">
                                        <div className="flex gap-2">
                                            {[1, 2, 3, 4, 5].map((s) => (
                                                <button key={s} disabled={effectiveReadOnly} onClick={() => setRating(s)} className="transition-transform active:scale-90">
                                                    <Star size={32} fill={s <= rating ? "#f59e0b" : "none"} stroke={s <= rating ? "#f59e0b" : "#d1d5db"} strokeWidth={2.5} />
                                                </button>
                                            ))}
                                        </div>
                                        <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest mt-4">
                                            {['Sangat Buruk', 'Buruk', 'Biasa Saja', 'Bagus', 'Sangat Bagus'][rating - 1]}
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-4">Detail Ulasan Toko</label>
                                        <textarea
                                            value={comment}
                                            readOnly={effectiveReadOnly}
                                            onChange={(e) => setComment(e.target.value)}
                                            className="w-full h-28 p-5 bg-gray-50 border-0 rounded-[1.5rem] text-sm font-bold text-gray-900 placeholder:text-gray-300 focus:ring-2 focus:ring-amber-100 transition-all resize-none shadow-inner"
                                            placeholder="Ceritakan pengalaman produk Anda..."
                                        />
                                    </div>

                                    <ImageSection 
                                        title="Foto Produk"
                                        previews={shopPreviews}
                                        onRemove={(idx: number) => removeImage(idx, 'shop')}
                                        onUpload={(f: FileList | null) => handleImageChange(f, 'shop')}
                                        readOnly={effectiveReadOnly}
                                    />

                                </section>

                                {/* Delivery Review Section */}
                                {order.delivery_job && (
                                    <section className="space-y-6 pt-6 border-t border-gray-100">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 shadow-sm">
                                                <Truck size={20} />
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Pelayanan Pengiriman</h4>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Bagaimana ketepatan waktu & perilaku driver?</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-center py-6 bg-indigo-50/30 rounded-[2rem] border border-indigo-100/50">
                                            <div className="flex gap-2">
                                                {[1, 2, 3, 4, 5].map((s) => (
                                                    <button key={s} disabled={effectiveReadOnly} onClick={() => setDeliveryRating(s)} className="transition-transform active:scale-90">
                                                        <Star size={32} fill={s <= deliveryRating ? "#6366f1" : "none"} stroke={s <= deliveryRating ? "#6366f1" : "#d1d5db"} strokeWidth={2.5} />
                                                    </button>
                                                ))}
                                            </div>
                                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-4">
                                                {['Sangat Buruk', 'Buruk', 'Biasa Saja', 'Bagus', 'Sangat Bagus'][deliveryRating - 1]}
                                            </span>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-4">Detail Ulasan Pengiriman</label>
                                            <textarea
                                                value={deliveryComment}
                                                readOnly={effectiveReadOnly}
                                                onChange={(e) => setDeliveryComment(e.target.value)}
                                                className="w-full h-28 p-5 bg-gray-50 border-0 rounded-[1.5rem] text-sm font-bold text-gray-900 placeholder:text-gray-300 focus:ring-2 focus:ring-indigo-100 transition-all resize-none shadow-inner"
                                                placeholder="Ceritakan pengalaman pengiriman Anda..."
                                            />
                                        </div>

                                        <ImageSection 
                                            title="Foto Pengiriman"
                                            previews={deliveryPreviews}
                                            onRemove={(idx: number) => removeImage(idx, 'delivery')}
                                            onUpload={(f: FileList | null) => handleImageChange(f, 'delivery')}
                                            readOnly={effectiveReadOnly}
                                        />

                                    </section>
                                )}

                                {!effectiveReadOnly && (
                                    <button 
                                        disabled={isSubmitting} 
                                        onClick={handleSubmit} 
                                        className="w-full py-5 bg-gray-900 text-white rounded-[2rem] text-sm font-black uppercase tracking-[0.2em] shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                                    >
                                        {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <MessageSquare size={18} />}
                                        {isEditing ? 'UPDATE ULASAN' : 'KIRIM ULASAN'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

const ImageSection = ({ title, previews, onRemove, onUpload, readOnly }: any) => (
    <div className="space-y-3">
        <div className="flex items-center justify-between px-4">
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Camera size={12} /> {title}
            </span>
            <span className="text-[9px] font-bold text-gray-300">{previews.length}/3</span>
        </div>
        <div className="grid grid-cols-3 gap-3 px-1">
            {previews.map((src: any, idx: number) => (
                <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden shadow-sm border border-gray-100 group">
                    <img src={src} className="w-full h-full object-cover" />
                    {!readOnly && (
                        <button onClick={() => onRemove(idx)} className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <X size={16} />
                        </button>
                    )}
                </div>
            ))}
            {!readOnly && previews.length < 3 && (
                <label className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-all cursor-pointer">
                    <Upload size={20} />
                    <input type="file" className="hidden" accept="image/*" multiple onChange={(e) => onUpload(e.target.files)} />
                </label>
            )}
            {readOnly && previews.length === 0 && (
                <div className="col-span-3 flex items-center justify-center h-16 bg-gray-50 rounded-2xl border border-gray-100 italic text-[9px] text-gray-400 uppercase tracking-widest font-black">
                    Tidak ada bukti foto
                </div>
            )}
        </div>
    </div>
);

export default ReviewModal;

