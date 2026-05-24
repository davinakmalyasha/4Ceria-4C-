import React, { useState, useRef, useEffect } from 'react';
import { Menu, ChevronDown, User, LogOut, FolderKanban, Heart, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import NotificationsDropdown from '../NotificationsDropdown';
import { getNavItems } from './navConfig';
import { HeaderDropdown } from './HeaderDropdown';

interface HeaderProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    onMenuClick: () => void;
}

const BrandLogo: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button onClick={onClick} className="flex items-center gap-2 shrink-0 select-none hover:opacity-90 transition-opacity focus:outline-none">
        <img className="w-8 h-8 object-contain" src="/storage/Assets/Logo4C.png" alt="4C Logo" />
        <span className="text-sm font-extrabold text-neutral-800 tracking-tight">4Ceria</span>
    </button>
);

export const DashboardHeader: React.FC<HeaderProps> = ({ activeTab, setActiveTab, onMenuClick }) => {
    const { user, logout } = useAuth();
    const [profileOpen, setProfileOpen] = useState(false);
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const profileRef = useRef<HTMLDivElement>(null);
    const navRef = useRef<HTMLDivElement>(null);

    const navItems = getNavItems(user?.role_type, !!user);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
                setProfileOpen(false);
            }
            if (navRef.current && !navRef.current.contains(e.target as Node)) {
                setOpenDropdownId(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <header className="h-14 bg-white/80 backdrop-blur-md border-b border-neutral-100 flex items-center justify-between px-6 z-[100] shrink-0">
            {/* Left side: Hamburger (mobile) + Brand Logo (desktop) + Top Navigation (desktop) */}
            <div className="flex items-center gap-6 min-w-0 h-full">
                <button 
                    onClick={onMenuClick}
                    className="p-2 -ml-2 rounded-lg text-neutral-600 hover:bg-neutral-100 transition-colors md:hidden shrink-0" 
                    aria-label="Toggle Menu"
                >
                    <Menu className="w-5 h-5" />
                </button>
                
                <div className="hidden md:block shrink-0">
                    <BrandLogo onClick={() => setActiveTab('overview')} />
                </div>

                {/* Horizontal Desktop Navigation Tabs immediately beside the logo */}
                <nav ref={navRef} className="hidden md:flex items-center gap-1 h-full">
                    {navItems.map((item) => {
                        if (item.children) {
                            return (
                                <HeaderDropdown
                                    key={item.id}
                                    item={item}
                                    activeTab={activeTab}
                                    setActiveTab={setActiveTab}
                                    isOpen={openDropdownId === item.id}
                                    onToggle={() => setOpenDropdownId(openDropdownId === item.id ? null : item.id)}
                                    onClose={() => setOpenDropdownId(null)}
                                />
                            );
                        }
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-bold transition-all focus:outline-none ${
                                    isActive 
                                        ? 'text-[#FF2D20] bg-red-50/50' 
                                        : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
                                }`}
                            >
                                <Icon className="w-[15px] h-[15px]" />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                    
                    <Link
                        to="/help"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-bold text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 transition-all focus:outline-none"
                    >
                        Help Center
                    </Link>
                </nav>
            </div>

            {/* Right: Notifications & Premium Profile Dropdown */}
            <div className="flex items-center gap-2.5 shrink-0">
                {user ? (
                    <>
                        <NotificationsDropdown />
                        
                        <div className="relative" ref={profileRef}>
                            <button 
                                onClick={() => setProfileOpen(!profileOpen)}
                                className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-neutral-100 transition-all focus:outline-none"
                            >
                                <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shadow-md">
                                    {user.pic ? (
                                        <img src={user.pic} className="w-full h-full object-cover" alt="Profile" />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-tr from-[#FF2D20] to-[#FF2D20]/90 flex items-center justify-center text-white font-black text-xs shadow-red-200">
                                            {user.name?.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <span className="hidden sm:inline text-xs font-bold text-neutral-700 capitalize">{user.name?.split(' ')[0]}</span>
                                <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${profileOpen ? 'rotate-180 text-[#FF2D20]' : ''}`} />
                            </button>
 
                            {profileOpen && (
                                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-neutral-100 z-[130] py-1.5 overflow-hidden">
                                    <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shadow-md shrink-0">
                                            {user.pic ? (
                                                <img src={user.pic} className="w-full h-full object-cover" alt="Profile" />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-tr from-[#FF2D20] to-[#FF2D20]/90 flex items-center justify-center text-white font-black text-xs shadow-red-200">
                                                    {user.name?.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-neutral-900 truncate">{user.name}</p>
                                            <p className="text-[10px] text-neutral-400 capitalize font-semibold truncate">{user.role_type}</p>
                                        </div>
                                    </div>
                                    
                                    <button onClick={() => { setActiveTab('profile'); setProfileOpen(false); }} className={`w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-bold transition-colors ${activeTab === 'profile' ? 'bg-red-50 text-red-500' : 'text-neutral-600 hover:bg-red-50 hover:text-[#FF2D20]'}`}><User className="w-4 h-4 shrink-0" />My Profile</button>
                                    <button onClick={() => { setActiveTab('projects'); setProfileOpen(false); }} className={`w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-bold transition-colors ${activeTab === 'projects' ? 'bg-red-50 text-red-500' : 'text-neutral-600 hover:bg-red-50 hover:text-[#FF2D20]'}`}><FolderKanban className="w-4 h-4 shrink-0" />My Projects</button>
                                    <button onClick={() => { setActiveTab('chat'); setProfileOpen(false); }} className={`w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-bold transition-colors ${activeTab === 'chat' ? 'bg-red-50 text-red-500' : 'text-neutral-600 hover:bg-red-50 hover:text-[#FF2D20]'}`}><MessageSquare className="w-4 h-4 shrink-0" />Inbox</button>
                                    <button onClick={() => { setActiveTab('saved'); setProfileOpen(false); }} className={`w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-bold transition-colors ${activeTab === 'saved' ? 'bg-red-50 text-red-500' : 'text-neutral-600 hover:bg-red-50 hover:text-[#FF2D20]'}`}><Heart className="w-4 h-4 shrink-0" />Saved Items</button>
                                    <button onClick={logout} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-bold text-red-500 hover:bg-red-50/70 transition-colors border-t border-neutral-100 mt-1.5 pt-2"><LogOut className="w-4 h-4 shrink-0" />Sign Out</button>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <button 
                        onClick={() => window.location.href = '/login'}
                        className="px-5 py-2 bg-neutral-900 text-white text-xs font-bold rounded-xl hover:bg-neutral-800 transition-all shadow-md shadow-neutral-200"
                    >
                        Sign In/Up
                    </button>
                )}
            </div>
        </header>
    );
};
