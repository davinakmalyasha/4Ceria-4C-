'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { HelpCircle, LogOut, X } from 'lucide-react';
import { getNavItems, type NavItem } from './nav';
import { useAuth } from '@/context/AuthContext';
import { resolveAsset } from '@/lib/assetUrl';

/**
 * The mobile dashboard drawer.
 *
 * The header keeps only the essentials on a phone; everything else lives here,
 * grouped exactly like the desktop navigation. Escape and a backdrop click
 * close it, and the body is scroll-locked while it is open.
 */
export function MobileNav({
    open,
    activeTab,
    counts,
    storageBase,
    onClose,
    onNavigate,
}: {
    open: boolean;
    activeTab: string;
    counts?: Record<string, number>;
    storageBase: string;
    onClose: () => void;
    onNavigate: (tab: string) => void;
}) {
    const { user, logout } = useAuth();
    const navItems = getNavItems(user?.role_type, !!user);

    useEffect(() => {
        if (!open) return;

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        document.addEventListener('keydown', onKey);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
    }, [open, onClose]);

    if (!open) return null;

    const renderItem = (item: NavItem, depth = 0) => {
        const Icon = item.icon;
        const count = counts?.[item.id];
        const active = activeTab === item.id;

        return (
            <button
                key={item.id}
                type="button"
                onClick={() => {
                    if (!item.children) {
                        onNavigate(item.id);
                        onClose();
                    }
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 text-left transition-colors ${
                    depth === 0 ? 'py-2.5' : 'py-2'
                } ${
                    active
                        ? 'bg-red-50 font-black text-[#FD1D1D]'
                        : 'font-semibold text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                } ${item.children ? 'cursor-default' : ''}`}
            >
                <Icon className={`${depth === 0 ? 'h-4.5 w-4.5' : 'h-4 w-4'} shrink-0`} />
                <span className={`flex-1 ${depth === 0 ? 'text-sm' : 'text-[13px]'}`}>{item.label}</span>
                {count !== undefined && count > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-50 px-1.5 text-[10px] font-black text-[#FD1D1D]">
                        {count}
                    </span>
                )}
            </button>
        );
    };

    return (
        <div className="fixed inset-0 z-[250] md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <button
                type="button"
                aria-label="Close menu"
                onClick={onClose}
                className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px]"
            />

            <aside className="absolute inset-y-0 left-0 flex w-[min(86vw,20rem)] flex-col bg-white pt-[env(safe-area-inset-top)] shadow-2xl">
                <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
                    <Link href="/dashboard" onClick={onClose} className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/assets/Logo4C.png" alt="" width={32} height={32} className="h-8 w-8" />
                        <span className="text-sm font-extrabold tracking-tight text-neutral-900">4Ceria</span>
                    </Link>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close menu"
                        className="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                    {navItems.map((item) => (
                        <div key={item.id}>
                            {renderItem(item)}
                            {item.children && (
                                <div className="ml-5 space-y-0.5 border-l border-neutral-100 pl-2">
                                    {item.children.map((child) => renderItem(child, 1))}
                                </div>
                            )}
                        </div>
                    ))}

                    <div className="!mt-4 border-t border-neutral-100 pt-3">
                        <Link
                            href="/help"
                            onClick={onClose}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-50"
                        >
                            <HelpCircle className="h-4.5 w-4.5" />
                            Help Center
                        </Link>
                    </div>
                </nav>

                {user && (
                    <div className="border-t border-neutral-100 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
                            {user.pic ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={resolveAsset(storageBase, user.pic) ?? ''}
                                    alt=""
                                    className="h-9 w-9 rounded-lg object-cover"
                                />
                            ) : (
                                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-tr from-[#FD1D1D] to-[#FD1D1D]/85 text-xs font-black text-white">
                                    {user.name?.charAt(0).toUpperCase()}
                                </span>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-black text-neutral-900">{user.name}</p>
                                <p className="truncate text-[10px] font-semibold capitalize text-neutral-400">
                                    {user.role_type}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={logout}
                                aria-label="Sign out"
                                className="rounded-lg p-2 text-red-500 transition hover:bg-red-50"
                            >
                                <LogOut className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
            </aside>
        </div>
    );
}
