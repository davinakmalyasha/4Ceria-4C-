import React from 'react';
import { Menu } from 'lucide-react';
import NotificationsDropdown from '../NotificationsDropdown';

interface HeaderProps {
    activeTab: string;
    onMenuClick: () => void;
}

export const DashboardHeader: React.FC<HeaderProps> = ({ activeTab, onMenuClick }) => {
    return (
        <header className="h-14 bg-white/80 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-6 z-[100] shrink-0">
            <button className="p-2 -ml-2 rounded-lg text-gray-600 hover:bg-gray-100 md:hidden" onClick={onMenuClick}>
                <Menu className="w-6 h-6" />
            </button>
            <div className="hidden md:block text-sm font-semibold text-gray-500 capitalize">
                {activeTab === 'profile' ? 'My Profile' : activeTab.replace('-', ' ')}
            </div>
            <div className="flex items-center gap-2">
                <NotificationsDropdown />
            </div>
        </header>
    );
};
