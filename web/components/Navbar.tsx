'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
    Building,
    ChevronDown,
    HelpCircle,
    Menu,
    ShoppingBag,
    Sparkles,
    Users,
    X,
} from 'lucide-react';

type MenuKey = 'properties' | 'professionals' | 'marketplace';

const MENUS: {
    key: MenuKey;
    label: string;
    icon: typeof Building;
    items: { label: string; href: string }[];
}[] = [
    {
        key: 'properties',
        label: 'Properties',
        icon: Building,
        items: [
            { label: 'Browse houses', href: '/dashboard/houses' },
            { label: 'List a property', href: '/dashboard/post-house' },
            { label: 'How it works', href: '/#showcase-properties' },
        ],
    },
    {
        key: 'professionals',
        label: 'Hire professionals',
        icon: Users,
        items: [
            { label: 'Hire an architect', href: '/dashboard/architects' },
            { label: 'Hire a contractor', href: '/dashboard/constructors' },
            { label: 'Legal, notary & PPAT', href: '/dashboard/notaris' },
            { label: 'All specialists', href: '/dashboard/architects' },
        ],
    },
    {
        key: 'marketplace',
        label: 'Marketplace',
        icon: ShoppingBag,
        items: [
            { label: 'Construction materials', href: '/dashboard/marketplace-materials' },
            { label: 'Furniture & decor', href: '/dashboard/marketplace-furniture' },
            { label: 'How it works', href: '/#showcase-marketplace' },
        ],
    },
];

export default function Navbar({ authed }: { authed: boolean }) {
    const [hidden, setHidden] = useState(false);
    const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
    const [mobileOpen, setMobileOpen] = useState(false);
    const lastScrollY = useRef(0);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleScroll = () => {
            const current = window.scrollY || document.documentElement.scrollTop;
            setHidden(current > lastScrollY.current && current > 120);
            lastScrollY.current = current;
        };

        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpenMenu(null);
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            window.removeEventListener('scroll', handleScroll);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        if (!mobileOpen) return;

        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previous;
        };
    }, [mobileOpen]);

    const trigger = (key: MenuKey) =>
        `flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-bold transition-all focus:outline-none ${
            openMenu === key
                ? 'bg-red-50/60 text-[#FD1D1D]'
                : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800'
        }`;

    return (
        <>
            <div
                className={`fixed inset-x-0 top-0 z-100 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between border-b border-neutral-100 bg-white/85 px-5 pt-[env(safe-area-inset-top)] backdrop-blur-md transition-transform duration-300 sm:px-6 ${
                    hidden ? '-translate-y-full' : ''
                }`}
            >
                <div className="flex min-w-0 items-center gap-6">
                    <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="4Ceria home">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="h-8 w-8 object-contain" src="/assets/Logo4C.png" alt="" />
                        <span className="text-sm font-extrabold tracking-tight text-neutral-800">4Ceria</span>
                    </Link>

                    <div ref={dropdownRef} className="hidden items-center gap-1 md:flex">
                        {MENUS.map((menu) => (
                            <div key={menu.key} className="relative">
                                <button
                                    type="button"
                                    onClick={() => setOpenMenu(openMenu === menu.key ? null : menu.key)}
                                    aria-expanded={openMenu === menu.key}
                                    aria-haspopup="menu"
                                    className={trigger(menu.key)}
                                >
                                    <menu.icon className="h-3.5 w-3.5 shrink-0" />
                                    {menu.label}
                                    <ChevronDown
                                        className={`h-3.5 w-3.5 transition-transform duration-200 ${
                                            openMenu === menu.key
                                                ? 'rotate-180 text-[#FD1D1D]'
                                                : 'text-neutral-400'
                                        }`}
                                    />
                                </button>

                                {openMenu === menu.key && (
                                    <div
                                        role="menu"
                                        className="absolute left-0 z-130 mt-2 w-56 rounded-2xl border border-neutral-100 bg-white py-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.12)]"
                                    >
                                        {menu.items.map((item) => (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                role="menuitem"
                                                onClick={() => setOpenMenu(null)}
                                                className="block px-4 py-2 text-xs font-bold text-neutral-600 transition-colors hover:bg-red-50 hover:text-[#FD1D1D]"
                                            >
                                                {item.label}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        <Link
                            href="/help"
                            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-bold text-neutral-500 transition-all hover:bg-neutral-50 hover:text-neutral-800"
                        >
                            <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                            Help center
                        </Link>

                        <Link
                            href="/dashboard/assistant"
                            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-bold text-neutral-500 transition-all hover:bg-neutral-50 hover:text-neutral-800"
                        >
                            <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#FD1D1D]" />
                            Ceria AI
                        </Link>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <Link
                        href={authed ? '/dashboard' : '/login'}
                        className="rounded-xl bg-neutral-900 px-5 py-2 text-xs font-bold text-white shadow-md shadow-neutral-200 transition hover:bg-neutral-800"
                    >
                        {authed ? 'Open dashboard' : 'Sign in'}
                    </Link>

                    <button
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        aria-label="Open navigation"
                        className="rounded-lg p-2 text-neutral-600 transition hover:bg-neutral-100 md:hidden"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {mobileOpen && (
                <div className="fixed inset-0 z-[250] md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
                    <button
                        type="button"
                        aria-label="Close navigation"
                        onClick={() => setMobileOpen(false)}
                        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px]"
                    />
                    <div className="absolute inset-y-0 right-0 flex w-[min(88vw,22rem)] flex-col bg-white pt-[env(safe-area-inset-top)] shadow-2xl">
                        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
                            <span className="text-sm font-extrabold tracking-tight text-neutral-900">Menu</span>
                            <button
                                type="button"
                                onClick={() => setMobileOpen(false)}
                                aria-label="Close navigation"
                                className="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <nav className="flex-1 overflow-y-auto px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                            {MENUS.map((menu) => (
                                <div key={menu.key} className="mb-5">
                                    <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                        <menu.icon className="h-3.5 w-3.5" />
                                        {menu.label}
                                    </p>
                                    <div className="space-y-1">
                                        {menu.items.map((item) => (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={() => setMobileOpen(false)}
                                                className="block rounded-xl px-3 py-2.5 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 hover:text-[#FD1D1D]"
                                            >
                                                {item.label}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            <div className="space-y-1 border-t border-neutral-100 pt-4">
                                <Link
                                    href="/dashboard/assistant"
                                    onClick={() => setMobileOpen(false)}
                                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50"
                                >
                                    <Sparkles className="h-4 w-4 text-[#FD1D1D]" />
                                    Ceria AI
                                </Link>
                                <Link
                                    href="/help"
                                    onClick={() => setMobileOpen(false)}
                                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50"
                                >
                                    <HelpCircle className="h-4 w-4" />
                                    Help center
                                </Link>
                            </div>

                            <div className="mt-5 grid gap-2">
                                <Link
                                    href="/register"
                                    onClick={() => setMobileOpen(false)}
                                    className="rounded-xl bg-neutral-900 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-neutral-800"
                                >
                                    Create an account
                                </Link>
                                <Link
                                    href="/pro/register"
                                    onClick={() => setMobileOpen(false)}
                                    className="rounded-xl border border-neutral-200 px-4 py-3 text-center text-sm font-bold text-neutral-800 transition hover:border-[#FD1D1D] hover:text-[#FD1D1D]"
                                >
                                    Join as a professional
                                </Link>
                            </div>
                        </nav>
                    </div>
                </div>
            )}
        </>
    );
}
