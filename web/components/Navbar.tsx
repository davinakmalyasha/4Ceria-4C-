'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Building, ChevronDown, HelpCircle, ShoppingBag, Users } from 'lucide-react';

/**
 * The public navbar — a port of `resources/js/components/Navbar.tsx`.
 *
 * IT IS A CLIENT COMPONENT, AND IT HAS TO BE. The bar hides on scroll and its
 * three menus open on click; both are browser state. What changed is WHERE the
 * signed-in answer comes from: the server passes `authed`, resolved from the
 * httpOnly cookie, so the bar renders the correct call to action in the first
 * byte of HTML instead of after `/me` answers.
 *
 * The dropdowns navigate with the router rather than `window.location`, and the
 * "Learn More" items scroll to a section id — the same ids the page uses.
 */
export default function Navbar({ authed }: { authed: boolean }) {
    const router = useRouter();
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
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setOpenDropdown(null);
    };

    const handleAction = (path: string) => {
        router.push(path);
        setOpenDropdown(null);
    };

    const trigger = (key: string) =>
        `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-bold transition-all focus:outline-none ${
            openDropdown === key ? 'text-red-500 bg-red-50/50' : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
        }`;

    const chevron = (key: string) =>
        `w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === key ? 'rotate-180 text-red-500' : 'text-neutral-400'}`;

    const menuItem = 'w-full px-4 py-2 text-left text-xs font-bold text-neutral-600 hover:bg-red-50 hover:text-red-500 transition-colors';
    const menuMore = 'w-full px-4 py-2 text-left text-xs font-semibold text-neutral-400 border-t border-neutral-100 hover:bg-neutral-50 transition-colors';

    return (
        <div
            className={`custom-navbar-container ${hidden ? 'hidden-nav' : ''} h-14 flex items-center justify-between px-6 bg-white/80 backdrop-blur-md border-b border-neutral-100 fixed top-0 left-0 right-0 z-100 transition-transform duration-300`}
        >
            <div className="flex items-center gap-6 min-w-0">
                <div className="flex items-center gap-3 shrink-0">
                    <Link href="/" className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="w-8 h-8 object-contain" src="/assets/Logo4C.png" alt="4C Logo" />
                        <span className="text-sm font-extrabold text-neutral-800 tracking-tight">4Ceria</span>
                    </Link>
                </div>

                <div ref={dropdownRef} className="hidden md:flex items-center gap-1 animate-fade-in">
                    <div className="relative">
                        <button type="button" onClick={() => setOpenDropdown(openDropdown === 'properties' ? null : 'properties')} className={trigger('properties')}>
                            <Building className="w-[15px] h-[15px] shrink-0" />
                            Properties
                            <ChevronDown className={chevron('properties')} />
                        </button>
                        {openDropdown === 'properties' && (
                            <div className="absolute left-0 mt-2 w-48 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-neutral-100 py-1.5 z-130">
                                <button type="button" onClick={() => handleAction('/dashboard?tab=houses')} className={menuItem}>Browse Houses</button>
                                <button type="button" onClick={() => handleAction('/dashboard?tab=post-house')} className={menuItem}>List Properties</button>
                                <button type="button" onClick={() => scrollToSection('showcase-properties')} className={menuMore}>Learn More</button>
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <button type="button" onClick={() => setOpenDropdown(openDropdown === 'professionals' ? null : 'professionals')} className={trigger('professionals')}>
                            <Users className="w-[15px] h-[15px] shrink-0" />
                            Hire Professionals
                            <ChevronDown className={chevron('professionals')} />
                        </button>
                        {openDropdown === 'professionals' && (
                            <div className="absolute left-0 mt-2 w-48 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-neutral-100 py-1.5 z-130">
                                <button type="button" onClick={() => handleAction('/dashboard?tab=architects')} className={menuItem}>Hire Architect</button>
                                <button type="button" onClick={() => handleAction('/dashboard?tab=constructors')} className={menuItem}>Hire Constructor</button>
                                <button type="button" onClick={() => handleAction('/dashboard?tab=notaris')} className={menuItem}>Legal Notary &amp; PPAT</button>
                                <button type="button" onClick={() => scrollToSection('showcase-professionals')} className={menuMore}>Learn More</button>
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <button type="button" onClick={() => setOpenDropdown(openDropdown === 'marketplace' ? null : 'marketplace')} className={trigger('marketplace')}>
                            <ShoppingBag className="w-[15px] h-[15px] shrink-0" />
                            Marketplace
                            <ChevronDown className={chevron('marketplace')} />
                        </button>
                        {openDropdown === 'marketplace' && (
                            <div className="absolute left-0 mt-2 w-48 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-neutral-100 py-1.5 z-130">
                                <button type="button" onClick={() => handleAction('/dashboard?tab=marketplace-materials')} className={menuItem}>Construction Materials</button>
                                <button type="button" onClick={() => handleAction('/dashboard?tab=marketplace-furniture')} className={menuItem}>Furniture &amp; Decor</button>
                                <button type="button" onClick={() => scrollToSection('showcase-marketplace')} className={menuMore}>Learn More</button>
                            </div>
                        )}
                    </div>

                    <Link
                        href="/help"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-bold text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 transition-all focus:outline-none"
                    >
                        <HelpCircle className="w-[15px] h-[15px] shrink-0" />
                        Help Center
                    </Link>
                </div>
            </div>

            <div className="flex items-center shrink-0">
                {!authed ? (
                    <Link href="/login" className="px-5 py-2 bg-neutral-900 text-white text-xs font-bold rounded-xl hover:bg-neutral-800 transition-all shadow-md shadow-neutral-200">
                        Sign In/Up
                    </Link>
                ) : (
                    <Link href="/dashboard" className="px-5 py-2 bg-neutral-900 text-white text-xs font-bold rounded-xl hover:bg-neutral-800 transition-all shadow-md shadow-neutral-200">
                        Access Dashboard
                    </Link>
                )}
            </div>
        </div>
    );
}
