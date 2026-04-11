import React from 'react';
import { ArrowRight, DollarSign, MapPin } from 'lucide-react';
import { PHASE_CONFIG, PhaseKey } from '../../types/phase.types';

interface OverviewProjectCardsProps {
    projects: any[];
    onViewProject?: (project: any) => void;
    onViewAll: () => void;
    formatCurrency: (amount: number) => string;
}

export default function OverviewProjectCards({ projects, onViewProject, onViewAll, formatCurrency }: OverviewProjectCardsProps) {
    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Recent Projects</p>
                <button onClick={onViewAll} className="flex items-center gap-1 text-xs font-bold text-[#FF2D20] hover:underline">
                    View all <ArrowRight size={12} />
                </button>
            </div>
            <div className="space-y-3">
                {projects.map(p => (
                    <button
                        key={p.id}
                        onClick={() => onViewProject?.(p)}
                        className="w-full bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-gray-900 text-sm truncate pr-4">{p.title}</h3>
                            <StatusBadge status={p.status} />
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                                <DollarSign size={11} className="text-emerald-500" />
                                {formatCurrency(p.budget || 0)}
                            </span>
                            <span className="flex items-center gap-1">
                                <MapPin size={11} className="text-red-400" />
                                {p.city || p.lokasi || '-'}
                            </span>
                        </div>
                        {p.needed_phases && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                                {(p.needed_phases as PhaseKey[]).slice(0, 4).map(key => {
                                    const cfg = PHASE_CONFIG[key];
                                    if (!cfg) return null;
                                    return (
                                        <span key={key} className="px-2 py-0.5 rounded-md bg-gray-50 text-[10px] font-semibold text-gray-500">
                                            {cfg.label}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        open: 'bg-blue-50 text-blue-600',
        accepted_arsitek: 'bg-amber-50 text-amber-600',
        accepted_kontraktor: 'bg-emerald-50 text-emerald-600',
        completed: 'bg-gray-100 text-gray-600',
    };
    return (
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${styles[status] || 'bg-gray-50 text-gray-400'}`}>
            {status?.replace(/_/g, ' ')}
        </span>
    );
}
