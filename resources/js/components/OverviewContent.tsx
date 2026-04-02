import React from 'react';
import { motion, Variants } from 'framer-motion';
import { Home, Compass, MessageSquare, PlusCircle, ArrowRight, TrendingUp, Sparkles, Building, Briefcase, MapPin, CheckCircle, User as UserIcon, Bell, ChevronRight } from 'lucide-react';

interface Props {
    user: any;
    houses: any[];
    relevantProjects: any[];
    projectFeed?: any[];
    latestBids?: any[];
    isLoadingData: boolean;
    setActiveTab: (tab: string) => void;
    formatCurrency: (amount: number) => string;
    onViewActiveBids?: () => void;
    onEditProfile?: () => void;
}

export default function OverviewContent({ user, houses, relevantProjects, projectFeed = [], latestBids = [], isLoadingData, setActiveTab, formatCurrency, onViewActiveBids, onEditProfile }: Props) {
    const isUser = user?.role_type === 'user';
    const activeProjectsCount = relevantProjects.length;
    const activeBidsCount = relevantProjects.reduce((acc, p) => acc + (p.bids_arsitek_count || 0) + (p.bids_kontraktor_count || 0), 0);


    // Greeting logic
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
            {/* Top Section: 50/50 Split Layout */}
            <div className="flex flex-col lg:flex-row gap-6 items-stretch">
                
                {/* Left Side: Welcome Card (50% width on Desktop) */}
                <motion.div variants={itemVariants} className="w-full lg:w-1/2">
                    <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#FF2D20] to-red-800 shadow-xl shadow-red-500/10 p-8 flex flex-col justify-between h-full min-h-[340px] group">
                        <div className="absolute inset-0 z-0">
                            <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-screen" />
                            <div className="absolute bottom-0 left-1/4 w-48 h-48 bg-orange-400/10 rounded-full blur-3xl mix-blend-screen" />
                            <div className="absolute bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 inset-0" />
                        </div>
                        
                        <div className="relative z-10 flex flex-col justify-between h-full">
                            <div>
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-white border border-white/20 text-xs font-bold uppercase tracking-wider mb-6">
                                    <Sparkles size={14} /> {greeting}
                                </div>
                                <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.1] drop-shadow-md">
                                    Welcome back,<br/> <span className="text-white">{user?.name.split(' ')[0]}</span>
                                </h2>
                                <p className="mt-4 text-red-50 text-sm sm:text-base max-w-sm font-medium opacity-90 leading-relaxed">
                                    {isUser 
                                        ? "Manage your ongoing building projects or discover fresh property listings." 
                                        : "Browse open tenders, track your bids, and grow your architecture business."}
                                </p>
                            </div>

                            <div className="mt-8">
                                <button 
                                    onClick={() => setActiveTab(isUser ? 'post-project' : 'my-bids')}
                                    className="w-full sm:w-auto bg-white hover:bg-gray-50 text-gray-900 px-8 py-4 rounded-2xl font-bold text-sm shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 group/btn"
                                >
                                    {isUser ? (
                                        <><PlusCircle size={20} className="text-[#FF2D20] group-hover/btn:rotate-90 transition-transform duration-500" /> Start New Project</>
                                    ) : (
                                        <><Briefcase size={20} className="text-[#FF2D20]" /> View Pending Bids</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Right Side: Stats Grid (50% width on Desktop, 2x2 layout) */}
                <motion.div variants={itemVariants} className="w-full lg:w-1/2 grid grid-cols-2 gap-4">
                    
                    {/* Stat 1: Active Projects / Open Tenders */}
                    <div className="bg-white/90 backdrop-blur-xl p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-red-100 transition-all group flex flex-col justify-between relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><MessageSquare size={80} /></div>
                        <div>
                            <div className="w-12 h-12 bg-red-50 text-[#FF2D20] rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><MessageSquare size={24} /></div>
                            <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">{isUser ? 'Active Projects' : 'Open Tenders'}</p>
                        </div>
                        <div className="flex items-end justify-between">
                            <h4 className="text-4xl font-black text-gray-900 tracking-tighter">{activeProjectsCount}</h4>
                            <button onClick={() => setActiveTab('projects')} className="text-[#FF2D20] hover:text-red-700 p-2"><ArrowRight size={20} className="group-hover:translate-x-1 transition-transform"/></button>
                        </div>
                    </div>

                    {/* Stat 2: Active Bids (User) OR Marketplace (Pro) */}
                    {isUser ? (
                        <div 
                            onClick={activeBidsCount > 0 ? onViewActiveBids : undefined}
                            className={`bg-white/90 backdrop-blur-xl p-6 rounded-[2rem] border border-gray-100 shadow-sm transition-all group flex flex-col justify-between relative overflow-hidden ${activeBidsCount > 0 ? 'cursor-pointer hover:shadow-xl hover:border-red-100' : ''}`}
                        >
                            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><Sparkles size={80} /></div>
                            <div>
                                <div className="w-12 h-12 bg-red-50 text-[#FF2D20] rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Sparkles size={24} /></div>
                                <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">Active Bids</p>
                            </div>
                            <div className="flex items-end justify-between">
                                <h4 className="text-4xl font-black text-gray-900 tracking-tighter">{activeBidsCount}</h4>
                                {activeBidsCount > 0 && <div className="text-[#FF2D20] p-2"><ArrowRight size={20} className="group-hover:translate-x-1 transition-transform"/></div>}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white/90 backdrop-blur-xl p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-red-100 transition-all group flex flex-col justify-between relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><Home size={80} /></div>
                            <div>
                                <div className="w-12 h-12 bg-red-50 text-[#FF2D20] rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Home size={24} /></div>
                                <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">Marketplace</p>
                            </div>
                            <div className="flex items-end justify-between">
                                <h4 className="text-4xl font-black text-gray-900 tracking-tighter">{houses.length}</h4>
                                <button onClick={() => setActiveTab('houses')} className="text-[#FF2D20] hover:text-red-700 p-2"><ArrowRight size={20} className="group-hover:translate-x-1 transition-transform"/></button>
                            </div>
                        </div>
                    )}

                    {/* Stat 3: Marketplace (User) OR My Bids (Pro) */}
                    {isUser ? (
                        <div className="bg-white/90 backdrop-blur-xl p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-red-100 transition-all group flex flex-col justify-between relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><Home size={80} /></div>
                            <div>
                                <div className="w-12 h-12 bg-red-50 text-[#FF2D20] rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Home size={24} /></div>
                                <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">Marketplace</p>
                            </div>
                            <div className="flex items-end justify-between">
                                <h4 className="text-4xl font-black text-gray-900 tracking-tighter">{houses.length}</h4>
                                <button onClick={() => setActiveTab('houses')} className="text-[#FF2D20] hover:text-red-700 p-2"><ArrowRight size={20} className="group-hover:translate-x-1 transition-transform"/></button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white/90 backdrop-blur-xl p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-red-100 transition-all group flex flex-col justify-between relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><Briefcase size={80} /></div>
                            <div>
                                <div className="w-12 h-12 bg-red-50 text-[#FF2D20] rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Briefcase size={24} /></div>
                                <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">My Bids</p>
                            </div>
                            <div className="flex items-end justify-between">
                                <h4 className="text-4xl font-black text-gray-900 tracking-tighter">{relevantProjects.length}</h4>
                                <button onClick={() => setActiveTab('my-bids')} className="text-[#FF2D20] hover:text-red-700 p-2"><ArrowRight size={20} className="group-hover:translate-x-1 transition-transform"/></button>
                            </div>
                        </div>
                    )}

                    {/* Stat 4: Your Listings (User) OR Placeholder/Empty (Pro) */}
                    {isUser ? (
                        <div className="bg-white/90 backdrop-blur-xl p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-red-100 transition-all group flex flex-col justify-between relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><Building size={80} /></div>
                            <div>
                                <div className="w-12 h-12 bg-red-50 text-[#FF2D20] rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Building size={24} /></div>
                                <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">Your Listings</p>
                            </div>
                            <div className="flex items-end justify-between">
                                <h4 className="text-4xl font-black text-gray-900 tracking-tighter">{houses.filter(h => h.user_id === user?.id).length}</h4>
                                <button onClick={() => setActiveTab('my-houses')} className="text-[#FF2D20] hover:text-red-700 p-2"><ArrowRight size={20} className="group-hover:translate-x-1 transition-transform"/></button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gradient-to-br from-gray-50 to-white/50 p-6 rounded-[2rem] border border-dashed border-gray-200 flex flex-col items-center justify-center text-center group">
                            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1 opacity-50">Pro Dashboard</p>
                            <Sparkles size={20} className="text-[#FF2D20]/20 group-hover:scale-125 transition-transform" />
                        </div>
                    )}

                </motion.div>
            </div>

            {/* Professional Onboarding Section */}
            {!isUser && (user?.role_type === 'arsitek' || user?.role_type === 'kontraktor') && (
                <motion.div variants={itemVariants} className="bg-red-50/50 border border-red-100 rounded-3xl p-6 sm:p-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="space-y-1">
                            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <CheckCircle className="text-[#FF2D20]" size={20} /> 
                                Complete Your Professional Setup
                            </h3>
                            <p className="text-gray-600">Finish these steps to start bidding on projects and growing your business.</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {/* Profile Check */}
                            {((user?.arsitek?.rate_harga === 0 || !user?.arsitek?.lokasi) && user?.role_type === 'arsitek') || 
                             ((user?.kontraktor?.rate_harga === 0 || !user?.kontraktor?.alamat) && user?.role_type === 'kontraktor') ? (
                                <button 
                                    onClick={() => { setActiveTab('profile'); onEditProfile?.(); }}
                                    className="bg-white hover:bg-gray-50 text-[#FF2D20] border border-red-200 px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2 group"
                                >
                                    <UserIcon size={16} /> Fill Profile <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                </button>
                            ) : (
                                <div className="bg-green-100 text-green-700 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                                    <CheckCircle size={16} /> Profile Ready
                                </div>
                            )}

                            {/* Verification Check */}
                            {(user?.arsitek?.verification_status !== 'verified' && user?.role_type === 'arsitek') || 
                             (user?.kontraktor?.verification_status !== 'verified' && user?.role_type === 'kontraktor') ? (
                                <button 
                                    onClick={() => { setActiveTab('profile'); onEditProfile?.(); }}
                                    className="bg-[#FF2D20] hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2 group"
                                >
                                    <Building size={16} /> Get Verified <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                </button>
                            ) : (
                                <div className="bg-green-100 text-green-700 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                                    <CheckCircle size={16} /> Verified
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}


            {/* Content Grids */}
            <div className={`grid grid-cols-1 lg:grid-cols-${isUser ? '2' : '1'} gap-8`}>
                
                {/* Latest Bids OR Project Feed Replacing Fresh Listings */}
                <motion.div variants={itemVariants} className="space-y-5">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            {isUser ? (
                                <><Bell className="text-[#FF2D20]" size={20}/> Latest Bids Received</>
                            ) : (
                                <><TrendingUp className="text-[#FF2D20]" size={20}/> Latest Projects Feed</>
                            )}
                        </h3>
                        <button onClick={() => setActiveTab(isUser ? 'projects' : 'projects')} className="text-sm font-bold text-[#FF2D20] hover:text-red-700 flex items-center gap-1 group">
                            Explore <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform"/>
                        </button>
                    </div>
                    
                    <div className="space-y-4">
                        {isLoadingData ? (
                            Array(2).fill(0).map((_, i) => <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-3xl" />)
                        ) : (isUser ? latestBids : projectFeed).slice(0, 4).map((item: any) => (
                            <div 
                                key={item.id} 
                                className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-all group cursor-pointer flex items-center justify-between gap-4"
                                onClick={() => setActiveTab('projects')}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-bold text-gray-900 truncate group-hover:text-[#FF2D20] transition-colors">
                                            {isUser ? `Bid for: ${item.project_title}` : item.title}
                                        </h4>
                                        {isUser && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-full uppercase border border-gray-200">New Bid</span>}
                                        {!isUser && item.is_new && <span className="px-2 py-0.5 bg-red-100 text-[#FF2D20] text-[10px] font-bold rounded-full uppercase">New</span>}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                        <span className="font-bold text-[#FF2D20]">{formatCurrency(item.price || item.budget)}</span>
                                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                                        <span className="truncate">{isUser ? (item.bidder?.name || 'Professional') : `${item.type || 'General'}`}</span>
                                    </div>
                                </div>
                                <div className="p-2 rounded-xl bg-gray-50 text-gray-400 group-hover:bg-red-50 group-hover:text-[#FF2D20] transition-colors">
                                    <ChevronRight size={18} />
                                </div>
                            </div>
                        ))}
                        
                        {/* Empty States */}
                        {((isUser && latestBids.length === 0) || (!isUser && projectFeed.length === 0)) && !isLoadingData && (
                            <div className="bg-gray-50/50 border border-dashed border-gray-200 rounded-3xl p-8 text-center">
                                <p className="text-gray-400 text-sm font-medium">No {isUser ? 'new bids' : 'suggested projects'} to show.</p>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* My Recent Projects */}
                <motion.div variants={itemVariants} className="space-y-5">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <Briefcase className="text-[#FF2D20]" size={20}/> 
                            {isUser ? 'Recent Projects' : 'Active Tenders'}
                        </h3>
                        <button onClick={() => setActiveTab('projects')} className="text-sm font-bold text-[#FF2D20] hover:text-red-700 flex items-center gap-1 group">
                            View Board <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform"/>
                        </button>
                    </div>
                    <div className="space-y-4">
                        {isLoadingData ? (
                            Array(3).fill(0).map((_, i) => <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-3xl" />)
                        ) : relevantProjects.slice(0, 4).map((p) => {
                            const statusColors: any = {
                                open: 'bg-red-50 text-[#FF2D20] border-red-100',
                                'in-progress': 'bg-gray-100 text-gray-700 border-gray-200',
                                completed: 'bg-gray-900 text-white border-gray-800'
                            };
                            const sColor = statusColors[p.status?.toLowerCase()] || 'bg-gray-100 text-gray-700';
                            
                            return (
                                <div key={p.id} onClick={() => setActiveTab('projects')} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md hover:border-[#FF2D20]/30 transition-all cursor-pointer group flex items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1.5">
                                            <h4 className="font-bold text-gray-900 truncate group-hover:text-[#FF2D20] transition-colors text-lg">{p.title}</h4>
                                            <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full border ${sColor}`}>
                                                {p.status}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-gray-500">
                                            <span className="font-semibold text-[#FF2D20]">{formatCurrency(p.budget)}</span>
                                            <span className="w-1 h-1 rounded-full bg-gray-300" />
                                            <span className="truncate">Type: {p.type}</span>
                                        </div>
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-red-50 group-hover:text-[#FF2D20] transition-colors shrink-0">
                                        <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                                    </div>
                                </div>
                            );
                        })}
                        {!isLoadingData && relevantProjects.length === 0 && (
                            <div className="bg-white border border-gray-100 border-dashed rounded-3xl p-8 text-center flex flex-col items-center justify-center">
                                <MessageSquare size={32} className="text-gray-300 mb-3" />
                                <p className="text-gray-500 font-medium">No active projects right now.</p>
                                <button onClick={() => setActiveTab('post-project')} className="text-[#FF2D20] font-bold text-sm mt-2 hover:underline">Start one today</button>
                            </div>
                        )}
                    </div>
                </motion.div>

            </div>
        </motion.div>
    );
}
