import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Truck, MapPin, Package, Navigation, CheckCircle } from 'lucide-react';

interface AvailableJob {
    id: number;
    quote_id: number;
    pickup_address: string;
    dropoff_address: string;
    agreed_fee: string;
    estimated_weight: string;
    status: string;
    created_at: string;
}

export default function JobRadarTab() {
    const [jobs, setJobs] = useState<AvailableJob[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [acceptingJobId, setAcceptingJobId] = useState<number | null>(null);

    useEffect(() => {
        fetchJobs();
        const interval = setInterval(() => {
            if (document.hidden) return; // skip polling in background tabs
            fetchJobs();
        }, 10000); // Polling for new pings
        return () => clearInterval(interval);
    }, []);

    const fetchJobs = async () => {
        try {
            const res = await axios.get('/logistics/available-jobs');
            if (res.data.success) {
                setJobs(res.data.data);
            }
        } catch (err) {
            console.error('Failed to fetch jobs:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAcceptJob = async (id: number) => {
        setAcceptingJobId(id);
        try {
            const res = await axios.post(`/logistics/jobs/${id}/accept`);
            if (res.data.success) {
                alert('Job Accepted!');
                fetchJobs();
            }
        } catch (err: any) {
            console.error(err);
            alert(err.response?.data?.message || 'Failed to accept job. Someone might have taken it!');
        } finally {
            setAcceptingJobId(null);
        }
    };

    if (isLoading && jobs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                <p className="mt-4 text-gray-500 font-bold uppercase tracking-widest text-xs">Scanning for jobs...</p>
            </div>
        );
    }

    return (
        <div className="w-full space-y-6">
            <div className="flex flex-col gap-2 mb-8">
                <h3 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                    <Navigation size={28} className="text-indigo-600" />
                    Available Logistics Jobs
                </h3>
                <p className="text-gray-500 font-medium">
                    Accept delivery requests nearby and earn money.
                </p>
            </div>

            {jobs.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-gray-200 rounded-3xl p-12 text-center flex flex-col items-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-6 relative">
                        <motion.div 
                            className="absolute inset-0 border-2 border-gray-200 rounded-full"
                            animate={{ scale: [1, 1.5], opacity: [1, 0] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        />
                        <MapPin size={24} className="text-gray-400 z-10" />
                    </div>
                    <h3 className="text-xl font-black text-gray-900 mb-2">No Jobs Nearby</h3>
                    <p className="text-gray-500">Wait here. New delivery requests will ping automatically.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {jobs.map(job => (
                        <motion.div 
                            key={job.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-white border rounded-3xl p-6 shadow-[0_12px_40px_rgb(0,0,0,0.06)] flex flex-col"
                        >
                            <div className="flex justify-between items-start mb-6 border-b border-gray-100 pb-4">
                                <div>
                                    <h4 className="font-black text-gray-900 text-lg uppercase tracking-tight">Delivery Job #{job.id}</h4>
                                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest mt-1">Platform Delivery</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black tracking-widest uppercase text-gray-400 mb-1">Fee</p>
                                    <p className="font-black text-indigo-600 text-2xl">Rp {parseFloat(job.agreed_fee).toLocaleString('id-ID')}</p>
                                </div>
                            </div>

                            <div className="space-y-4 mb-8">
                                <div className="flex gap-4">
                                    <div className="flex flex-col items-center mt-1">
                                        <div className="w-2 h-2 rounded-full bg-blue-500 ring-4 ring-blue-500/20"></div>
                                        <div className="w-0.5 h-10 border-l-2 border-dashed border-gray-200 my-1"></div>
                                        <div className="w-2 h-2 rounded-full bg-red-500 ring-4 ring-red-500/20"></div>
                                    </div>
                                    <div className="flex-1 space-y-4">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Pickup Store</p>
                                            <p className="text-sm font-semibold text-gray-800 line-clamp-2">{job.pickup_address}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Dropoff Point</p>
                                            <p className="text-sm font-semibold text-gray-800 line-clamp-2">{job.dropoff_address}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-gray-50 rounded-xl p-4 flex gap-4 mt-4">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                        <Package size={16} className="text-indigo-500" />
                                        Load: {job.estimated_weight}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-auto pt-4 border-t border-gray-100 flex gap-3">
                                <button
                                    onClick={() => handleAcceptJob(job.id)}
                                    disabled={acceptingJobId === job.id}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {acceptingJobId === job.id ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    ) : (
                                        <>
                                            <CheckCircle size={18} />
                                            Accept Job
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
