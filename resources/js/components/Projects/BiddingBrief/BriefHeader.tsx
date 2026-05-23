import React from 'react';
import { ArrowLeft, DollarSign, MapPin, Calendar } from 'lucide-react';

interface BriefHeaderProps {
    project: any;
    onBack: () => void;
}

export const BriefHeader: React.FC<BriefHeaderProps> = ({ project, onBack }) => {
    const formattedBudget = Number(project?.budget || 0).toLocaleString('id-ID');
    const deadlineDate = project?.deadline 
        ? new Date(project.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'ASAP';

    return (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-gray-100">
            <div className="flex items-start gap-4">
                <button 
                    onClick={onBack} 
                    className="mt-1 p-2.5 rounded-xl hover:bg-gray-50 border border-gray-100 text-gray-400 hover:text-gray-600 transition-all active:scale-95 shadow-sm bg-white"
                >
                    <ArrowLeft size={18} />
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight truncate">{project?.title}</h1>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                        <span className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
                            <DollarSign size={13} className="text-emerald-500" />
                            Target Budget: <span className="text-emerald-600 font-bold">Rp {formattedBudget}</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
                            <MapPin size={13} className="text-red-400" />
                            {project?.city || project?.lokasi || 'Unknown'}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
                            <Calendar size={13} className="text-blue-400" />
                            {deadlineDate}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
