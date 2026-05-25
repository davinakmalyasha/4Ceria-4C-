import React from 'react';
import { motion } from 'framer-motion';
import { Wallet, MessageSquare, CheckCircle } from 'lucide-react';
import { formatCurrency } from '../../types/project.types';

interface StatsProps {
    totalBudget: number;
    activeBids: number;
    completed: number;
    userRole?: string;
    onViewMyBids?: () => void;
    onViewActiveBids?: () => void;
}

export default function ProjectStatsDashboard({ totalBudget, activeBids, completed, userRole, onViewMyBids, onViewActiveBids }: StatsProps) {
    const isUser = userRole === 'user';
    const isClickable = (isUser && activeBids > 0 && onViewActiveBids) || (!isUser && onViewMyBids);
    
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {/* 1. Active Budget */}
            <motion.div 
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-zinc-900 to-black rounded-xl py-3 px-4 text-white shadow-md relative overflow-hidden flex items-center justify-between ring-1 ring-white/5"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white/10 text-white shrink-0">
                        <Wallet size={16} />
                    </div>
                    <div>
                        <h4 className="font-bold text-[9px] uppercase tracking-widest text-zinc-400">
                            {isUser ? 'Total Active Budget' : 'Available Market Size'}
                        </h4>
                        <p className="text-lg font-black tracking-tight text-white mt-0.5">{formatCurrency(totalBudget)}</p>
                    </div>
                </div>
            </motion.div>

            {/* 2. Active Bids */}
            <motion.div 
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                onClick={isUser ? onViewActiveBids : onViewMyBids}
                className={`bg-white rounded-xl py-3 px-4 border border-gray-100 shadow-sm flex items-center justify-between ${
                    isClickable ? 'cursor-pointer hover:shadow-md hover:border-zinc-200 transition-all group' : ''
                }`}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-zinc-50 text-zinc-600 shrink-0">
                        <MessageSquare size={16} />
                    </div>
                    <div>
                        <h4 className="font-bold text-[9px] uppercase tracking-widest text-gray-400">
                            {isUser ? 'Active Bids' : 'My Active Proposals'}
                        </h4>
                        <p className="text-lg font-black tracking-tight text-gray-900 mt-0.5 group-hover:text-zinc-600 transition-colors">
                            {activeBids}
                        </p>
                    </div>
                </div>
                {isClickable && (
                    <span className="text-[10px] font-bold text-zinc-450 group-hover:text-zinc-900 transition-colors mr-1">
                        &rarr;
                    </span>
                )}
            </motion.div>

            {/* 3. Completed Projects */}
            <motion.div 
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="bg-white rounded-xl py-3 px-4 border border-gray-100 shadow-sm flex items-center justify-between"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-50 text-gray-600 rounded-lg shrink-0">
                        <CheckCircle size={16} />
                    </div>
                    <div>
                        <h4 className="font-bold text-[9px] uppercase tracking-widest text-gray-400">
                            {isUser ? 'Projects Completed' : 'Delivered Work'}
                        </h4>
                        <p className="text-lg font-black tracking-tight text-gray-900 mt-0.5">{completed}</p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
