import React from 'react';
import { Clock, DollarSign, FileText } from 'lucide-react';
import { PhaseKey } from '../../../types/phase.types';

interface PhaseBidsListProps {
    bids: any[];
    phaseKey: PhaseKey;
    projectId: number;
    onRefresh: () => void;
}

export default function PhaseBidsList({ bids, phaseKey, projectId, onRefresh }: PhaseBidsListProps) {
    return (
        <div className="space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                {bids.length} Proposal{bids.length > 1 ? 's' : ''} Received
            </p>
            {bids.map((bid: any) => (
                <div key={bid.id} className="bg-white border border-gray-100 rounded-2xl p-4 hover:border-red-200 hover:shadow-md transition-all group">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-sm font-black text-gray-500">
                                {(bid.arsitek?.nama || bid.notaris?.nama || bid.kontraktor?.nama || bid.interior?.nama || 'P').charAt(0)}
                            </div>
                            <div>
                                <p className="font-bold text-gray-900 text-sm">
                                    {bid.arsitek?.nama || bid.notaris?.nama || bid.kontraktor?.nama || bid.interior?.nama || 'Professional'}
                                </p>
                                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                                    <span className="flex items-center gap-1">
                                        <DollarSign size={11} /> Rp {Number(bid.price).toLocaleString('id-ID')}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock size={11} /> {bid.estimated_duration || '-'} {bid.duration_unit || ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-colors opacity-0 group-hover:opacity-100">
                            Review
                        </button>
                    </div>
                    {bid.proposal && (
                        <p className="mt-3 pl-13 text-xs text-gray-400 line-clamp-2">{bid.proposal}</p>
                    )}
                </div>
            ))}
        </div>
    );
}
