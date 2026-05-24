import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChevronDown } from 'lucide-react';

export default function Navbar() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [hidden, setHidden] = useState(false);
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const lastScrollY = useRef(0);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY || document.documentElement.scrollTop;
            if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
                setHidden(true);
            } else {
                setHidden(false);
            }
            lastScrollY.current = currentScrollY;
        };

        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpenDropdown(null);
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('scroll', handleScroll);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const scrollToSection = (id: string) => {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setOpenDropdown(null);
    };

    const handleAction = (path: string) => {
        navigate(path);
        setOpenDropdown(null);
    };

    return (
        <div className={`custom-navbar-container ${hidden ? 'hidden-nav' : ''} flex items-center justify-between px-6 py-3 bg-white/95 backdrop-blur-md border-b border-neutral-100 fixed top-0 left-0 right-0 z-[100] transition-transform duration-300`}>
            <div className="flex items-center gap-6 min-w-0">
                {/* Left side: Logo & Brand */}
                <div className="flex items-center gap-3 shrink-0">
                    <Link to="/" className="flex items-center gap-2">
                        <img className="w-8 h-8 object-contain" src="/storage/Assets/Logo4C.png" alt="4C Logo" />
                        <span className="text-sm font-extrabold text-neutral-800 tracking-tight">4Ceria</span>
                    </Link>
                </div>

                {/* Center side: Scroll Navigation Dropdowns (Desktop only) */}
                <div ref={dropdownRef} className="hidden md:flex items-center gap-2 animate-fade-in">
                    {/* Properties */}
                    <div className="relative">
                        <button 
                            onClick={() => setOpenDropdown(openDropdown === 'properties' ? null : 'properties')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-bold transition-all focus:outline-none ${
                                openDropdown === 'properties' ? 'text-red-500 bg-red-50/50' : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
                            }`}
                        >
                            Properties
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'properties' ? 'rotate-180 text-red-500' : 'text-neutral-400'}`} />
                        </button>
                        {openDropdown === 'properties' && (
                            <div className="absolute left-0 mt-2 w-48 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-neutral-100 py-1.5 z-[130]">
                                <button onClick={() => handleAction('/dashboard?tab=houses')} className="w-full px-4 py-2 text-left text-xs font-bold text-neutral-600 hover:bg-red-50 hover:text-red-500 transition-colors">Browse Houses</button>
                                <button onClick={() => handleAction('/dashboard?tab=post-house')} className="w-full px-4 py-2 text-left text-xs font-bold text-neutral-600 hover:bg-red-50 hover:text-red-500 transition-colors">List Properties</button>
                                <button onClick={() => scrollToSection('showcase-properties')} className="w-full px-4 py-2 text-left text-xs font-semibold text-neutral-400 border-t border-neutral-100 hover:bg-neutral-50 transition-colors">Learn More</button>
                            </div>
                        )}
                    </div>

                    {/* Hire Professionals */}
                    <div className="relative">
                        <button 
                            onClick={() => setOpenDropdown(openDropdown === 'professionals' ? null : 'professionals')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-bold transition-all focus:outline-none ${
                                openDropdown === 'professionals' ? 'text-red-500 bg-red-50/50' : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
                            }`}
                        >
                            Hire Professionals
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'professionals' ? 'rotate-180 text-red-500' : 'text-neutral-400'}`} />
                        </button>
                        {openDropdown === 'professionals' && (
                            <div className="absolute left-0 mt-2 w-48 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-neutral-100 py-1.5 z-[130]">
                                <button onClick={() => handleAction('/dashboard?tab=architects')} className="w-full px-4 py-2 text-left text-xs font-bold text-neutral-600 hover:bg-red-50 hover:text-red-500 transition-colors">Hire Architect</button>
                                <button onClick={() => handleAction('/dashboard?tab=constructors')} className="w-full px-4 py-2 text-left text-xs font-bold text-neutral-600 hover:bg-red-50 hover:text-red-500 transition-colors">Hire Constructor</button>
                                <button onClick={() => handleAction('/dashboard?tab=notaris')} className="w-full px-4 py-2 text-left text-xs font-bold text-neutral-600 hover:bg-red-50 hover:text-red-500 transition-colors">Legal Notary & PPAT</button>
                                <button onClick={() => scrollToSection('showcase-professionals')} className="w-full px-4 py-2 text-left text-xs font-semibold text-neutral-400 border-t border-neutral-100 hover:bg-neutral-50 transition-colors">Learn More</button>
                            </div>
                        )}
                    </div>

                    {/* Marketplace */}
                    <div className="relative">
                        <button 
                            onClick={() => setOpenDropdown(openDropdown === 'marketplace' ? null : 'marketplace')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-bold transition-all focus:outline-none ${
                                openDropdown === 'marketplace' ? 'text-red-500 bg-red-50/50' : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
                            }`}
                        >
                            Marketplace
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'marketplace' ? 'rotate-180 text-red-500' : 'text-neutral-400'}`} />
                        </button>
                        {openDropdown === 'marketplace' && (
                            <div className="absolute left-0 mt-2 w-48 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-neutral-100 py-1.5 z-[130]">
                                <button onClick={() => handleAction('/dashboard?tab=marketplace-materials')} className="w-full px-4 py-2 text-left text-xs font-bold text-neutral-600 hover:bg-red-50 hover:text-red-500 transition-colors">Construction Materials</button>
                                <button onClick={() => handleAction('/dashboard?tab=marketplace-furniture')} className="w-full px-4 py-2 text-left text-xs font-bold text-neutral-600 hover:bg-red-50 hover:text-red-500 transition-colors">Furniture & Decor</button>
                                <button onClick={() => scrollToSection('showcase-marketplace')} className="w-full px-4 py-2 text-left text-xs font-semibold text-neutral-400 border-t border-neutral-100 hover:bg-neutral-50 transition-colors">Learn More</button>
                            </div>
                        )}
                    </div>

                    {/* Help Center */}
                    <Link 
                        to="/help"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-bold text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 transition-all focus:outline-none"
                    >
                        Help Center
                    </Link>
                </div>
            </div>

            {/* Right side: Authentication CTAs */}
            <div className="flex items-center shrink-0">
                {!user ? (
                    <Link to="/login" className="px-5 py-2 bg-neutral-900 text-white text-xs font-bold rounded-xl hover:bg-neutral-800 transition-all shadow-md shadow-neutral-200">
                        Sign In/Up
                    </Link>
                ) : (
                    <Link to="/dashboard" className="px-5 py-2 bg-neutral-900 text-white text-xs font-bold rounded-xl hover:bg-neutral-800 transition-all shadow-md shadow-neutral-200">
                        Access Dashboard
                    </Link>
                )}
            </div>
        </div>
    );
}
