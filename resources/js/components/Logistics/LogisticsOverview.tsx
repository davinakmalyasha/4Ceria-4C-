import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, Variants } from 'framer-motion';
import { 
    Truck, Package, Navigation, DollarSign, CheckCircle, 
    Clock, ArrowRight, Sparkles, MapPin, TrendingUp 
} from 'lucide-react';

interface Props {
    user: any;
    setActiveTab: (tab: string) => void;
}

interface JobStats {
    available: number;
    accepted: number;
    completed: number;
    totalEarnings: number;
}

export default function LogisticsOverview({ user, setActiveTab }: Props) {
    const [stats, setStats] = useState<JobStats>({ available: 0, accepted: 0, completed: 0, totalEarnings: 0 });
    const [recentJobs, setRecentJobs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const res = await axios.get('/logistics/dashboard-stats');
            if (res.data.success) {
                setStats(res.data.stats);
                setRecentJobs(res.data.recentJobs || []);
            }
        } catch (err) {
            console.error('Failed to load stats:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
    };

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-8 pb-10">
            {/* Hero Section */}
            <div className="flex flex-col lg:flex-row gap-6 items-stretch">
                <motion.div variants={itemVariants} className="w-full lg:w-1/2">
                    <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 to-indigo-950 shadow-xl shadow-indigo-500/10 p-8 flex flex-col justify-between h-full min-h-[340px]">
                        <div className="absolute inset-0 z-0">
                            <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/15 rounded-full blur-3xl" />
                            <div className="absolute bottom-0 left-1/4 w-48 h-48 bg-cyan-400/10 rounded-full blur-3xl" />
                            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px]" />
                        </div>

                        <div className="relative z-10 flex flex-col justify-between h-full">
                            <div>
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-white border border-white/20 text-xs font-bold uppercase tracking-wider mb-6">
                                    <Sparkles size={14} /> {greeting}
                                </div>
                                <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.1] drop-shadow-md">
                                    Welcome back,<br/> <span className="text-indigo-300">{user?.name?.split(' ')[0]}</span>
                                </h2>
                                <p className="mt-4 text-indigo-200 text-sm sm:text-base max-w-sm font-medium opacity-90 leading-relaxed">
                                    Check for available delivery jobs and start earning today.
                                </p>
                            </div>

                            <div className="mt-8 flex gap-3">
                                <button 
                                    onClick={() => setActiveTab('job-radar')}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-4 rounded-2xl font-bold text-sm shadow-lg shadow-indigo-600/30 hover:shadow-xl transition-all active:scale-95 flex items-center gap-3 group"
                                >
                                    <Navigation size={20} />
                                    Browse Jobs
                                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                                </button>
                                <button 
                                    onClick={() => setActiveTab('my-deliveries')}
                                    className="bg-white/10 hover:bg-white/15 text-white border border-white/20 px-6 py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center gap-3"
                                >
                                    <Truck size={20} />
                                    My Deliveries
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Stats Grid */}
                <motion.div variants={itemVariants} className="w-full lg:w-1/2 grid grid-cols-2 gap-4">
                    {/* Available Jobs */}
                    <div 
                        onClick={() => setActiveTab('job-radar')}
                        className="bg-white/90 backdrop-blur-xl p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all group flex flex-col justify-between relative overflow-hidden cursor-pointer"
                    >
                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><Navigation size={80} /></div>
                        <div>
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Navigation size={24} /></div>
                            <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">Available Jobs</p>
                        </div>
                        <div className="flex items-end justify-between">
                            <h4 className="text-4xl font-black text-gray-900 tracking-tighter">
                                {isLoading ? <span className="inline-block w-10 h-8 bg-gray-100 animate-pulse rounded-lg"></span> : stats.available}
                            </h4>
                            <div className="text-indigo-600 p-2"><ArrowRight size={20} className="group-hover:translate-x-1 transition-transform"/></div>
                        </div>
                    </div>

                    {/* Active Deliveries */}
                    <div 
                        onClick={() => setActiveTab('my-deliveries')}
                        className="bg-white/90 backdrop-blur-xl p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-amber-100 transition-all group flex flex-col justify-between relative overflow-hidden cursor-pointer"
                    >
                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><Truck size={80} /></div>
                        <div>
                            <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Truck size={24} /></div>
                            <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">Active Deliveries</p>
                        </div>
                        <div className="flex items-end justify-between">
                            <h4 className="text-4xl font-black text-gray-900 tracking-tighter">
                                {isLoading ? <span className="inline-block w-10 h-8 bg-gray-100 animate-pulse rounded-lg"></span> : stats.accepted}
                            </h4>
                            <div className="text-amber-500 p-2"><ArrowRight size={20} className="group-hover:translate-x-1 transition-transform"/></div>
                        </div>
                    </div>

                    {/* Completed */}
                    <div className="bg-white/90 backdrop-blur-xl p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-emerald-100 transition-all group flex flex-col justify-between relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><CheckCircle size={80} /></div>
                        <div>
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><CheckCircle size={24} /></div>
                            <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">Completed</p>
                        </div>
                        <div className="flex items-end justify-between">
                            <h4 className="text-4xl font-black text-gray-900 tracking-tighter">
                                {isLoading ? <span className="inline-block w-10 h-8 bg-gray-100 animate-pulse rounded-lg"></span> : stats.completed}
                            </h4>
                        </div>
                    </div>

                    {/* Total Earnings */}
                    <div className="bg-white/90 backdrop-blur-xl p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-emerald-100 transition-all group flex flex-col justify-between relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><TrendingUp size={80} /></div>
                        <div>
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><DollarSign size={24} /></div>
                            <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">Total Earnings</p>
                        </div>
                        <div className="flex items-end justify-between">
                            <h4 className="text-2xl font-black text-gray-900 tracking-tighter">
                                {isLoading ? <span className="inline-block w-20 h-8 bg-gray-100 animate-pulse rounded-lg"></span> : `Rp ${stats.totalEarnings.toLocaleString('id-ID')}`}
                            </h4>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Recent Jobs Feed */}
            <motion.div variants={itemVariants} className="space-y-5">
                <div className="flex items-center justify-between px-1">
                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Clock className="text-indigo-600" size={20}/> Recent Activity
                    </h3>
                    <button onClick={() => setActiveTab('my-deliveries')} className="text-sm font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 group">
                        View All <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform"/>
                    </button>
                </div>

                <div className="space-y-4">
                    {isLoading ? (
                        Array(3).fill(0).map((_, i) => <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-3xl" />)
                    ) : recentJobs.length > 0 ? recentJobs.slice(0, 5).map((job: any) => (
                        <div key={job.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-all group flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                    job.status === 'pending' ? 'bg-amber-50 text-amber-500' :
                                    job.status === 'accepted' ? 'bg-blue-50 text-blue-500' :
                                    'bg-emerald-50 text-emerald-500'
                                }`}>
                                    {job.status === 'pending' ? <Clock size={18} /> : 
                                     job.status === 'accepted' ? <Truck size={18} /> : 
                                     <CheckCircle size={18} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-bold text-gray-900 truncate text-sm">Job #{job.id}</h4>
                                        <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full border ${
                                            job.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                            job.status === 'accepted' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                            'bg-emerald-50 text-emerald-600 border-emerald-200'
                                        }`}>
                                            {job.status}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <MapPin size={12} />
                                        <span className="truncate">{job.pickup_address} → {job.dropoff_address}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="font-black text-indigo-600 text-sm">Rp {parseFloat(job.agreed_fee).toLocaleString('id-ID')}</p>
                            </div>
                        </div>
                    )) : (
                        <div className="bg-gray-50/50 border border-dashed border-gray-200 rounded-3xl p-8 text-center">
                            <Package size={32} className="text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-400 text-sm font-medium">No delivery activity yet.</p>
                            <button onClick={() => setActiveTab('job-radar')} className="text-indigo-600 font-bold text-sm mt-2 hover:underline">
                                Browse available jobs
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
