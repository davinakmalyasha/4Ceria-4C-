import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, Upload, Loader2, CheckCircle2 } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

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
    const [rating, setRating] = useState(isReadOnly ? (order.review?.rating || 5) : 5);
    const [comment, setComment] = useState(isReadOnly ? (order.review?.comment || '') : '');
    const [images, setImages] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>(
        isReadOnly && order.review?.image_paths 
        ? order.review.image_paths.map((p: string) => `/storage/${p}`) 
        : []
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const isOwner = user?.id === order.review?.user_id;
    const effectiveReadOnly = isReadOnly && !isEditing;

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length + previews.length > 3) {
            alert('You can only upload up to 3 images');
            return;
        }

        const newImages = [...images, ...files].slice(0, 3 - previews.length);
        setImages(newImages);
        
        const newPreviews = files.map(file => URL.createObjectURL(file));
        setPreviews([...previews, ...newPreviews]);
    };

    const removeImage = (index: number) => {
        const newPreviews = [...previews];
        newPreviews.splice(index, 1);
        setPreviews(newPreviews);

        // If it was a newly added image, remove from images array too
        // We calculate if it was a new image by its index relative to original previews
        // But for simplicity in "Replace All" strategy, we just manage the UI list
        const imagesIndex = index - (isReadOnly ? (order.review?.image_paths?.length || 0) : 0);
        if (imagesIndex >= 0) {
            const newImages = [...images];
            newImages.splice(imagesIndex, 1);
            setImages(newImages);
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        const formData = new FormData();
        formData.append('rating', rating.toString());
        formData.append('comment', comment);
        
        // Always send images as an array
        images.forEach((img) => {
            formData.append('images[]', img);
        });

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
            alert(error.response?.data?.message || 'Failed to submit review');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Are you sure you want to delete this review?')) return;
        
        setIsSubmitting(true);
        try {
            await axios.delete(`/material-order-reviews/${order.review.id}`);
            alert('Review deleted successfully');
            onSuccess();
            onClose();
        } catch (error: any) {
            alert('Failed to delete review');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden"
                >
                    {/* Header - Fixed at top */}
                    <div className="p-8 pb-4 flex items-center justify-between bg-white shrink-0 z-10 border-b border-gray-50">
                        <div>
                            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
                                {isEditing ? 'Edit Review' : isReadOnly ? 'Order Feedback' : 'Review Order'}
                            </h2>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Order #{order.whatsapp_order_id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {effectiveReadOnly && isOwner && (
                                <>
                                    <button 
                                        onClick={() => setIsEditing(true)}
                                        className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 hover:bg-indigo-100 transition-all shadow-sm"
                                        title="Edit Review"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                    <button 
                                        onClick={handleDelete}
                                        disabled={isSubmitting}
                                        className="p-3 bg-red-50 rounded-2xl text-red-600 hover:bg-red-100 transition-all shadow-sm"
                                        title="Delete Review"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                    </button>
                                </>
                            )}
                            <button onClick={onClose} className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:text-gray-900 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Scrollable Content Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {isSuccess ? (
                            <div className="p-12 flex flex-col items-center justify-center text-center space-y-6">
                                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center text-green-500 animate-bounce">
                                    <CheckCircle2 size={48} strokeWidth={3} />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Review Updated!</h3>
                                    <p className="text-sm font-medium text-gray-500">Your feedback has been successfully modified.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="p-8 space-y-8">
                                {/* Rating Stars */}
                                <div className="flex flex-col items-center justify-center py-4 bg-gray-50 rounded-[2rem] border border-gray-100/50">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Your Experience</span>
                                    <div className="flex items-center gap-2">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <button
                                                key={star}
                                                disabled={effectiveReadOnly}
                                                onClick={() => setRating(star)}
                                                className={`transition-all ${!effectiveReadOnly ? 'hover:scale-110 active:scale-95' : 'cursor-default'}`}
                                            >
                                                <Star 
                                                    size={36} 
                                                    fill={star <= rating ? "#FFD700" : "none"} 
                                                    stroke={star <= rating ? "#FFD700" : "#E5E7EB"}
                                                    strokeWidth={2.5}
                                                    className={star <= rating ? "drop-shadow-[0_0_8px_rgba(255,215,0,0.4)]" : ""}
                                                />
                                            </button>
                                        ))}
                                    </div>
                                    <span className="text-sm font-black text-gray-900 uppercase tracking-tighter mt-4">
                                        {['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating - 1]}
                                    </span>
                                </div>

                                {/* Comment */}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Share more details</label>
                                    <textarea
                                        value={comment}
                                        readOnly={effectiveReadOnly}
                                        onChange={(e) => setComment(e.target.value)}
                                        placeholder={effectiveReadOnly ? "No comment provided." : "Tell us about the material quality, delivery time, or service..."}
                                        className={`w-full h-32 p-6 bg-gray-50 border-0 rounded-[2rem] text-sm font-bold text-gray-900 placeholder:text-gray-300 focus:ring-2 focus:ring-indigo-100 transition-all resize-none shadow-inner ${effectiveReadOnly ? 'cursor-default' : ''}`}
                                    />
                                </div>

                                {/* Multiple Image Display/Upload */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between px-4">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                            {effectiveReadOnly ? "Review Evidence" : "Add Photos (Max 3)"}
                                        </label>
                                        <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">
                                            {previews.length}/3
                                        </span>
                                    </div>
                                    
                                    <div className="grid grid-cols-3 gap-3">
                                        {previews.map((src, idx) => (
                                            <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden shadow-md ring-2 ring-white group">
                                                <img src={src} alt={`Review ${idx}`} className="w-full h-full object-cover" />
                                                {!effectiveReadOnly && (
                                                    <button 
                                                        onClick={() => removeImage(idx)}
                                                        className="absolute top-1 right-1 p-1.5 bg-black/50 backdrop-blur-sm rounded-full text-white hover:bg-red-500 transition-all opacity-0 group-hover:opacity-100"
                                                    >
                                                        <X size={12} strokeWidth={4} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        
                                        {!effectiveReadOnly && previews.length < 3 && (
                                            <label className="aspect-square flex flex-col items-center justify-center bg-indigo-50/30 border-2 border-dashed border-indigo-100 rounded-2xl cursor-pointer hover:bg-indigo-50 transition-all group">
                                                <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageChange} />
                                                <Upload size={20} className="text-indigo-400 group-hover:-translate-y-1 transition-transform" />
                                                <span className="text-[8px] font-black text-indigo-400 mt-1 uppercase tracking-widest">Add</span>
                                            </label>
                                        )}
                                        
                                        {effectiveReadOnly && previews.length === 0 && (
                                            <div className="col-span-3 flex flex-col items-center justify-center h-24 bg-gray-50 border rounded-[2rem] border-gray-100 text-gray-300">
                                                <p className="text-[10px] font-black uppercase tracking-widest">No evidence provided</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Submit Button (Hidden in ReadOnly) */}
                                {!effectiveReadOnly && (
                                    <button
                                        disabled={isSubmitting}
                                        onClick={handleSubmit}
                                        className="w-full py-5 bg-gray-900 text-white rounded-3xl text-sm font-black uppercase tracking-[0.2em] hover:bg-black hover:shadow-xl hover:-translate-y-1 active:translate-y-0 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group shadow-gray-200 shadow-xl"
                                    >
                                        {isSubmitting ? (
                                            <Loader2 className="animate-spin" size={20} />
                                        ) : (
                                            <>{isEditing ? 'UPDATE REVIEW' : 'SUBMIT FEEDBACK'} <Star size={18} className="fill-white group-hover:rotate-12 transition-transform" /></>
                                        )}
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

export default ReviewModal;
