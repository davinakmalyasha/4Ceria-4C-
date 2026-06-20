import React from 'react';
import { motion, Variants } from 'framer-motion';
import OverviewStats from './Overview/OverviewStats';
import OverviewProjectTimeline from './Overview/OverviewProjectTimeline';
import OverviewQuickActions from './Overview/OverviewQuickActions';
import OverviewSearch from './Overview/OverviewSearch';
import ProfileCompletenessCard from './Overview/ProfileCompletenessCard';

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
    availableProsCount?: number;
    onPrefetch?: (projectId: number) => void;
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
    availableProsCount = 0, onPrefetch,
}: Props) {
    const isUser = user?.role_type === 'user';

    return (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 pb-12">

            {/* Profile Completeness Reminder Card */}
            <motion.div variants={item}>
                <ProfileCompletenessCard user={user} setActiveTab={setActiveTab} />
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
                    availableProsCount={availableProsCount}
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
                        onPrefetch={onPrefetch}
                    />
                </motion.div>
            )}
        </motion.div>
    );
}
