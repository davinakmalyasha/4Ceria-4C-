import React from 'react';
import { motion, Variants } from 'framer-motion';
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
            {/* Sleek, Lightweight Welcome Header */}
            <motion.div variants={item} className="space-y-1.5 py-1 select-none">
                <h1 className="text-2xl font-black text-neutral-800 tracking-tight">
                    {user ? `Welcome back, ${user.name?.split(' ')[0]}!` : 'Welcome to 4Ceria Dashboard'}
                </h1>
                <p className="text-[13px] font-bold text-neutral-400">
                    {user 
                        ? 'Manage your construction projects, view proposals, or browse properties and professionals.' 
                        : 'Explore public properties, discover verified professionals, or shop in the materials marketplace.'}
                </p>
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
