import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Truck, MapPin, Package, Clock, CheckCircle, Phone, MessageSquare } from 'lucide-react';

interface DeliveryJob {
    id: number;
    quote_id: number;
    pickup_address: string;
    dropoff_address: string;
    agreed_fee: number;
    estimated_weight: string;
    status: 'pending' | 'accepted' | 'picked_up' | 'delivered';
    created_at: string;
    driver_name?: string;
    driver_user_id?: number;
    driver_phone?: string;
    vehicle_type?: string;
    license_plate?: string;
}

export default function DeliveryJobsTab() {
    const [jobs, setJobs] = useState<DeliveryJob[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchJobs();
        const interval = setInterval(fetchJobs, 10000); // Mock polling for driver acceptance
        return () => clearInterval(interval);
    }, []);

    const fetchJobs = async () => {
        try {
            const res = await axios.get('/delivery-jobs');
            if (res.data.success) {
                setJobs(res.data.data);
            }
        } catch (err) {
            console.error('Failed to fetch delivery jobs:', err);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                <p className="mt-4 text-gray-500 font-bold uppercase tracking-widest text-xs">Loading Delivery Jobs...</p>
            </div>
        );
    }

    return (
        <div className="w-full space-y-6">
            <div className="flex flex-col gap-2 mb-8">
                <h3 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                    <Truck size={28} className="text-indigo-600" />
                    Platform Delivery Status
                </h3>
                <p className="text-gray-500 font-medium">
                    Monitor your requested courier dispatches and live tracking.
                </p>
            </div>

            {jobs.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-gray-200 rounded-3xl p-12 text-center flex flex-col items-center">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                        <Truck size={32} className="text-gray-400" />
                    </div>
                    <h3 className="text-xl font-black text-gray-900 mb-2">No Active Deliveries</h3>
                    <p className="text-gray-500">You haven't requested any platform couriers recently.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {jobs.map(job => (
                        <DeliveryJobCard key={job.id} job={job} />
                    ))}
                </div>
            )}
        </div>
    );
}

function DeliveryJobCard({ job }: { job: DeliveryJob }) {
    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border rounded-3xl overflow-hidden shadow-[0_12px_40px_rgb(0,0,0,0.06)] flex flex-col"
        >
            <div className="relative h-48 bg-slate-900 flex items-center justify-center overflow-hidden">
                {/* Mock Map Background Grid */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px]"></div>
                
                {job.status === 'pending' ? (
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="relative flex justify-center items-center w-16 h-16">
                            <motion.div 
                                className="absolute inset-0 border-2 border-indigo-400 rounded-full"
                                animate={{ scale: [1, 2.5], opacity: [1, 0] }}
                                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                            />
                            <motion.div 
                                className="absolute inset-0 border-2 border-indigo-500 rounded-full"
                                animate={{ scale: [1, 2.5], opacity: [1, 0] }}
                                transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.6 }}
                            />
                            <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.5)] z-10">
                                <MapPin className="text-white w-6 h-6" />
                            </div>
                        </div>
                        <p className="mt-4 text-indigo-400 font-bold uppercase tracking-widest text-[10px]">Searching for Drivers nearby...</p>
                    </div>
                ) : (
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-16 h-16 bg-emerald-500 rounded-full border-4 border-slate-900 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                            <Truck className="text-white w-8 h-8" />
                        </div>
                        <p className="mt-4 text-emerald-400 font-bold uppercase tracking-widest text-[10px]">Driver Found & En-Route</p>
                    </div>
                )}
            </div>

            <div className="p-6">
                {job.status !== 'pending' && job.driver_name && (
                    <div className="mb-6 -mt-10 relative z-20">
                        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-4 flex items-center gap-4">
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                                <span className="font-bold text-gray-400">{job.driver_name.substring(0, 2).toUpperCase()}</span>
                            </div>
                            <div className="flex-1">
                                <h4 className="font-bold text-gray-900 text-sm">{job.driver_name}</h4>
                                <p className="text-xs text-gray-500 font-medium tracking-tight mb-1">{job.vehicle_type}</p>
                                <div className="inline-block bg-yellow-400 text-slate-900 font-black tracking-widest text-[10px] px-2 py-0.5 rounded uppercase">{job.license_plate}</div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-center mb-6">
                    <div className="px-3 py-1 bg-gray-100 rounded-lg text-gray-500 text-[10px] font-black uppercase tracking-widest">
                        JOB #{job.id}
                    </div>
                    <div className="flex items-center gap-1.5 text-indigo-600 font-bold text-sm bg-indigo-50 px-3 py-1 rounded-lg">
                        Rp {parseFloat(job.agreed_fee.toString()).toLocaleString('id-ID')}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="flex flex-col items-center mt-1">
                            <div className="w-2 h-2 rounded-full bg-blue-500 ring-4 ring-blue-500/20"></div>
                            <div className="w-0.5 h-10 border-l-2 border-dashed border-gray-200 my-1"></div>
                            <div className="w-2 h-2 rounded-full bg-red-500 ring-4 ring-red-500/20"></div>
                        </div>
                        <div className="flex-1 space-y-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Pickup Store</p>
                                <p className="text-sm font-semibold text-gray-800 line-clamp-1">{job.pickup_address}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Dropoff Job Site</p>
                                <p className="text-sm font-semibold text-gray-800 line-clamp-1">{job.dropoff_address}</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Estimated Load</p>
                            <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                                <Package size={14} className="text-indigo-500" />
                                {job.estimated_weight || 'N/A'}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Status</p>
                            <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 capitalize">
                                {job.status === 'pending' ? <Clock size={14} className="text-amber-500" /> : <CheckCircle size={14} className="text-emerald-500" />}
                            </p>
                        </div>
                    </div>

                    {job.status !== 'pending' && job.driver_user_id && (
                        <div className="pt-4 flex gap-2 border-t border-gray-100 mt-2">
                            <button 
                                onClick={() => handleChat(job.driver_user_id!)}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 font-bold text-xs hover:bg-indigo-100 transition-all border border-indigo-100 active:scale-95"
                            >
                                <MessageSquare size={14} />
                                Chat Internally
                            </button>
                            <button 
                                onClick={() => handleWhatsApp(job.driver_phone || '')}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-50 text-emerald-600 font-bold text-xs hover:bg-emerald-100 transition-all border border-emerald-100 active:scale-95"
                            >
                                <Phone size={14} />
                                WhatsApp
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

const handleChat = (userId: number) => {
    window.dispatchEvent(new CustomEvent('start_chat', { detail: userId }));
};

const handleWhatsApp = (phone: string) => {
    if (!phone) {
        alert('Driver phone number not available.');
        return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}`, '_blank');
};

