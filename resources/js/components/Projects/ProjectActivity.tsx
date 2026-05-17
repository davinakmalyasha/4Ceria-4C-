import React from 'react';
import { Activity, Clock, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface ProjectActivityProps {
    project: any;
}

export default function ProjectActivity({ project }: ProjectActivityProps) {
    const activities = project?.activity_logs || [];

    return (
        <div className="max-w-3xl mx-auto space-y-8 pb-12">
            <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Activity Timeline</h2>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">Full History of Project Events</p>
            </div>

            <div className="relative">
                {/* Timeline Line */}
                <div className="absolute left-[23px] top-4 bottom-4 w-0.5 bg-gray-100" />

                <div className="space-y-8">
                    {activities.length === 0 ? (
                        <div className="bg-gray-50/50 rounded-[2.5rem] p-12 text-center border border-dashed border-gray-200 ml-12">
                            <p className="text-gray-500 font-bold text-sm">No activity recorded yet.</p>
                        </div>
                    ) : (
                        activities.map((activity: any, idx: number) => (
                            <motion.div
                                key={activity.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="relative flex gap-8 group"
                            >
                                {/* Timeline Dot */}
                                <div className="relative z-10 w-12 h-12 rounded-2xl bg-white border-4 border-gray-50 shadow-sm flex items-center justify-center text-gray-400 group-hover:border-red-50 group-hover:text-red-500 transition-all">
                                    <Activity size={18} />
                                </div>

                                <div className="flex-1 pt-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-1.5">
                                            <Clock size={10} />
                                            {formatDate(activity.created_at)}
                                        </span>
                                    </div>
                                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                        <p className="text-sm font-bold text-gray-800 leading-relaxed">
                                            {activity.description}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
