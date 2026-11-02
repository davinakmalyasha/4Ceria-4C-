'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    Bell,
    Briefcase,
    CalendarCheck,
    CheckCircle,
    Clock,
    FileText,
    Gavel,
    Info,
    MessageSquare,
    Package,
    ShieldAlert,
    ShieldCheck,
    Star,
    Users,
    X,
} from 'lucide-react';
import {
    markAllNotificationsRead,
    markNotificationRead,
    openConversationWith,
    saveNotificationPreference,
} from '@/app/dashboard/notification-actions';
import { usePushNotifications } from './usePushNotifications';

/**
 * The notification inbox — a native port of the synced `NotificationsDropdown`.
 *
 * THE LIST IS SERVER-FED. The dashboard page awaits `GET /notifications` and
 * `/me/unread-summary` and passes the rows down, so the badge is correct on the
 * first paint (the legacy component fetched on mount and polled through a shared
 * heartbeat). Mark-read and mark-all are server actions followed by
 * `router.refresh()`; a click on a row also navigates, which is the behaviour the
 * legacy custom-event bridge had to emulate.
 *
 * Push preferences are read through the BFF on open, and the device
 * subscription is the ported `usePushNotifications` hook (service worker +
 * VAPID key). Money/arbitration types are absent from the mute list on purpose:
 * the API refuses to disable them.
 */

export interface NotificationRow {
    id: number;
    type: string;
    title: string;
    body: string;
    read_at?: string | null;
    created_at: string;
    data?: Record<string, unknown> | null;
}

type PreferenceMap = Record<string, { webpush?: { enabled?: boolean } }>;

const MUTEABLE_TYPES: { type: string | null; label: string }[] = [
    { type: null, label: 'All regular notifications' },
    { type: 'chat_message', label: 'Direct messages' },
    { type: 'project_message', label: 'Project messages' },
    { type: 'bid_received', label: 'New bids' },
    { type: 'new_review', label: 'New reviews' },
    { type: 'order_status', label: 'Material order status' },
    { type: 'schedule_delayed', label: 'Schedule delays' },
    { type: 'snag_overdue', label: 'Defect SLA warnings' },
    { type: 'consultation_requested', label: 'Consultation requests' },
];

function iconFor(type: string) {
    switch (type) {
        case 'bid_received':
        case 'pm_bid_received':
        case 'bid_shortlisted':
        case 'bid_recommended':
        case 'pm_bid_shortlisted':
        case 'pm_hire_initiated':
            return <Briefcase size={16} className="text-indigo-500" />;
        case 'bid_accepted':
        case 'pm_bid_accepted':
        case 'payment_verified':
        case 'consultation_confirmed':
        case 'milestone_approved':
        case 'phase_verified':
        case 'kickoff_issued':
            return <CheckCircle size={16} className="text-green-500" />;
        case 'payment_rejected':
        case 'bid_rejected':
        case 'consultation_declined':
        case 'milestone_revision_requested':
        case 'addendum_rejected':
        case 'procurement_rejected':
            return <X size={16} className="text-red-500" />;
        case 'milestone_updated':
        case 'milestone_approval_needed':
        case 'termin_due':
        case 'contract_ready':
            return <Star size={16} className="text-amber-500" />;
        case 'dispute_opened':
            return <ShieldAlert size={16} className="text-red-500" />;
        case 'dispute_reply':
        case 'project_message':
        case 'chat_message':
            return <MessageSquare size={16} className="text-blue-500" />;
        case 'dispute_resolved':
            return <Gavel size={16} className="text-emerald-500" />;
        case 'snag_overdue':
        case 'contract_terminated':
        case 'professional_resigned':
        case 'requirement_tagged':
            return <AlertTriangle size={16} className="text-amber-500" />;
        case 'order_payment_proof':
        case 'order_status':
            return <Package size={16} className="text-blue-500" />;
        case 'consultation_requested':
            return <CalendarCheck size={16} className="text-violet-500" />;
        case 'new_review':
        case 'review_received':
            return <Star size={16} className="text-yellow-500" />;
        case 'sub_professional_invite':
        case 'sub_professional_activated':
        case 'sub_professional_declined':
            return <Users size={16} className="text-sky-500" />;
        case 'schedule_delayed':
            return <Clock size={16} className="text-amber-500" />;
        case 'change_order':
        case 'addendum_approved':
            return <FileText size={16} className="text-emerald-500" />;
        case 'warranty_claim':
        case 'verification':
        case 'verification_required':
            return <ShieldCheck size={16} className="text-teal-500" />;
        default:
            return <Info size={16} className="text-neutral-500" />;
    }
}

function timeAgo(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);

    if (hours < 24) return `${hours}h ago`;

    return date.toLocaleDateString('en-GB');
}

export function NotificationsDropdown({
    notifications,
    unreadCount,
    setActiveTab,
}: {
    notifications: NotificationRow[];
    unreadCount: number;
    setActiveTab: (tab: string) => void;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [preferences, setPreferences] = useState<PreferenceMap>({});
    const [showPreferences, setShowPreferences] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [markingAll, setMarkingAll] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const push = usePushNotifications();

    useEffect(() => {
        if (!open) {
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                const response = await fetch('/api/notification-preferences');

                if (!response.ok) {
                    return;
                }

                const body = (await response.json()) as { preferences?: PreferenceMap };

                if (!cancelled) {
                    setPreferences(body.preferences ?? {});
                }
            } catch {
                // The panel shows platform defaults.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [open]);

    useEffect(() => {
        const handler = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', handler);

        return () => document.removeEventListener('mousedown', handler);
    }, []);

    async function handleNotification(notification: NotificationRow) {
        setError(null);

        if (!notification.read_at) {
            const result = await markNotificationRead(notification.id);

            if (!result.ok) {
                setError(result.message);
            } else {
                router.refresh();
            }
        }

        const data = (notification.data ?? {}) as Record<string, unknown>;
        const projectId = Number(data.project_id ?? data.projectId ?? 0);

        if (notification.type === 'chat_message' && Number(data.sender_id) > 0) {
            setOpen(false);
            const result = await openConversationWith(Number(data.sender_id));

            if (result.ok) {
                router.push(result.href);
            } else {
                setActiveTab('chat');
            }

            return;
        }

        if (notification.type === 'project_invitation') {
            setOpen(false);
            setActiveTab('my-bids');
            return;
        }

        if (notification.type.startsWith('consultation_')) {
            setOpen(false);
            setActiveTab('consultations');
            return;
        }

        if (notification.type === 'order_payment_proof' || notification.type === 'order_status') {
            setOpen(false);
            setActiveTab('orders');
            return;
        }

        if (notification.type === 'verification' || notification.type === 'verification_required') {
            setOpen(false);
            setActiveTab('verification');
            return;
        }

        if (
            notification.type === 'bid_shortlisted' ||
            notification.type === 'bid_recommended' ||
            notification.type === 'pm_bid_shortlisted'
        ) {
            setOpen(false);
            setActiveTab('my-bids');
            return;
        }

        if (projectId > 0) {
            setOpen(false);
            router.push(`/projects/${projectId}`);
        }
    }

    async function handleMarkAll() {
        setMarkingAll(true);
        setError(null);

        const result = await markAllNotificationsRead();

        if (!result.ok) {
            setError(result.message);
        } else {
            router.refresh();
        }

        setMarkingAll(false);
    }

    async function togglePreference(type: string | null, enabled: boolean) {
        const key = type ?? '*';
        const previous = preferences;

        setPreferences((current) => ({
            ...current,
            [key]: { ...(current[key] || {}), webpush: { ...(current[key]?.webpush || {}), enabled } },
        }));

        const result = await saveNotificationPreference(type, enabled);

        if (!result.ok) {
            setPreferences(previous);
            setError(result.message);
        }
    }

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-label="Notifications"
                className="relative p-2 rounded-xl text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 bg-[#FF2D20] text-white text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-[320px] sm:w-[380px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-neutral-100 z-[110] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
                        <h4 className="font-black text-neutral-900">Notifications</h4>
                        <div className="flex items-center gap-2">
                            {unreadCount > 0 && (
                                <button
                                    type="button"
                                    onClick={handleMarkAll}
                                    disabled={markingAll}
                                    className="text-xs font-bold text-[#FF2D20] hover:underline disabled:opacity-50"
                                >
                                    Mark all read
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Close notifications"
                                className="p-1 text-neutral-400 hover:text-neutral-600 rounded-lg hover:bg-neutral-100"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {error && <p className="px-5 py-2 text-[11px] font-bold text-red-600 bg-red-50">{error}</p>}

                    <div className="max-h-[400px] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="py-12 text-center text-neutral-400">
                                <Bell size={32} className="mx-auto mb-3 opacity-30" />
                                <p className="font-semibold">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map((notification) => (
                                <button
                                    type="button"
                                    key={notification.id}
                                    data-native-notification={notification.id}
                                    onClick={() => void handleNotification(notification)}
                                    className={`w-full flex items-start gap-3 px-5 py-4 border-b border-neutral-50 text-left transition-colors hover:bg-neutral-50 ${
                                        !notification.read_at ? 'bg-red-50/40' : ''
                                    }`}
                                >
                                    <span
                                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                                            !notification.read_at ? 'bg-white shadow-sm border border-neutral-100' : 'bg-neutral-100'
                                        }`}
                                    >
                                        {iconFor(notification.type)}
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="flex items-center gap-2">
                                            <span
                                                className={`text-sm font-bold leading-tight ${
                                                    !notification.read_at ? 'text-neutral-900' : 'text-neutral-600'
                                                }`}
                                            >
                                                {notification.title}
                                            </span>
                                            {!notification.read_at && (
                                                <span className="w-2 h-2 bg-[#FF2D20] rounded-full shrink-0" />
                                            )}
                                        </span>
                                        <span className="block text-xs text-neutral-500 mt-0.5 line-clamp-2">
                                            {notification.body}
                                        </span>
                                        <span className="block text-[10px] text-neutral-400 font-semibold mt-1">
                                            {timeAgo(notification.created_at)}
                                        </span>
                                    </span>
                                </button>
                            ))
                        )}
                    </div>

                    {push.supported && (
                        <div className="px-5 py-3 border-t border-neutral-100 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-neutral-900">Push notifications</p>
                                {push.error ? (
                                    <p className="text-[11px] text-red-500 mt-0.5">{push.error}</p>
                                ) : (
                                    <p className="text-[11px] text-neutral-400 mt-0.5">
                                        {push.enabled ? 'Active on this device' : 'Delivered even when the tab is closed'}
                                    </p>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setShowPreferences((value) => !value)}
                                    className="mt-1 text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-neutral-700 transition-colors"
                                >
                                    {showPreferences ? 'Close settings' : 'Choose notification types'}
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={push.enabled ? push.disable : push.enable}
                                disabled={push.busy}
                                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors disabled:opacity-50 ${
                                    push.enabled
                                        ? 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                        : 'bg-[#FF2D20] text-white hover:bg-red-600'
                                }`}
                            >
                                {push.busy ? '…' : push.enabled ? 'Disable' : 'Enable'}
                            </button>
                        </div>
                    )}

                    {showPreferences && (
                        <div className="px-5 py-3 border-t border-neutral-100 max-h-[220px] overflow-y-auto space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">
                                Send push for
                            </p>

                            {MUTEABLE_TYPES.map(({ type, label }) => {
                                const key = type ?? '*';
                                const rule = preferences[key]?.webpush;
                                const enabled = rule ? rule.enabled !== false : true;

                                return (
                                    <label key={key} className="flex items-center justify-between gap-3 py-1 cursor-pointer">
                                        <span className="text-[11px] text-neutral-700 font-medium">{label}</span>
                                        <input
                                            type="checkbox"
                                            checked={enabled}
                                            onChange={(event) => void togglePreference(type, event.target.checked)}
                                            className="w-4 h-4 accent-[#FF2D20] cursor-pointer"
                                        />
                                    </label>
                                );
                            })}

                            <p className="text-[10px] text-neutral-400 leading-relaxed pt-2 border-t border-neutral-100 mt-2">
                                Payment, dispute and contract notifications cannot be muted, so you always know
                                when money is held or frozen.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
