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
                className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-[1.5rem] p-5 lg:p-6 text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden"
            >
                <div className="absolute -right-4 -top-4 text-emerald-400/30">
                    <Wallet size={120} />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-2 text-emerald-100 mb-2">
                        <Wallet size={18} />
                        <h4 className="font-semibold text-sm uppercase tracking-wider">
                            {isUser ? 'Total Active Budget' : 'Available Market Size'}
                        </h4>
                    </div>
                    <p className="text-3xl lg:text-4xl font-black tracking-tight">{formatCurrency(totalBudget)}</p>
                    <p className="text-emerald-100 text-xs mt-2 font-medium">Currently locked in open projects</p>
                </div>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                onClick={isUser ? onViewActiveBids : onViewMyBids}
                className={`bg-white rounded-[1.5rem] p-5 lg:p-6 border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between ${isClickable ? 'cursor-pointer hover:shadow-md hover:border-blue-200 transition-all group' : ''}`}
            >
                <div>
                    <div className="flex items-center gap-2 text-gray-500 mb-2">
                        <div className={`p-1.5 rounded-lg ${isUser ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                            <MessageSquare size={16} />
                        </div>
                        <h4 className="font-semibold text-sm uppercase tracking-wider">
                            {isUser ? 'Active Bids' : 'My Active Proposals'}
                        </h4>
                    </div>
                    <p className={`text-3xl lg:text-4xl font-black text-gray-900 tracking-tight ${isClickable ? (isUser ? 'group-hover:text-orange-600' : 'group-hover:text-blue-600') : ''} transition-colors`}>
                        {activeBids}
                    </p>
                </div>
                <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isUser ? 'bg-orange-400' : 'bg-blue-400'}`}></span>
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isUser ? 'bg-orange-500' : 'bg-blue-500'}`}></span>
                        </span>
                        <p className="text-xs text-gray-500 font-medium">Proposals awaiting action</p>
                    </div>
                    {isClickable && (
                        <div className={`text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ${isUser ? 'text-orange-600' : 'text-blue-600'}`}>
                            View Bids &rarr;
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
                        <h4 className="font-semibold text-sm uppercase tracking-wider">
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
