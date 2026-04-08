import React from 'react';
import { motion } from 'framer-motion';

export const Shimmer = () => (
    <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: '100%' }}
        transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
    />
);

export const SkeletonBase = ({ className }: { className?: string }) => (
    <div className={`relative overflow-hidden bg-gray-200 rounded-lg ${className}`}>
        <Shimmer />
    </div>
);

export const DashboardCardSkeleton = () => (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center gap-4">
            <SkeletonBase className="w-12 h-12 rounded-xl" />
            <div className="space-y-2">
                <SkeletonBase className="w-24 h-4" />
                <SkeletonBase className="w-32 h-6" />
            </div>
        </div>
        <div className="pt-4 border-t border-gray-50 flex justify-between">
            <SkeletonBase className="w-20 h-4" />
            <SkeletonBase className="w-16 h-4" />
        </div>
    </div>
);

export const ProjectRowSkeleton = () => (
    <div className="bg-white p-5 rounded-2xl border border-gray-100 flex items-center gap-4">
        <SkeletonBase className="w-12 h-12 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
            <SkeletonBase className="w-1/3 h-5" />
            <SkeletonBase className="w-1/4 h-3" />
        </div>
        <SkeletonBase className="w-24 h-8 rounded-full" />
    </div>
);

export const MarketplaceCardSkeleton = () => (
    <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
        <SkeletonBase className="w-full aspect-square" />
        <div className="p-4 space-y-3">
            <SkeletonBase className="w-3/4 h-5" />
            <SkeletonBase className="w-1/2 h-4" />
            <div className="pt-2 flex justify-between items-center">
                <SkeletonBase className="w-20 h-6" />
                <SkeletonBase className="w-10 h-10 rounded-xl" />
            </div>
        </div>
    </div>
);
