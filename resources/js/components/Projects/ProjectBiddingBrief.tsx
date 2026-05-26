import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { BriefDetailPanel } from './BiddingBrief/BriefDetailPanel';
import { BiddingSidebarCard } from './BiddingBrief/BiddingSidebarCard';
import { ProjectBidForm } from './Details/ProjectBidForm';

interface ProjectBiddingBriefProps {
    project: any;
    user: any;
    onBack: () => void;
    onRefresh: () => void;
}

export default function ProjectBiddingBrief({ 
    project, user, onBack, onRefresh 
}: ProjectBiddingBriefProps) {
    const [isBidDrawerOpen, setIsBidDrawerOpen] = useState(false);

    // Resolve user bid status dynamically across all specialties
    const userBid = useMemo(() => {
        if (!project || !user) return null;
        const bidKeys = [
            'bids_arsitek',
            'bids_kontraktor',
            'bids_notaris',
            'bids_interior',
            'bids_structural',
            'bids_mep',
            'bids_project_manager'
        ];
        for (const key of bidKeys) {
            const bids = project[key] || [];
            const found = bids.find((b: any) => {
                const bidderUserId = b.user_id || 
                                     b.bidder?.user_id || 
                                     b.bidder?.user?.id ||
                                     b.arsitek?.user_id || 
                                     b.kontraktor?.user_id || 
                                     b.notaris?.user_id || 
                                     b.interior?.user_id ||
                                     b.structural_engineer?.user_id || 
                                     b.mep_engineer?.user_id;
                return String(bidderUserId) === String(user.id);
            });
            if (found) return found;
        }
        return null;
    }, [project, user]);

    return (
        <div className="w-full space-y-8 pb-16">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                {/* Left Column: Rich Project brief requirements & Q&A */}
                <div className="lg:col-span-2">
                    <BriefDetailPanel project={project} onRefresh={onRefresh} onBack={onBack} />
                </div>

                {/* Right Column: Sticky bidding card */}
                <div>
                    <BiddingSidebarCard 
                        project={project} 
                        user={user} 
                        userBid={userBid} 
                        onOpenBidDrawer={() => setIsBidDrawerOpen(true)} 
                    />
                </div>
            </div>

            {/* Slide-over Proposal Drawer */}
            <AnimatePresence>
                {isBidDrawerOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.4 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsBidDrawerOpen(false)}
                            className="fixed inset-0 bg-black z-40 cursor-pointer"
                        />
                        {/* Drawer */}
                        <motion.div 
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl z-50 overflow-y-auto p-10 border-l border-gray-100"
                        >
                            <button 
                                onClick={() => setIsBidDrawerOpen(false)}
                                className="absolute top-8 right-8 p-2 rounded-xl hover:bg-gray-50 border border-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X size={18} />
                            </button>
                            <div className="pt-4">
                                <ProjectBidForm 
                                    project={project} 
                                    user={user} 
                                    onSuccess={() => {
                                        setIsBidDrawerOpen(false);
                                        onRefresh();
                                    }} 
                                />
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
