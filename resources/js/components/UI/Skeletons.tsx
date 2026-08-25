import React from 'react';
import { motion } from 'framer-motion';

const Shimmer = () => (
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

