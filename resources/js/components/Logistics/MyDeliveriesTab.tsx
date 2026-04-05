import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Truck, MapPin, Package, CheckCircle, Clock, ChevronRight, AlertCircle, Navigation, Camera, X, Check, Image as ImageIcon, RefreshCw } from 'lucide-react';

interface DeliveryJob {
    id: number;
    quote_id: number;
    pickup_address: string;
    dropoff_address: string;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_lat: number;
    dropoff_lng: number;
    pickup_detail: string;
    dropoff_detail: string;
    agreed_fee: string;
    estimated_weight: string;
    status: 'accepted' | 'picked_up' | 'delivered';
    created_at: string;
    updated_at: string;
}

const CameraModal = ({ isOpen, onClose, onCapture }: { isOpen: boolean, onClose: () => void, onCapture: (file: File) => void }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isStarting, setIsStarting] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

    const startCamera = async () => {
        setIsStarting(true);
        setError(null);
        try {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            const newStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } 
            });
            setStream(newStream);
            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
            }
        } catch (err) {
            console.error("Camera access denied:", err);
            setError("Camera access denied. Please check site permissions.");
        } finally {
            setIsStarting(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            startCamera();
        } else {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                setStream(null);
            }
        }
        return () => {
            if (stream) stream.getTracks().forEach(track => track.stop());
        };
    }, [isOpen, facingMode]);

    const capture = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Flip if using front camera
                if (facingMode === 'user') {
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                }
                ctx.drawImage(video, 0, 0);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const file = new File([blob], `evidence_${Date.now()}.jpg`, { type: 'image/jpeg' });
                        onCapture(file);
                        onClose();
                    }
                }, 'image/jpeg', 0.8);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white w-full max-w-lg rounded-[3rem] overflow-hidden shadow-2xl flex flex-col relative"
            >
                <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                    <h4 className="font-black text-xl text-gray-900 uppercase tracking-tighter">Capture Evidence</h4>
                    <button onClick={onClose} className="p-3 bg-gray-100 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="relative aspect-[4/3] bg-black">
                    {isStarting && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4">
                            <Clock className="animate-spin text-indigo-400" size={32} />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Initializing Camera...</p>
                        </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-8 text-center gap-4">
                            <AlertCircle className="text-red-500" size={48} />
                            <p className="font-bold text-gray-300">{error}</p>
                            <button onClick={onClose} className="bg-white/10 hover:bg-white/20 px-6 py-3 rounded-xl font-bold transition-all">Go Back</button>
                        </div>
                    )}
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                    />
                    <canvas ref={canvasRef} className="hidden" />
                </div>

                <div className="p-10 bg-gray-50 flex items-center justify-center gap-6">
                    <button 
                        onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                        className="p-5 bg-white border border-gray-200 rounded-3xl text-gray-500 hover:text-indigo-600 hover:shadow-lg transition-all"
                    >
                        <ImageIcon size={24} />
                    </button>
                    
                    <button 
                        onClick={capture}
                        className="w-20 h-20 bg-indigo-600 rounded-full border-8 border-white shadow-xl flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all"
                    >
                        <Camera size={32} />
                    </button>

                    <div className="w-14" /> {/* Spacer */}
                </div>
            </motion.div>
        </div>
    );
};

const DeliveryJobCard = ({ job, onStatusUpdate }: { job: DeliveryJob, onStatusUpdate: (id: number, nextStatus: 'picked_up' | 'delivered', photos?: File[]) => Promise<void> }) => {
    const [subStep, setSubStep] = useState<'idle' | 'heading' | 'arrived' | 'uploading'>('idle');
    const [photos, setPhotos] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            const totalFiles = [...photos, ...newFiles].slice(0, 3);
            setPhotos(totalFiles);
        }
    };

    const handleCapture = (file: File) => {
        const totalFiles = [...photos, file].slice(0, 3);
        setPhotos(totalFiles);
    };

    const removePhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const openInMaps = (address: string, lat?: number, lng?: number) => {
        let query = encodeURIComponent(address);
        if (lat && lng) {
            query = `${lat},${lng}`;
        }
        const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
        window.open(url, '_blank');
    };

    const handleMainAction = async () => {
        if (subStep === 'idle') {
            setSubStep('arrived');
        } else if (subStep === 'arrived') {
            if (photos.length < 1) return alert('Please take at least 1 photo as evidence.');
            setIsSubmitting(true);
            const nextStatus = job.status === 'accepted' ? 'picked_up' : 'delivered';
            await onStatusUpdate(job.id, nextStatus, photos);
            setIsSubmitting(false);
            setSubStep('idle');
            setPhotos([]);
        }
    };

    const getButtonConfig = () => {
        if (isSubmitting) return { text: 'SUBMITTING...', icon: <Clock className="animate-spin" />, color: 'bg-gray-400' };

        if (job.status === 'accepted') {
            if (subStep === 'idle') return { text: 'ARRIVED AT PICKUP', icon: <MapPin size={20} />, color: 'bg-amber-600' };
            if (subStep === 'arrived') return { text: photos.length > 0 ? 'CONFIRM PICKUP' : 'TAKE PHOTOS FIRST', icon: <Package size={20} />, color: photos.length > 0 ? 'bg-indigo-600' : 'bg-gray-400', disabled: photos.length === 0 };
        } else if (job.status === 'picked_up') {
            if (subStep === 'idle') return { text: 'ARRIVED AT DESTINATION', icon: <MapPin size={20} />, color: 'bg-amber-600' };
            if (subStep === 'arrived') return { text: photos.length > 0 ? 'CONFIRM DELIVERY' : 'TAKE PHOTOS FIRST', icon: <CheckCircle size={20} />, color: photos.length > 0 ? 'bg-emerald-600' : 'bg-gray-400', disabled: photos.length === 0 };
        }
        
        return { text: 'DELIVERY COMPLETED', icon: <CheckCircle size={20} />, color: 'bg-slate-100 text-slate-400', disabled: true };
    };

    const config = getButtonConfig();
    const currentDetail = job.status === 'accepted' ? job.pickup_detail : job.dropoff_detail;

    return (
        <motion.div 
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.04)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)] transition-all flex flex-col h-full"
        >
            {/* Camera Overlay */}
            <CameraModal 
                isOpen={isCameraOpen} 
                onClose={() => setIsCameraOpen(false)} 
                onCapture={handleCapture}
            />

            {/* Status Header */}
            <div className={`px-8 py-5 flex items-center justify-between ${
                job.status === 'accepted' ? 'bg-amber-50 text-amber-700' :
                job.status === 'picked_up' ? 'bg-blue-50 text-blue-700' :
                'bg-emerald-50 text-emerald-700'
            }`}>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${
                        job.status === 'accepted' ? 'bg-amber-500' :
                        job.status === 'picked_up' ? 'bg-blue-500' :
                        'bg-emerald-500'
                    }`} />
                    <span className="text-xs font-black uppercase tracking-[0.2em]">{job.status.replace('_', ' ')}</span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Job #{job.id}</span>
            </div>

            <div className="p-8 flex-1 flex flex-col">
                {/* Detailed Location Hero */}
                {currentDetail && (
                    <div className="mb-8 p-6 bg-indigo-50 rounded-[2.5rem] border border-indigo-100/50">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Detailed Destination Info</p>
                        <p className="font-black text-indigo-900 text-2xl uppercase tracking-tighter leading-tight">
                            {currentDetail}
                        </p>
                    </div>
                )}

                <div className="flex justify-between items-start mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-indigo-500 shadow-sm border border-gray-100">
                            <Package size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Payload Weight</p>
                            <p className="font-black text-gray-900 text-lg uppercase tracking-tight">{job.estimated_weight}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Earnings</p>
                        <p className="font-black text-indigo-600 text-xl tracking-tighter">Rp {parseFloat(job.agreed_fee).toLocaleString('id-ID')}</p>
                    </div>
                </div>

                {/* Route visualization */}
                <div className="space-y-6 mb-10 relative">
                    <div className="absolute left-[7px] top-[10px] bottom-[10px] w-0.5 bg-gradient-to-b from-blue-500/20 via-gray-100 to-red-500/20" />
                    
                    <div className="flex gap-4 group">
                        <div className={`w-4 h-4 rounded-full ${job.status === 'accepted' ? 'bg-blue-500 ring-blue-500/10' : 'bg-gray-300 ring-gray-300/10'} ring-4 z-10 group-hover:scale-125 transition-transform`} />
                        <div className="flex-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1 leading-none">Pickup Store</p>
                            <p className="text-sm font-bold text-gray-800 leading-snug">{job.pickup_address}</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-4 group">
                        <div className={`w-4 h-4 rounded-full ${job.status === 'picked_up' ? 'bg-red-500 ring-red-500/10' : 'bg-gray-300 ring-gray-300/10'} ring-4 z-10 group-hover:scale-125 transition-transform`} />
                        <div className="flex-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1 leading-none">Delivery Destination</p>
                            <p className="text-sm font-bold text-gray-800 leading-snug">{job.dropoff_address}</p>
                        </div>
                    </div>
                </div>

                {/* Evidence Section (Shows when arrived) */}
                {subStep === 'arrived' && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mb-8 p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Photo Evidence (Min 1, Max 3)</p>
                            <span className="text-[10px] font-bold px-2 py-1 bg-white rounded-lg text-indigo-600 shadow-sm border border-slate-100">
                                {photos.length}/3 Selected
                            </span>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-3">
                            {photos.map((photo, i) => (
                                <div key={i} className="relative aspect-square rounded-xl overflow-hidden group border-2 border-white shadow-sm">
                                    <img src={URL.createObjectURL(photo)} alt="Evidence" className="w-full h-full object-cover" />
                                    <button 
                                        onClick={() => removePhoto(i)}
                                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                            {photos.length < 3 && (
                                <div className="grid grid-cols-1 gap-2">
                                    <button 
                                        onClick={() => setIsCameraOpen(true)}
                                        className="aspect-square rounded-xl border-2 border-dashed border-indigo-200 flex flex-col items-center justify-center gap-2 bg-indigo-50/50 hover:bg-indigo-50 hover:border-indigo-400 transition-all group"
                                    >
                                        <Camera size={20} className="text-indigo-400 group-hover:text-indigo-600 transition-colors" />
                                        <span className="text-[8px] font-black uppercase tracking-widest text-indigo-600">Camera</span>
                                    </button>
                                    <label className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 hover:border-slate-400 hover:bg-white transition-all cursor-pointer group">
                                        <ImageIcon size={20} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600">Gallery</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                                    </label>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* Action Footers */}
                <div className="mt-auto pt-6 border-t border-gray-50 space-y-3">
                    <div className="flex gap-3">
                        {job.status !== 'delivered' && (
                            <button 
                                onClick={() => {
                                    if (job.status === 'accepted') {
                                        openInMaps(job.pickup_address, job.pickup_lat, job.pickup_lng);
                                    } else {
                                        openInMaps(job.dropoff_address, job.dropoff_lat, job.dropoff_lng);
                                    }
                                }}
                                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black py-4 px-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                <Navigation size={18} />
                                <span className="text-xs uppercase tracking-widest">Maps</span>
                            </button>
                        )}
                        <button 
                            onClick={handleMainAction}
                            disabled={config.disabled || isSubmitting}
                            className={`${job.status !== 'delivered' ? 'flex-[2]' : 'w-full'} ${config.color} text-white font-black py-4 px-6 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50`}
                        >
                            {config.icon}
                            {config.text}
                        </button>
                    </div>
                    
                    {subStep !== 'idle' && !isSubmitting && job.status !== 'delivered' && (
                        <button 
                            onClick={() => { setSubStep('idle'); setPhotos([]); }}
                            className="w-full mt-3 text-gray-400 font-bold text-[10px] uppercase tracking-widest hover:text-red-500 transition-colors"
                        >
                            Reset Progress
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default function MyDeliveriesTab() {
    const [jobs, setJobs] = useState<DeliveryJob[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchMyJobs();
    }, []);

    const fetchMyJobs = async () => {
        try {
            const res = await axios.get('/logistics/my-jobs');
            if (res.data.success) {
                setJobs(res.data.data);
            }
        } catch (err) {
            console.error('Failed to fetch my jobs:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateStatus = async (id: number, nextStatus: 'picked_up' | 'delivered', photoFiles?: File[]) => {
        try {
            const formData = new FormData();
            formData.append('status', nextStatus);
            if (photoFiles) {
                photoFiles.forEach((file) => {
                    formData.append('photos[]', file);
                });
            }

            const res = await axios.post(`/logistics/jobs/${id}/status`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                setJobs(prev => prev.map(job => 
                    job.id === id ? { ...job, status: nextStatus } : job
                ));
            }
        } catch (err: any) {
            console.error(err);
            alert(err.response?.data?.message || 'Failed to update job status.');
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                <p className="mt-4 text-gray-500 font-bold uppercase tracking-widest text-[10px]">Loading deliveries...</p>
            </div>
        );
    }

    return (
        <div className="w-full space-y-8">
            <div className="flex flex-col gap-2 mb-4">
                <h3 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Truck size={28} />
                    </div>
                    My Delivery Pipeline
                </h3>
                <p className="text-gray-500 font-medium">
                    Manage your ongoing deliveries and update their status.
                </p>
            </div>

            {jobs.length === 0 ? (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white border-2 border-dashed border-gray-200 rounded-[2.5rem] p-16 text-center flex flex-col items-center"
                >
                    <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6 relative">
                         <div className="absolute inset-0 bg-indigo-500/5 rounded-full animate-ping" />
                        <Package size={40} className="text-gray-300 z-10" />
                    </div>
                    <h3 className="text-2xl font-black text-gray-900 mb-3">No Active Deliveries</h3>
                    <p className="text-gray-500 max-w-sm mx-auto mb-8 leading-relaxed">
                        You haven't accepted any jobs yet. Head over to the Job Radar to find available requests and start earning.
                    </p>
                    <button 
                        onClick={() => window.location.hash = 'job-radar'}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-10 rounded-2xl shadow-xl shadow-indigo-600/20 transition-all hover:-translate-y-1 active:translate-y-0"
                    >
                        Go to Job Radar
                    </button>
                </motion.div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <AnimatePresence>
                        {jobs.map(job => (
                            <DeliveryJobCard key={job.id} job={job} onStatusUpdate={handleUpdateStatus} />
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}

