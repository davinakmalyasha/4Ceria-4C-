import React from 'react';
import { motion, Variants } from 'framer-motion';
import { Sparkles, Plus, Compass, FolderKanban, ArrowRight } from 'lucide-react';
import OverviewStats from './Overview/OverviewStats';
import OverviewProjectCards from './Overview/OverviewProjectCards';
import OverviewQuickActions from './Overview/OverviewQuickActions';

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
    openTendersCount?: number;
    myBidsCount?: number;
    myProjectsCount?: number;
    onPostProject?: () => void;
    onViewProject?: (project: any) => void;
}

const container: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const item: Variants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } } };

export default function OverviewContent({
    user, relevantProjects, isLoadingData, setActiveTab, formatCurrency,
    onViewActiveBids, onEditProfile, openTendersCount = 0, myBidsCount = 0,
    myProjectsCount = 0, onPostProject, onViewProject,
}: Props) {
    const isUser = user?.role_type === 'user';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Selamat Pagi' : hour < 18 ? 'Selamat Siang' : 'Selamat Malam';

    return (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 pb-10">
            {/* Welcome Banner */}
            <motion.div variants={item}>
                <WelcomeBanner greeting={greeting} user={user} isUser={isUser} onPostProject={onPostProject} setActiveTab={setActiveTab} />
            </motion.div>

            {/* Stats Row */}
            <motion.div variants={item}>
                <OverviewStats
                    isUser={isUser}
                    projectCount={isUser ? relevantProjects.length : myProjectsCount}
                    bidCount={myBidsCount}
                    openTenders={openTendersCount}
                    setActiveTab={setActiveTab}
                />
            </motion.div>

            {/* Quick Actions */}
            <motion.div variants={item}>
                <OverviewQuickActions isUser={isUser} setActiveTab={setActiveTab} onPostProject={onPostProject} />
            </motion.div>

            {/* Recent Projects */}
            {relevantProjects.length > 0 && (
                <motion.div variants={item}>
                    <OverviewProjectCards
                        projects={relevantProjects.slice(0, 3)}
                        onViewProject={onViewProject}
                        onViewAll={() => setActiveTab('projects')}
                        formatCurrency={formatCurrency}
                    />
                </motion.div>
            )}
        </motion.div>
    );
}

function WelcomeBanner({ greeting, user, isUser, onPostProject, setActiveTab }: any) {
    return (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FF2D20] to-rose-700 p-6 sm:p-8 shadow-xl shadow-red-500/10">
            <div className="absolute inset-0 z-0">
                <div className="absolute -top-20 -right-20 w-56 h-56 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-1/3 w-40 h-40 bg-orange-400/10 rounded-full blur-3xl" />
            </div>
            <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white text-[11px] font-bold uppercase tracking-wider mb-4">
                    <Sparkles size={12} /> {greeting}
                </div>
                <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                    Welcome back,<br />{user?.name.split(' ')[0]} 👋
                </h2>
                <p className="mt-3 text-red-100 text-sm max-w-md font-medium">
                    {isUser ? 'Kelola proyek bangunan Anda atau jelajahi listing properti baru.' : 'Temukan tender terbuka dan kelola penawaran Anda.'}
                </p>
                <div className="flex flex-wrap gap-3 mt-6">
                    {isUser ? (
                        <button onClick={onPostProject} className="flex items-center gap-2 px-5 py-2.5 bg-white text-gray-900 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all active:scale-[0.98] shadow-lg">
                            <Plus size={16} /> Start New Project
                        </button>
                    ) : (
                        <button onClick={() => setActiveTab('projects')} className="flex items-center gap-2 px-5 py-2.5 bg-white text-gray-900 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all active:scale-[0.98] shadow-lg">
                            <Compass size={16} /> Browse Tenders
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
