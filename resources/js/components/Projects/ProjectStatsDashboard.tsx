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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
            <motion.div 
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="bg-gradient-to-br from-zinc-900 via-zinc-950 to-black rounded-[1.5rem] p-5 lg:p-6 text-white shadow-xl shadow-black/20 relative overflow-hidden ring-1 ring-white/5"
            >
                <div className="absolute -right-4 -top-4 text-white/10">
                    <Wallet size={120} />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-2 text-zinc-400 mb-1">
                        <Wallet size={16} />
                        <h4 className="font-semibold text-xs lg:text-sm uppercase tracking-widest">
                            {isUser ? 'Total Active Budget' : 'Available Market Size'}
                        </h4>
                    </div>
                    <p className="text-3xl lg:text-4xl font-black tracking-tight text-white">{formatCurrency(totalBudget)}</p>
                    <p className="text-zinc-500 text-xs mt-2 font-medium">Currently locked in open projects</p>
                </div>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                onClick={isUser ? onViewActiveBids : onViewMyBids}
                className={`bg-white rounded-[1.5rem] p-5 lg:p-6 border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between ${isClickable ? 'cursor-pointer hover:shadow-md hover:border-red-200 transition-all group' : ''}`}
            >
                <div>
                    <div className="flex items-center gap-2 text-gray-500 mb-2">
                        <div className={`p-1.5 rounded-lg bg-red-50 text-red-600`}>
                            <MessageSquare size={16} />
                        </div>
                        <h4 className="font-semibold text-xs lg:text-sm uppercase tracking-widest">
                            {isUser ? 'Active Bids' : 'My Active Proposals'}
                        </h4>
                    </div>
                    <p className={`text-3xl lg:text-4xl font-black text-gray-900 tracking-tight ${isClickable ? 'group-hover:text-red-600' : ''} transition-colors`}>
                        {activeBids}
                    </p>
                </div>
                <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-red-400`}></span>
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500`}></span>
                        </span>
                        <p className="text-xs text-gray-500 font-medium whitespace-nowrap">Proposals awaiting action</p>
                    </div>
                    {isClickable && (
                        <div className={`text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-red-600`}>
                            View &rarr;
                        </div>
                    )}
                </div>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="bg-white rounded-[1.5rem] p-5 lg:p-6 border border-gray-100 shadow-sm flex flex-col justify-between"
            >
                 <div>
                    <div className="flex items-center gap-2 text-gray-500 mb-2">
                        <div className="p-1.5 bg-gray-100 text-gray-600 rounded-lg">
                            <CheckCircle size={16} />
                        </div>
                        <h4 className="font-semibold text-xs lg:text-sm uppercase tracking-widest">
                            {isUser ? 'Projects Completed' : 'Delivered Work'}
                        </h4>
                    </div>
                    <p className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tight">
                        {completed}
                    </p>
                </div>
                <p className="text-xs text-gray-400 font-medium mt-auto">Historical lifetime total</p>
            </motion.div>
        </div>
    );
}
