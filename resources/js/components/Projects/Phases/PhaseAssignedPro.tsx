import React from 'react';
import { Star, MessageCircle, ExternalLink } from 'lucide-react';
import { PhaseKey } from '../../../types/phase.types';

interface PhaseAssignedProProps {
    project: any;
    phaseKey: PhaseKey;
    config: { selectedKey: string; profileKey: string };
}

export default function PhaseAssignedPro({ project, phaseKey, config }: PhaseAssignedProProps) {
    const pro = project?.[config.profileKey];
    if (!pro) return null;

    const name = pro?.nama || pro?.name || 'Professional';
    const rating = pro?.average_rating || 0;

    return (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center overflow-hidden">
                    {pro?.foto ? (
                        <img src={`/storage/${pro.foto}`} alt={name} className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-lg font-black text-gray-500">{name.charAt(0)}</span>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <Star size={12} className="text-amber-400 fill-amber-400" />
                        <span className="text-xs text-gray-500 font-medium">{rating}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button className="p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors" title="Chat">
                        <MessageCircle size={16} />
                    </button>
                    <button className="p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors" title="Profile">
                        <ExternalLink size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
