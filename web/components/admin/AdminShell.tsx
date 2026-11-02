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
 * A native port of the synced `AdminLayout`: the same five destinations, the
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
    const [open, setOpen] = useState(true);

    const isActive = (path: string) =>
        path === '/admin' ? pathname === '/admin' : pathname.startsWith(path);

    const badgeValue = (badge: 'pending' | 'disputes' | null): number =>
        badge === 'pending' ? pending : badge === 'disputes' ? disputes : 0;

    return (
        <div className="min-h-screen bg-[#fafafa] flex font-sans text-neutral-900 antialiased">
            <aside
                className={`${open ? 'w-64' : 'w-20'} bg-white border-r border-neutral-200 transition-all duration-300 flex flex-col fixed h-full z-50`}
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

            <main className={`${open ? 'ml-64' : 'ml-20'} flex-1 transition-all duration-300 min-h-screen`}>
                <div className="p-6 sm:p-8 max-w-[1400px] mx-auto">{children}</div>
            </main>
        </div>
    );
}
