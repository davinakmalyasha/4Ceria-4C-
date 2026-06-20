import React from 'react';
import { SkeletonBase } from '../UI/Skeletons';

export const ProcessTabSkeleton = () => (
    <div className="space-y-6">
        {/* Timeline Header Skeleton */}
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm flex justify-between items-center gap-4 overflow-x-auto">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2 min-w-[100px] flex-1">
                    <SkeletonBase className="w-8 h-8 rounded-full" />
                    <SkeletonBase className="w-16 h-3" />
                </div>
            ))}
        </div>
        {/* Content Area Card Skeleton */}
        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm space-y-6 min-h-[300px]">
            <div className="flex justify-between items-center pb-4 border-b border-gray-50">
                <div className="space-y-2">
                    <SkeletonBase className="w-48 h-6" />
                    <SkeletonBase className="w-32 h-4" />
                </div>
                <SkeletonBase className="w-24 h-10 rounded-2xl" />
            </div>
            <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex justify-between items-center p-4 rounded-2xl border border-gray-50 bg-gray-50/50">
                        <div className="flex items-center gap-3">
                            <SkeletonBase className="w-5 h-5 rounded-md" />
                            <div className="space-y-1.5">
                                <SkeletonBase className="w-40 h-4" />
                                <SkeletonBase className="w-24 h-3" />
                            </div>
                        </div>
                        <SkeletonBase className="w-16 h-6 rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    </div>
);

export const BudgetTabSkeleton = () => (
    <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3">
                    <SkeletonBase className="w-24 h-3" />
                    <SkeletonBase className="w-32 h-6" />
                </div>
            ))}
        </div>
        {/* Ledger Table */}
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                <SkeletonBase className="w-36 h-5" />
                <SkeletonBase className="w-20 h-8 rounded-xl" />
            </div>
            <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50">
                        <div className="space-y-1.5">
                            <SkeletonBase className="w-44 h-4" />
                            <SkeletonBase className="w-20 h-3" />
                        </div>
                        <SkeletonBase className="w-24 h-5" />
                    </div>
                ))}
            </div>
        </div>
    </div>
);

export const TenderingTabSkeleton = () => (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <SkeletonBase className="w-40 h-6" />
            <SkeletonBase className="w-28 h-8 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
                    <div className="flex items-center gap-3">
                        <SkeletonBase className="w-12 h-12 rounded-full" />
                        <div className="space-y-1.5">
                            <SkeletonBase className="w-28 h-4" />
                            <SkeletonBase className="w-20 h-3" />
                        </div>
                    </div>
                    <SkeletonBase className="w-full h-16 rounded-xl" />
                    <div className="flex justify-between items-center pt-2">
                        <SkeletonBase className="w-24 h-5" />
                        <SkeletonBase className="w-16 h-8 rounded-lg" />
                    </div>
                </div>
            ))}
        </div>
    </div>
);

export const QATabSkeleton = () => (
    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-6 min-h-[400px] flex flex-col justify-between">
        <div className="space-y-6 flex-1">
            <SkeletonBase className="w-32 h-5 mb-4" />
            {/* Thread of comment bubbles */}
            <div className="flex gap-3">
                <SkeletonBase className="w-10 h-10 rounded-full flex-shrink-0" />
                <div className="bg-gray-50 rounded-2xl rounded-tl-none p-4 max-w-[70%] space-y-2">
                    <SkeletonBase className="w-20 h-3.5" />
                    <SkeletonBase className="w-48 h-4" />
                    <SkeletonBase className="w-32 h-3" />
                </div>
            </div>
            <div className="flex gap-3 justify-end">
                <div className="bg-gray-950/5 rounded-2xl rounded-tr-none p-4 max-w-[70%] space-y-2">
                    <SkeletonBase className="w-20 h-3.5" />
                    <SkeletonBase className="w-56 h-4" />
                    <SkeletonBase className="w-16 h-3" />
                </div>
                <SkeletonBase className="w-10 h-10 rounded-full flex-shrink-0" />
            </div>
        </div>
        {/* Input Bar */}
        <div className="flex gap-3 pt-4 border-t border-gray-100">
            <SkeletonBase className="flex-1 h-12 rounded-2xl" />
            <SkeletonBase className="w-12 h-12 rounded-2xl" />
        </div>
    </div>
);

export const ActivityTabSkeleton = () => (
    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-6">
        <SkeletonBase className="w-36 h-5" />
        <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="relative space-y-2">
                    <div className="absolute -left-6 top-1.5 w-4 h-4 rounded-full border-4 border-white bg-gray-300 shadow-sm" />
                    <SkeletonBase className="w-24 h-3" />
                    <SkeletonBase className="w-2/3 h-4" />
                </div>
            ))}
        </div>
    </div>
);

export const VaultTabSkeleton = () => (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <SkeletonBase className="w-36 h-5" />
            <SkeletonBase className="w-28 h-10 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
                    <div className="flex justify-between items-start">
                        <SkeletonBase className="w-10 h-10 rounded-xl" />
                        <SkeletonBase className="w-16 h-5 rounded-full" />
                    </div>
                    <div className="space-y-2">
                        <SkeletonBase className="w-3/4 h-4" />
                        <SkeletonBase className="w-1/2 h-3" />
                    </div>
                </div>
            ))}
        </div>
    </div>
);

export const OverviewTabSkeleton = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Brief Details */}
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-8 shadow-sm space-y-4">
                <SkeletonBase className="w-40 h-6" />
                <SkeletonBase className="w-full h-24 rounded-2xl animate-pulse" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-50">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="space-y-1.5" style={{ contentVisibility: 'auto' }}>
                            <SkeletonBase className="w-16 h-3" />
                            <SkeletonBase className="w-24 h-4" />
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-8 shadow-sm space-y-4">
                <SkeletonBase className="w-32 h-6" />
                <SkeletonBase className="w-full h-48 rounded-2xl animate-pulse" />
            </div>
        </div>

        {/* Right Column: Owner & Team */}
        <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
                <SkeletonBase className="w-24 h-5" />
                <div className="flex items-center gap-3">
                    <SkeletonBase className="w-12 h-12 rounded-full" />
                    <div className="space-y-2 flex-1">
                        <SkeletonBase className="w-28 h-4" />
                        <SkeletonBase className="w-20 h-3" />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
                <SkeletonBase className="w-36 h-5" />
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0" style={{ contentVisibility: 'auto' }}>
                        <div className="flex items-center gap-3">
                            <SkeletonBase className="w-8 h-8 rounded-full" />
                            <div className="space-y-1">
                                <SkeletonBase className="w-20 h-3" />
                                <SkeletonBase className="w-16 h-2" />
                            </div>
                        </div>
                        <SkeletonBase className="w-12 h-4 rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    </div>
);

