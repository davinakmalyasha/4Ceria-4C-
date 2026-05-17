import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { useToast } from '../../context/ToastContext';
import { AlertCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface InvitationBannerProps {
    project: any;
    user: any;
    onRefresh: () => void;
}

export const InvitationBanner: React.FC<InvitationBannerProps> = ({ project, user, onRefresh }) => {
    const { showToast } = useToast();
    const [isAccepting, setIsAccepting] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);

    // Find if the current user has an invitation bid for this project
    const userInvitation = useMemo(() => {
        if (!project || !user || !project.id) return null;
        
        const bidKeys = [
            { key: 'bids_structural', role: 'structural' },
            { key: 'bids_mep', role: 'mep' },
            { key: 'bids_arsitek', role: 'arsitek' },
            { key: 'bids_kontraktor', role: 'kontraktor' },
            { key: 'bids_notaris', role: 'notaris' },
            { key: 'bids_interior', role: 'interior' },
            { key: 'bids_project_manager', role: 'pm' }
        ];

        try {
            for (const { key, role } of bidKeys) {
                const bids = project[key] || [];
                if (!Array.isArray(bids)) continue;

                const found = bids.find((b: any) => {
                    if (!b || b.status !== 'invited') return false;

                    const bidderUserId = b.bidder?.user_id || b.bidder?.user?.id;
                    if (bidderUserId && bidderUserId === user.id) return true;

                    if (role === 'structural' && (b.structural_engineer?.user_id === user.id || b.structural_engineer?.user?.id === user.id)) return true;
                    if (role === 'mep' && (b.mep_engineer?.user_id === user.id || b.mep_engineer?.user?.id === user.id)) return true;
                    if (role === 'pm' && b.pm?.user_id === user.id) return true;
                    if (role === 'arsitek' && b.arsitek?.user_id === user.id) return true;
                    if (role === 'kontraktor' && b.kontraktor?.user_id === user.id) return true;
                    if (role === 'interior' && b.interior?.user_id === user.id) return true;
                    if (role === 'notaris' && b.notaris?.user_id === user.id) return true;
                    return false;
                });
                if (found && found.id) return { ...found, bid_type: role };
            }
        } catch (err) {
            console.error("Error finding user invitation:", err);
            return null;
        }
        return null;
    }, [project, user]);

    if (!userInvitation || !project?.id || !userInvitation.id) return null;

    const handleAccept = async () => {
        setIsAccepting(true);
        try {
            await axios.post(`/projects/${project.id}/bids/${userInvitation.id}/accept-invite`, {
                bid_type: userInvitation.bid_type
            });
            showToast('Invitation accepted! You can now propose your fee.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to accept invitation', 'error');
        } finally {
            setIsAccepting(false);
        }
    };

    const handleReject = async () => {
        setIsRejecting(true);
        try {
            await axios.post(`/projects/${project.id}/bids/${userInvitation.id}/reject-invite`, {
                bid_type: userInvitation.bid_type
            });
            showToast('Invitation rejected.', 'success');
            onRefresh();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to reject invitation', 'error');
        } finally {
            setIsRejecting(false);
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 bg-amber-50 rounded-[2rem] border border-amber-200 p-6 md:p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative"
        >
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/10 blur-[80px] rounded-full translate-x-1/2 -translate-y-1/2" />
            
            <div className="flex items-start gap-4 relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0 shadow-inner">
                    <AlertCircle size={24} />
                </div>
                <div>
                    <h3 className="text-lg font-black text-amber-900 tracking-tight">Project Invitation</h3>
                    <p className="text-amber-700/80 text-sm font-medium mt-1">
                        You have been invited to participate in this project. Review the details and submit your proposal if interested.
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto relative z-10">
                <button
                    onClick={handleReject}
                    disabled={isRejecting || isAccepting}
                    className="flex-1 md:flex-none px-6 py-3 rounded-xl bg-white border border-red-100 text-red-600 font-black text-xs uppercase tracking-widest hover:bg-red-50 hover:border-red-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {isRejecting ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                    Decline
                </button>
                <button
                    onClick={handleAccept}
                    disabled={isAccepting || isRejecting}
                    className="flex-1 md:flex-none px-8 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-xs uppercase tracking-widest hover:shadow-lg hover:shadow-amber-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {isAccepting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Accept Invitation
                </button>
            </div>
        </motion.div>
    );
};
