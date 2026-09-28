import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Bell, CheckCircle, Briefcase, MessageSquare, Star, X, Info,
    ShieldAlert, Gavel, Package, CalendarCheck, Users, AlertTriangle,
    Clock, FileText, ShieldCheck
} from 'lucide-react';
import axios from 'axios';
import { useUnreadCounts } from '../hooks/useUnreadCounts';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useToast } from '../context/ToastContext';
import { getApiErrorMessage } from '..//utils/apiError';

interface Notification {
    id: number;
    type: string;
    title: string;
    body: string;
    read_at: string | null;
    created_at: string;
    data?: any;
}

/**
 * Push categories a user may mute. `null` is the blanket default.
 *
 * Deliberately EXCLUDES money, arbitration, contract and compliance types:
 * NotificationPreferenceService::ALWAYS_ON refuses to store a mute for those,
 * because a user who can silence "your payment was released" or "a dispute is
 * open and your money is frozen" cannot trust the escrow.
 */
const MUTEABLE_TYPES: { type: string | null; label: string }[] = [
    { type: null, label: 'Semua notifikasi biasa' },
    { type: 'chat_message', label: 'Pesan langsung' },
    { type: 'project_message', label: 'Pesan proyek' },
    { type: 'bid_received', label: 'Bid baru masuk' },
    { type: 'new_review', label: 'Ulasan baru' },
    { type: 'order_status', label: 'Status pesanan material' },
    { type: 'schedule_delayed', label: 'Keterlambatan jadwal' },
    { type: 'snag_overdue', label: 'Peringatan cacat pekerjaan' },
    { type: 'consultation_requested', label: 'Permintaan konsultasi' },
];

export default function NotificationsDropdown() {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preferences, setPreferences] = useState<Record<string, any>>({});
    const [showPreferences, setShowPreferences] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const mountedRef = useRef(false);
    const lastSeenRef = useRef(-1);
    const { counts, refresh } = useUnreadCounts();
    const push = usePushNotifications();
    const { showToast } = useToast();

    const unreadCount = counts.unread_notifications;

    const fetchNotifications = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await axios.get('/notifications');
            setNotifications(res.data.data);
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to fetch notifications'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();

        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', handler);

        return () => {
            document.removeEventListener('mousedown', handler);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        // Re-sync the list when new notifications arrive. The shared
        // heartbeat (useUnreadCounts) is the only timer — no private poller.
        lastSeenRef.current = counts.unread_notifications;
        if (mountedRef.current) {
            fetchNotifications();
        } else {
            mountedRef.current = true;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [counts.unread_notifications]);

    useEffect(() => {
        // UX: opening the dropdown no longer bulk-marks everything read —
        // unread context stays until each item is clicked (markRead on click).
        if (open && notifications.length === 0) {
            fetchNotifications();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const fetchPreferences = async () => {
        try {
            const res = await axios.get('/notification-preferences');
            setPreferences(res.data.preferences || {});
        } catch {
            // Non-fatal: the panel simply shows platform defaults.
            setPreferences({});
        }
    };

    const savePreference = async (type: string | null, enabled: boolean) => {
        // Optimistic, then reconcile with the server.
        const key = type ?? '*';
        setPreferences(prev => ({
            ...prev,
            [key]: { ...(prev[key] || {}), webpush: { ...(prev[key]?.webpush || {}), enabled } },
        }));

        try {
            await axios.put('/notification-preferences', { type, channel: 'webpush', enabled });
        } catch (err) {
            showToast(getApiErrorMessage(err, 'Gagal menyimpan pengaturan notifikasi'), 'error');
            fetchPreferences();
        }
    };

    useEffect(() => {
        if (open) {
            fetchPreferences();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, showPreferences]);

    const markRead = async (id: number) => {
        try {
            await axios.post(`/notifications/${id}/read`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
            refresh();
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to mark notification as read'));
        }
    };

    const markAllRead = async () => {
        try {
            await axios.post('/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })));
            refresh();
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to mark all notifications as read'));
        }
    };

    const getIcon = (type: string) => {        switch (type) {
            case 'bid_received':
            case 'pm_bid_received': return <Briefcase size={16} className="text-blue-500" />;
            case 'bid_accepted':
            case 'pm_bid_accepted':
            case 'payment_verified':
            case 'consultation_confirmed':
            case 'milestone_approved': return <CheckCircle size={16} className="text-green-500" />;
            case 'payment_rejected':
            case 'bid_rejected':
            case 'consultation_declined':
            case 'milestone_revision_requested': return <X size={16} className="text-red-500" />;
            case 'milestone_updated':
            case 'milestone_approval_needed':
            case 'termin_due':
            case 'contract_ready': return <Star size={16} className="text-amber-500" />;

            // Dispute / arbitration (2026-09). These were emitted by
            // DisputeService but rendered as a generic grey Info glyph, so the
            // single most consequential events on the platform looked
            // identical to a system notice.
            case 'dispute_opened': return <ShieldAlert size={16} className="text-red-500" />;
            case 'dispute_reply': return <MessageSquare size={16} className="text-violet-500" />;
            case 'dispute_resolved': return <Gavel size={16} className="text-emerald-500" />;

            // Snag/defect SLA escalation (daily scheduled command).
            case 'snag_overdue': return <AlertTriangle size={16} className="text-amber-500" />;

            // Marketplaces.
            case 'order_payment_proof':
            case 'order_status': return <Package size={16} className="text-blue-500" />;
            case 'consultation_requested': return <CalendarCheck size={16} className="text-violet-500" />;
            case 'new_review':
            case 'review_received': return <Star size={16} className="text-yellow-500" />;
            case 'sub_professional_invite':
            case 'sub_professional_activated':
            case 'sub_professional_declined': return <Users size={16} className="text-sky-500" />;
            case 'contract_terminated':
            case 'professional_resigned':
            case 'requirement_tagged': return <AlertTriangle size={16} className="text-red-400" />;
            case 'schedule_delayed': return <Clock size={16} className="text-amber-500" />;
            case 'change_order':
            case 'addendum_approved': return <FileText size={16} className="text-emerald-500" />;
            case 'addendum_rejected':
            case 'procurement_rejected': return <X size={16} className="text-red-400" />;
            case 'warranty_claim': return <ShieldCheck size={16} className="text-teal-500" />;
            case 'bid_shortlisted':
            case 'bid_recommended':
            case 'pm_bid_shortlisted':
            case 'pm_hire_initiated': return <Briefcase size={16} className="text-indigo-500" />;
            case 'phase_verified':
            case 'kickoff_issued': return <CheckCircle size={16} className="text-teal-500" />;
            case 'verification_required':
            case 'verification': return <ShieldCheck size={16} className="text-indigo-500" />;
            case 'budget_approved':
            case 'budget_approval_needed': return <CheckCircle size={16} className="text-emerald-500" />;
            case 'budget_rejected':
            case 'budget_negotiation': return <X size={16} className="text-amber-500" />;
            case 'project_message':
            case 'chat_message': return <MessageSquare size={16} className="text-blue-500" />;
            default: return <Info size={16} className="text-gray-500" />;
        }
    };

    /**
     * Where a notification click lands.
     *
     * Previously only `project_id`, `chat_message` and `project_invitation`
     * routed anywhere, so every other type was a silent no-op beyond
     * mark-as-read — including `consultation_requested` (a notary told
     * "New Consultation Booking" with no way to answer) and
     * `order_payment_proof`.
     */
    const getNavigationTarget = (n: Notification): { tab: string; [key: string]: any } | null => {
        const data = n.data || {};

        if (n.type === 'chat_message' && data.sender_id) {
            return { tab: 'chat', chatUserId: data.sender_id };
        }

        if (n.type === 'project_invitation') {
            return { tab: 'my-bids', subTab: 'invitations' };
        }

        if (n.type === 'consultation_requested' || n.type === 'consultation_confirmed' || n.type === 'consultation_declined') {
            return { tab: 'consultations' };
        }

        if (n.type === 'order_payment_proof' || n.type === 'order_status') {
            return { tab: 'orders' };
        }

        if (n.type === 'verification' || n.type === 'verification_required') {
            return { tab: 'profile' };
        }

        if (n.type === 'bid_shortlisted' || n.type === 'bid_recommended' || n.type === 'pm_bid_shortlisted') {
            return { tab: 'my-bids' };
        }

        // Everything project-scoped lands on the project workspace, which also
        // covers disputes and snag escalations.
        const projectId = data.project_id || data.projectId;
        if (projectId) {
            return { tab: 'project-detail', projectId };
        }

        return null;
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Baru saja';
        if (diffMins < 60) return `${diffMins}m lalu`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}j lalu`;
        return date.toLocaleDateString('id-ID');
    };

    return (
        <div ref={ref} className="relative">
            <button onClick={() => setOpen(!open)} className="relative p-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors">
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[#FF2D20] text-white text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-white animate-pulse">
                        {unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        className="absolute right-0 top-full mt-2 w-[320px] sm:w-[380px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-gray-100 z-[110] overflow-hidden"
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <h4 className="font-black text-gray-900">Notifikasi</h4>
                            <div className="flex items-center gap-2">
                                {unreadCount > 0 && (
                                    <button onClick={markAllRead} className="text-xs font-bold text-[#FF2D20] hover:underline">Tandai semua dibaca</button>
                                )}
                                <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={16} /></button>
                            </div>
                        </div>

                        <div className="max-h-[400px] overflow-y-auto">
                            {error ? (
                                <div className="py-12 text-center text-red-500">
                                    <X size={32} className="mx-auto mb-3 opacity-40" />
                                    <p className="font-semibold px-6">{error}</p>
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="py-12 text-center text-gray-400">
                                    <Bell size={32} className="mx-auto mb-3 opacity-30" />
                                    <p className="font-semibold">Belum ada notifikasi</p>
                                </div>
                            ) : (
                                notifications.map(n => (
                                    <div
                                        key={n.id}
                                        onClick={() => {
                                            if (!n.read_at) markRead(n.id);

                                            const target = getNavigationTarget(n);

                                            if (target) {
                                                window.dispatchEvent(new CustomEvent('switchDashboardTab', { detail: target }));
                                                setOpen(false);
                                            } else {
                                                // Unroutable notification: say so instead of
                                                // appearing broken when nothing happens.
                                                showToast('Notifikasi ini tidak punya tujuan navigasi.', 'info');
                                            }
                                        }}
                                        className={`flex items-start gap-3 px-5 py-4 border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50 ${!n.read_at ? 'bg-red-50/40' : ''}`}
                                    >
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${!n.read_at ? 'bg-white shadow-sm border border-gray-100' : 'bg-gray-100'}`}>
                                            {getIcon(n.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className={`text-sm font-bold leading-tight ${!n.read_at ? 'text-gray-900' : 'text-gray-600'}`}>{n.title}</p>
                                                {!n.read_at && <span className="w-2 h-2 bg-[#FF2D20] rounded-full shrink-0" />}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                                            <p className="text-[10px] text-gray-400 font-semibold mt-1">{formatTime(n.created_at)}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {push.supported && (
                            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-gray-900">Notifikasi Push</p>
                                    {push.error ? (
                                        <p className="text-[11px] text-red-500 mt-0.5">{push.error}</p>
                                    ) : (
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                            {push.enabled ? 'Aktif di perangkat ini' : 'Dapat dikirim walau tab tertutup'}
                                        </p>
                                    )}
                                    <button
                                        onClick={() => setShowPreferences(v => !v)}
                                        className="mt-1 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-700 transition-colors"
                                    >
                                        {showPreferences ? 'Tutup pengaturan' : 'Atur jenis notifikasi'}
                                    </button>
                                </div>
                                <button
                                    onClick={push.enabled ? push.disable : push.enable}
                                    disabled={push.busy}
                                    className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors disabled:opacity-50 ${
                                        push.enabled
                                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            : 'bg-[#FF2D20] text-white hover:bg-red-600'
                                    }`}
                                >
                                    {push.busy ? '...' : push.enabled ? 'Nonaktif' : 'Aktifkan'}
                                </button>
                            </div>
                        )}

                        {showPreferences && (
                            <div className="px-5 py-3 border-t border-gray-100 max-h-[220px] overflow-y-auto space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                                    Kirim push untuk
                                </p>

                                {MUTEABLE_TYPES.map(({ type, label }) => {
                                    const key = type ?? '*';
                                    const rule = preferences[key]?.webpush;
                                    const enabled = rule ? rule.enabled : true;

                                    return (
                                        <label key={key} className="flex items-center justify-between gap-3 py-1 cursor-pointer">
                                            <span className="text-[11px] text-gray-700 font-medium">{label}</span>
                                            <input
                                                type="checkbox"
                                                checked={enabled}
                                                onChange={(e) => savePreference(type, e.target.checked)}
                                                className="w-4 h-4 accent-[#FF2D20] cursor-pointer"
                                            />
                                        </label>
                                    );
                                })}

                                <p className="text-[10px] text-gray-400 leading-relaxed pt-2 border-t border-gray-100 mt-2">
                                    Notifikasi pembayaran, sengketa, dan _
                                    _(kebijakan proyek) tidak dapat dimatikan — agar Anda
                                    selalu tahu jika uang Anda tertahan atau dibekukan.
                                </p>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
