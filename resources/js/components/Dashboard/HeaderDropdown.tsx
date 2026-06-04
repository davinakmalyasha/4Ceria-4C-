import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { NavItem } from './navConfig';

interface DropdownProps {
    item: NavItem;
    activeTab: string;
    setActiveTab: (tab: string) => void;
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
    counts?: Record<string, number>;
}

export const HeaderDropdown: React.FC<DropdownProps> = ({
    item,
    activeTab,
    setActiveTab,
    isOpen,
    onToggle,
    onClose,
    counts,
}) => {
    const Icon = item.icon;
    const hasActiveChild = item.children?.some(child => child.id === activeTab);
    const childrenCountsSum = item.children?.reduce((acc, child) => acc + (counts?.[child.id] || 0), 0) || 0;

    return (
        <div className="relative">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-bold transition-all focus:outline-none group ${
                    hasActiveChild || isOpen
                        ? 'text-red-500 bg-red-50/50'
                        : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
                }`}
            >
                <Icon className="w-[15px] h-[15px]" />
                <span>{item.label}</span>
                {childrenCountsSum > 0 && (
                    <span className={`ml-1.5 px-1.5 py-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-black tracking-tight transition-all duration-200 shrink-0 ${
                        hasActiveChild || isOpen
                            ? 'bg-[#FF2D20] text-white'
                            : 'bg-red-50 text-[#FF2D20] group-hover:bg-red-100'
                    }`}>
                        {childrenCountsSum}
                    </span>
                )}
                <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-red-500' : 'text-neutral-400'
                    }`}
                />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="absolute left-0 mt-2 w-56 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-neutral-100 py-1.5 z-[130]"
                    >
                        {item.children?.map((child) => {
                            const ChildIcon = child.icon;
                            const isChildActive = activeTab === child.id;
                            const count = counts?.[child.id];
                            return (
                                <button
                                    key={child.id}
                                    onClick={() => {
                                        setActiveTab(child.id);
                                        onClose();
                                    }}
                                    className={`w-full flex items-center justify-between px-4 py-2 text-left text-xs font-bold transition-colors ${
                                        isChildActive
                                            ? 'bg-red-50 text-red-500'
                                            : 'text-neutral-600 hover:bg-red-50 hover:text-red-500'
                                    }`}
                                >
                                    <span className="flex items-center gap-2.5">
                                        <ChildIcon className="w-4 h-4 shrink-0" />
                                        <span>{child.label}</span>
                                    </span>
                                    {count !== undefined && count > 0 && (
                                        <span className={`px-1.5 py-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-black tracking-tight transition-all duration-200 shrink-0 ${
                                            isChildActive
                                                ? 'bg-[#FF2D20] text-white'
                                                : 'bg-red-50 text-[#FF2D20]'
                                        }`}>
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
