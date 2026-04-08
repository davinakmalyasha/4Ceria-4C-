import React, { useState } from 'react';
import { Star, Camera, X, MessageSquare, Loader2, CheckCircle2, Package } from 'lucide-react';
import axios from 'axios';
import { useToast } from '../../context/ToastContext';

const ImageUploadSection = ({ title, images, onUpload, onRemove, themeColor = 'amber' }: { title: string, images: File[], onUpload: (f: FileList | null) => void, onRemove: (i: number) => void, themeColor?: string }) => (
    <div className="space-y-4 px-2">
        <div className="flex items-center justify-between px-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Camera size={14} className={`text-${themeColor}-400`} /> {title}
            </span>
            <span className={`text-[10px] font-black text-${themeColor}-500 bg-${themeColor}-50 px-3 py-1 rounded-full border border-${themeColor}-100`}>
                {images.length}/3 FOTO
            </span>
        </div>
        <div className="flex flex-wrap gap-4">
            {images.map((img: any, idx: number) => (
                <div key={idx} className="relative w-24 h-24 rounded-[1.5rem] overflow-hidden border border-gray-100 group shadow-md animate-in fade-in zoom-in duration-300">
                    <img src={URL.createObjectURL(img)} className="w-full h-full object-cover" />
                    <button 
                        onClick={() => onRemove(idx)}
                        className="absolute inset-0 bg-black/70 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"
                    >
                        <X size={20} strokeWidth={3} />
                        <span className="text-[8px] font-black mt-1 uppercase tracking-widest">Hapus</span>
                    </button>
                </div>
            ))}
            {images.length < 3 && (
                <label className={`w-24 h-24 rounded-[1.5rem] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:border-${themeColor}-300 hover:bg-${themeColor}-50/30 transition-all cursor-pointer group`}>
                    <UploadIcon size={20} className="mb-1 group-hover:-translate-y-1 transition-transform" />
                    <span className="text-[8px] font-black uppercase tracking-widest">Tambah</span>
                    <input type="file" className="hidden" accept="image/*" multiple onChange={(e) => onUpload(e.target.files)} />
                </label>
            )}
        </div>
    </div>
);

const UploadIcon = ({size}:any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;

interface Props {
    order: any;
    onSuccess?: () => void;
}

export const OrderReviewForm: React.FC<Props> = ({ order, onSuccess }) => {
    const [rating, setRating] = useState(5);
    const [deliveryRating, setDeliveryRating] = useState(5);
    const [comment, setComment] = useState('');
    const [deliveryComment, setDeliveryComment] = useState('');
    const [shopImages, setShopImages] = useState<File[]>([]);
    const [deliveryImages, setDeliveryImages] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const { showToast } = useToast();

    const handleImageChange = (files: FileList | null, type: 'shop' | 'delivery') => {
        if (files) {
            const newFiles = Array.from(files);
            const currentImages = type === 'shop' ? shopImages : deliveryImages;
            if (newFiles.length + currentImages.length > 3) {
                showToast('Maksimal 3 foto per bagian', 'error');
                return;
            }
            if (type === 'shop') {
                setShopImages(prev => [...prev, ...newFiles].slice(0, 3));
            } else {
                setDeliveryImages(prev => [...prev, ...newFiles].slice(0, 3));
            }
        }
    };

    const removeImage = (index: number, type: 'shop' | 'delivery') => {
        if (type === 'shop') {
            setShopImages(prev => prev.filter((_, i) => i !== index));
        } else {
            setDeliveryImages(prev => prev.filter((_, i) => i !== index));
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('order_id', order.id);
            formData.append('rating', rating.toString());
            formData.append('comment', comment);

            shopImages.forEach((img) => {
                formData.append('shop_images[]', img);
            });
            
            if (order.delivery_job) {
                formData.append('delivery_rating', deliveryRating.toString());
                formData.append('delivery_comment', deliveryComment);
                deliveryImages.forEach((img) => {
                    formData.append('delivery_images[]', img);
                });
            }
            
            await axios.post('/material-order-reviews', formData);
            setSuccess(true);
            showToast('Ulasan berhasil terkirim', 'success');
            if (onSuccess) onSuccess();
            else window.dispatchEvent(new CustomEvent('switchDashboardTab', { detail: 'my_orders' }));
        } catch (err: any) {
            console.error('Failed to submit review', err);
            let errorMsg = 'Gagal mengirim ulasan. Silakan coba lagi.';
            if (err.response?.data?.errors) {
                errorMsg = Object.values(err.response.data.errors).flat().join('\n');
            } else if (err.response?.data?.message) {
                errorMsg = err.response.data.message;
            }
            showToast(errorMsg, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (success) {
        return (
            <div className="bg-emerald-50 rounded-[2.5rem] p-10 border border-emerald-100 text-center space-y-6 animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-white mx-auto shadow-2xl shadow-emerald-200 animate-bounce">
                    <CheckCircle2 size={40} strokeWidth={3} />
                </div>
                <div className="space-y-2">
                    <h5 className="text-xl font-black text-emerald-900 uppercase tracking-tight">Ulasan Berhasil Terkirim!</h5>
                    <p className="text-sm text-emerald-700 font-bold leading-relaxed max-w-xs mx-auto">Terima kasih atas feedback Anda. Ulasan Anda sangat berarti bagi kami.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-[2.5rem] p-8 md:p-10 border border-gray-100 shadow-2xl shadow-gray-200/50 space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h5 className="text-xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-3">
                         BERI FEEDBACK PESANAN
                    </h5>
                    <p className="text-[10px] text-indigo-500 font-black uppercase tracking-[0.2em]">Pesanan #{order.whatsapp_order_id || order.id}</p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-gray-50 rounded-2xl border border-gray-100">
                    <Star size={14} className="text-amber-500 fill-amber-500" />
                    <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Premium Review</span>
                </div>
            </div>

            <div className="space-y-16">
                <section className="space-y-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 shadow-sm border border-amber-100/50">
                            <BoxIcon size={24} />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Kualitas Produk & Toko</h4>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Bagaimana kualitas barang & keaslian produk?</p>
                        </div>
                    </div>

                    <div className="flex flex-col items-center py-8 bg-amber-50/20 rounded-[2.5rem] border border-amber-100/30">
                        <div className="flex gap-3">
                            {[1, 2, 3, 4, 5].map((s) => (
                                <button key={s} onClick={() => setRating(s)} className="transition-all hover:scale-110 active:scale-90">
                                    <Star 
                                        size={36} 
                                        className={s <= rating ? 'text-amber-500 fill-amber-500' : 'text-gray-200'} 
                                        strokeWidth={s <= rating ? 2 : 1.5}
                                    />
                                </button>
                            ))}
                        </div>
                        <span className="text-[10px] font-black text-amber-600 uppercase tracking-[0.2em] mt-5 px-4 py-1.5 bg-white rounded-full shadow-sm border border-amber-100">
                            {['Sangat Buruk', 'Buruk', 'Biasa Saja', 'Bagus', 'Sangat Bagus'][rating - 1]}
                        </span>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em] ml-4 flex items-center gap-2">
                            <MessageSquare size={12} /> Detail Ulasan Toko
                        </label>
                        <textarea 
                            placeholder="Ceritakan detail produk, kecepatan respon toko, atau packing barang..."
                            className="w-full p-6 bg-gray-50 border-0 rounded-[2rem] text-sm font-bold text-gray-900 placeholder:text-gray-300 outline-none focus:ring-4 focus:ring-amber-50 transition-all min-h-[140px] shadow-inner"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                        />
                    </div>
                    
                    <ImageUploadSection 
                        title="Foto Produk Anda"
                        images={shopImages}
                        onUpload={(files) => handleImageChange(files, 'shop')}
                        onRemove={(idx) => removeImage(idx, 'shop')}
                        themeColor="amber"
                    />
                </section>

                {order.delivery_job && (
                    <section className="space-y-8 pt-12 border-t border-gray-50">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 shadow-sm border border-indigo-100/50">
                                <TruckIcon size={24} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Pelayanan Pengiriman</h4>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Bagaimana kecepatan antar & sikap kurir?</p>
                            </div>
                        </div>

                        <div className="flex flex-col items-center py-8 bg-indigo-50/20 rounded-[2.5rem] border border-indigo-100/30">
                            <div className="flex gap-3">
                                {[1, 2, 3, 4, 5].map((s) => (
                                    <button key={s} onClick={() => setDeliveryRating(s)} className="transition-all hover:scale-110 active:scale-90">
                                        <Star 
                                            size={36} 
                                            className={s <= deliveryRating ? 'text-indigo-500 fill-indigo-500' : 'text-gray-200'} 
                                            strokeWidth={s <= deliveryRating ? 2 : 1.5}
                                        />
                                    </button>
                                ))}
                            </div>
                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mt-5 px-4 py-1.5 bg-white rounded-full shadow-sm border border-indigo-100">
                                {['Sangat Buruk', 'Buruk', 'Biasa Saja', 'Bagus', 'Sangat Bagus'][deliveryRating - 1]}
                            </span>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em] ml-4 flex items-center gap-2">
                                <MessageSquare size={12} /> Detail Ulasan Pengiriman
                            </label>
                            <textarea 
                                placeholder="Bagaimana kondisi paket saat diterima? Apakah kurir ramah?"
                                className="w-full p-6 bg-gray-50 border-0 rounded-[2rem] text-sm font-bold text-gray-900 placeholder:text-gray-300 outline-none focus:ring-4 focus:ring-indigo-50 transition-all min-h-[140px] shadow-inner"
                                value={deliveryComment}
                                onChange={(e) => setDeliveryComment(e.target.value)}
                            />
                        </div>

                        <ImageUploadSection 
                            title="Foto Driver / Paket"
                            images={deliveryImages}
                            onUpload={(files) => handleImageChange(files, 'delivery')}
                            onRemove={(idx) => removeImage(idx, 'delivery')}
                            themeColor="indigo"
                        />
                    </section>
                )}
            </div>

            <button 
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full py-6 bg-gray-900 text-white rounded-[2rem] text-xs font-black uppercase tracking-[0.3em] shadow-2xl shadow-gray-300 hover:bg-black hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4 mt-8 group"
            >
                {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Package size={20} className="group-hover:rotate-12 transition-transform" />}
                KIRIM FEEDBACK SEKARANG
            </button>
        </div>
    );
};

const BoxIcon = ({size}:any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>;
const TruckIcon = ({size}:any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
