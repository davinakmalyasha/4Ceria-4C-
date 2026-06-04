import React from 'react';
import { X, DollarSign, History } from 'lucide-react';
import { Bid, Project } from '../../../types/project.types';
import { NegotiationOfferForm } from './NegotiationOfferForm';
import { NegotiationOfferDTO } from '../../../types/negotiation.types';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';
import { ErrorBoundary } from '../../Common/ErrorBoundary';

interface ProposeFeeModalProps {
    bid: Bid;
    project: Project;
    projectId: number;
    proType: string;
    onClose: () => void;
    onSuccess: () => void;
}

export const ProposeFeeModal: React.FC<ProposeFeeModalProps> = ({
    bid,
    project,
    projectId,
    proType,
    onClose,
    onSuccess
}) => {
    const { showToast } = useToast();

    if (!bid || !project) {
        return null;
    }

    const handleSubmit = async (offer: NegotiationOfferDTO) => {
        try {
            await axios.post(`/projects/${projectId}/propose-fee`, {
                bid_id: bid.id,
                bid_type: proType,
                ...offer
            });
            showToast('Proposal sent successfully', 'success');
            onSuccess();
            onClose();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to send proposal', 'error');
        }
    };

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] shadow-2xl">
                <ErrorBoundary name="ProposeFeeModalContent">
                    <div className="p-8">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-slate-900 text-white rounded-2xl">
                                    <DollarSign size={24} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                                        {Number(bid.price || 0) > 0 ? 'Counter Offer' : 'Commercial Offer'}
                                    </h3>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
                                        Negotiating with Client
                                    </p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                <X size={24} className="text-slate-400" />
                            </button>
                        </div>

                        {/* Recent History */}
                        {Array.isArray(bid.negotiation_logs) && bid.negotiation_logs.length > 0 && (
                            <div className="mb-8 p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                <div className="flex items-center gap-2 mb-4 text-slate-400">
                                    <History size={14} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Recent Activity</span>
                                </div>
                                <div className="space-y-3">
                                    {bid.negotiation_logs.slice(0, 2).map((log: any, i: number) => (
                                        <div key={i} className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
                                            <div>
                                                <p className="text-[10px] font-black text-slate-900">{log.user_name || 'System'}</p>
                                                <p className="text-[10px] text-slate-500 font-medium">{log.note}</p>
                                            </div>
                                            <span className="text-[10px] font-black text-slate-900 whitespace-nowrap">
                                                Rp {Number(log.price || 0).toLocaleString('id-ID')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <NegotiationOfferForm 
                            bid={bid}
                            project={project || bid.project}
                            proType={proType}
                            onSubmit={handleSubmit}
                            onCancel={onClose}
                        />
                    </div>
                </ErrorBoundary>
            </div>
        </div>
    );
};
