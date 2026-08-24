import React from 'react';
import { Circle, CheckCircle2, Clock, AlertCircle, PlayCircle } from 'lucide-react';

export type ProjectStatus = 'open' | 'in_progress' | 'completed' | 'cancelled' | 'pending';

interface Props {
    status: ProjectStatus | string;
    size?: 'sm' | 'md' | 'xs';
}

export const StatusBadge: React.FC<Props> = ({ status, size = 'md' }) => {
    const s = status.toLowerCase();
    
    const getConfig = () => {
        switch (s) {
            case 'open':
                return {
                    color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
                    icon: <Circle size={10} className="fill-emerald-500" />,
                    label: 'Accepting Bids'
                };
            case 'in_progress':
                return {
                    color: 'text-zinc-600 bg-zinc-50 border-zinc-100',
                    icon: <PlayCircle size={10} className="fill-zinc-500 animate-pulse" />,
                    label: 'In Progress'
                };
            case 'completed':
                return {
                    color: 'text-zinc-600 bg-zinc-50 border-zinc-100',
                    icon: <CheckCircle2 size={10} />,
                    label: 'Delivered'
                };
            case 'pending':
                return {
                    color: 'text-amber-600 bg-amber-50 border-amber-100',
                    icon: <Clock size={10} />,
                    label: 'Pending'
                };
            default:
                return {
                    color: 'text-gray-500 bg-gray-50 border-gray-100',
                    icon: <AlertCircle size={10} />,
                    label: status
                };
        }
    };

    const config = getConfig();
    
    const sizeClasses = {
        xs: 'px-2 py-0.5 text-[8px] gap-1',
        sm: 'px-2.5 py-1 text-[9px] gap-1.5',
        md: 'px-3 py-1.5 text-[10px] gap-2'
    };

    return (
        <span className={`inline-flex items-center font-black uppercase tracking-widest border rounded-full shadow-sm transition-all hover:scale-105 ${config.color} ${sizeClasses[size]}`}>
            {config.icon}
            {config.label}
        </span>
    );
};
