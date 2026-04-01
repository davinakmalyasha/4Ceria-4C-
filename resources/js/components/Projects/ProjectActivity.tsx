import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Project } from '../../types/project.types';
import { 
    Clock, CheckCircle2, MessageCircle, FileUp, 
    Trash2, Star, ArrowRightLeft, PlusCircle, Loader2 
} from 'lucide-react';

interface ActivityEntry {
    id: number;
    action: string;
    details: string;
    created_at: string;
    user?: { id: number; name: string };
}

const ACTION_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
    project_created:    { icon: PlusCircle,      color: 'text-emerald-600', bg: 'bg-emerald-100' },
    status_changed:     { icon: ArrowRightLeft,  color: 'text-blue-600',    bg: 'bg-blue-100' },
    bid_accepted:       { icon: CheckCircle2,    color: 'text-green-600',   bg: 'bg-green-100' },
    milestone_added:    { icon: PlusCircle,      color: 'text-violet-600',  bg: 'bg-violet-100' },
    milestone_completed:{ icon: CheckCircle2,     color: 'text-emerald-600', bg: 'bg-emerald-100' },
    milestone_reopened: { icon: ArrowRightLeft,  color: 'text-amber-600',   bg: 'bg-amber-100' },
    milestone_deleted:  { icon: Trash2,          color: 'text-red-600',     bg: 'bg-red-100' },
    comment_posted:     { icon: MessageCircle,   color: 'text-sky-600',     bg: 'bg-sky-100' },
    document_uploaded:  { icon: FileUp,          color: 'text-indigo-600',  bg: 'bg-indigo-100' },
    document_deleted:   { icon: Trash2,          color: 'text-red-600',     bg: 'bg-red-100' },
    rating_given:       { icon: Star,            color: 'text-amber-600',   bg: 'bg-amber-100' },
};

interface Props {
    project: Project;
}

export default function ProjectActivity({ project }: Props) {
    const [logs, setLogs] = useState<ActivityEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            try {
                const res = await axios.get(`/projects/${project.id}/activity`);
                setLogs(res.data.data);
            } catch (err) {
                console.error('Failed to load activity logs');
            } finally {
                setIsLoading(false);
            }
        };
        fetch();
    }, [project.id]);

    const getConfig = (action: string) => {
        return ACTION_CONFIG[action] || { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100' };
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="text-center py-12">
                <Clock className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">No activity recorded yet.</p>
                <p className="text-gray-300 text-sm mt-1">Events will appear here as the project progresses.</p>
            </div>
        );
    }

    return (
        <div className="relative">
            {/* Vertical Line */}
            <div className="absolute left-5 top-3 bottom-3 w-0.5 bg-gray-200" />

            <div className="space-y-1">
                {logs.map((log, idx) => {
                    const cfg = getConfig(log.action);
                    const Icon = cfg.icon;
                    const date = new Date(log.created_at);

                    return (
                        <div key={log.id} className="relative flex items-start gap-4 py-3 pl-1 group">
                            {/* Icon Circle */}
                            <div className={`relative z-10 w-10 h-10 rounded-full ${cfg.bg} flex items-center justify-center shrink-0 border-2 border-white shadow-sm`}>
                                <Icon className={`w-4.5 h-4.5 ${cfg.color}`} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 pt-1">
                                <p className="text-sm text-gray-800 font-semibold leading-snug">
                                    {log.details}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[11px] text-gray-400 font-medium">
                                        {log.user?.name || 'System'}
                                    </span>
                                    <span className="text-gray-300">•</span>
                                    <span className="text-[11px] text-gray-400">
                                        {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
