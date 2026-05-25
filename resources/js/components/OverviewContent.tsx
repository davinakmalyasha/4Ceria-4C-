import React from 'react';
import { motion, Variants } from 'framer-motion';
import OverviewStats from './Overview/OverviewStats';
import OverviewProjectTimeline from './Overview/OverviewProjectTimeline';
import OverviewQuickActions from './Overview/OverviewQuickActions';
import OverviewSearch from './Overview/OverviewSearch';

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

const container: Variants = { 
    hidden: { opacity: 0 }, 
    show: { opacity: 1, transition: { staggerChildren: 0.05 } } 
};
const item: Variants = { 
    hidden: { opacity: 0, y: 12 }, 
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } } 
};

export default function OverviewContent({
    user, relevantProjects, setActiveTab,
    openTendersCount = 0, myBidsCount = 0,
    myProjectsCount = 0, onPostProject, onViewProject,
}: Props) {
    const isUser = user?.role_type === 'user';

    return (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 pb-12">
            {/* Sleek Welcome Header */}
            <motion.div variants={item} className="space-y-1.5 py-1 select-none">
                <h1 className="text-3xl font-black text-neutral-800 tracking-tight">
                    {user ? `Welcome back, ${user.name?.split(' ')[0]}!` : 'Welcome to 4Ceria'}
                </h1>
                <p className="text-[12px] font-bold text-neutral-400">
                    {user 
                        ? 'Manage your construction projects, view proposals, or browse properties and professionals.' 
                        : 'Explore public properties, discover verified professionals, or shop in the materials marketplace.'}
                </p>
            </motion.div>

            {/* Smart Search Bar */}
            <motion.div variants={item}>
                <OverviewSearch setActiveTab={setActiveTab} />
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

            {/* Quick Actions Grid */}
            <motion.div variants={item}>
                <OverviewQuickActions isUser={isUser} setActiveTab={setActiveTab} onPostProject={onPostProject} />
            </motion.div>

            {/* Visual Project Timelines / Pipeline */}
            {relevantProjects.length > 0 && (
                <motion.div variants={item}>
                    <OverviewProjectTimeline
                        projects={relevantProjects}
                        onViewProject={onViewProject}
                        setActiveTab={setActiveTab}
                        onViewAll={() => setActiveTab('projects')}
                    />
                </motion.div>
            )}
        </motion.div>
    );
}
