'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
    Briefcase,
    Gavel,
    Home,
    LayoutDashboard,
    LogOut,
    Menu,
    Shield,
    UserCheck,
    X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

/**
 * The admin chrome.
 *
 * A native version of the `AdminLayout`: the same five destinations, the
 * same badges (pending verifications, open disputes) and the same fixed
 * sidebar. The counts are fetched by the server layout and passed in, so the
 * badges are correct on first paint; `usePathname` replaces react-router's
 * location.
 */
const NAV = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard, badge: null },
    { name: 'Verification Queue', path: '/admin/verification', icon: UserCheck, badge: 'pending' },
    { name: 'Houses Moderation', path: '/admin/houses', icon: Home, badge: null },
    { name: 'Projects Audit', path: '/admin/projects', icon: Briefcase, badge: null },
    { name: 'Dispute Center', path: '/admin/disputes', icon: Gavel, badge: 'disputes' },
] as const;

export function AdminShell({
    pending,
    disputes,
    children,
}: {
    pending: number;
    disputes: number;
    children: ReactNode;
}) {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const [open, setOpen] = useState(false);

    const isActive = (path: string) =>
        path === '/admin' ? pathname === '/admin' : pathname.startsWith(path);

    const badgeValue = (badge: 'pending' | 'disputes' | null): number =>
        badge === 'pending' ? pending : badge === 'disputes' ? disputes : 0;

    return (
        <div className="min-h-screen bg-[#fafafa] flex font-sans text-neutral-900 antialiased">
            {open && (
                <button
                    type="button"
                    aria-label="Close admin menu"
                    onClick={() => setOpen(false)}
                    className="fixed inset-0 z-40 bg-neutral-900/40 backdrop-blur-[2px] md:hidden"
                />
            )}

            <aside
                className={`fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col border-r border-neutral-200 bg-white pt-[env(safe-area-inset-top)] transition-all duration-300 md:static md:translate-x-0 ${
                    open ? 'translate-x-0 md:w-64' : '-translate-x-full md:w-20'
                }`}
            >
                <div className="p-6 flex items-center justify-between border-b border-neutral-100">
                    {open ? (
                        <div className="flex items-center gap-2 font-black tracking-tight text-neutral-900">
                            <Shield size={20} />
                            <span className="text-sm uppercase tracking-[0.15em]">Admin Portal</span>
                        </div>
                    ) : (
                        <div className="w-8 h-8 rounded bg-neutral-950 flex items-center justify-center text-white font-bold text-xs">
                            A
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
                        className="p-1.5 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 rounded"
                    >
                        {open ? <X size={16} /> : <Menu size={16} />}
                    </button>
                </div>

                <nav className="flex-1 px-4 space-y-1.5 mt-6">
                    {NAV.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.path);
                        const count = badgeValue(item.badge);

                        return (
                            <Link
                                key={item.path}
                                href={item.path}
                                onClick={() => {
                                    if (typeof window !== 'undefined' && window.innerWidth < 768) setOpen(false);
                                }}
                                className={`relative flex items-center gap-3 p-3 rounded-xl transition-all ${
                                    active
                                        ? 'bg-neutral-900 text-white shadow-sm font-semibold'
                                        : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                                }`}
                            >
                                <Icon size={18} className="shrink-0" />
                                {open && <span className="text-xs uppercase tracking-wider">{item.name}</span>}
                                {count > 0 && (
                                    <span
                                        className={`absolute bg-red-500 text-white text-[9px] font-black min-w-5 h-5 px-1 flex items-center justify-center rounded-full ${
                                            open ? 'right-3' : 'top-1 right-1'
                                        }`}
                                    >
                                        {count > 99 ? '99+' : count}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="border-t border-neutral-100 p-4">
                    <div className="flex items-center justify-between gap-2">
                        {open && (
                            <div className="min-w-0">
                                <p className="text-xs font-black text-neutral-900 truncate">{user?.name}</p>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                    Administrator
                                </p>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={logout}
                            aria-label="Sign out"
                            className="p-2 rounded-lg text-neutral-500 hover:bg-red-50 hover:text-red-600"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </aside>

            <main className={`min-h-screen flex-1 transition-all duration-300 ${open ? 'md:ml-64' : 'md:ml-20'}`}>
                <div className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        aria-label="Open admin menu"
                        className="rounded-lg p-2 text-neutral-600 transition hover:bg-neutral-100"
                    >
                        <Menu size={20} />
                    </button>
                    <span className="text-xs font-black uppercase tracking-[0.15em] text-neutral-900">Admin Portal</span>
                    <span className="w-9" />
                </div>
                <div className="p-4 sm:p-8 max-w-[1400px] mx-auto">{children}</div>
            </main>
        </div>
    );
}
