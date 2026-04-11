import React from 'react';
import { MessageSquare, Activity, FolderOpen } from 'lucide-react';

interface ProjectDetailTabsProps {
    project: any;
    activeTab: 'qa' | 'activity' | 'files';
    onTabChange: (tab: 'qa' | 'activity' | 'files') => void;
}

const TABS = [
    { id: 'qa' as const, label: 'Q&A', icon: MessageSquare },
    { id: 'activity' as const, label: 'Activity', icon: Activity },
    { id: 'files' as const, label: 'Files', icon: FolderOpen },
];

export default function ProjectDetailTabs({ project, activeTab, onTabChange }: ProjectDetailTabsProps) {
    const comments = project?.comments || [];
    const activities = project?.activity_logs || [];
    const documents = project?.documents || [];

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-100">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-bold transition-all ${
                                isActive ? 'text-[#FF2D20] border-b-2 border-[#FF2D20] bg-red-50/50' : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            <Icon size={14} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div className="p-5 min-h-[180px]">
                {activeTab === 'qa' && (
                    <div className="space-y-3">
                        {comments.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-6">No discussions yet. Start a conversation about this project.</p>
                        ) : comments.map((c: any) => (
                            <div key={c.id} className="flex gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-xs font-bold text-gray-500">
                                    {c.user?.name?.charAt(0) || '?'}
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-gray-700">{c.user?.name}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{c.content}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'activity' && (
                    <div className="space-y-3">
                        {activities.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-6">No activity recorded yet.</p>
                        ) : activities.slice(0, 10).map((a: any) => (
                            <div key={a.id} className="flex items-center gap-3 text-xs">
                                <div className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                                <span className="text-gray-600">{a.description}</span>
                                <span className="text-gray-300 ml-auto flex-shrink-0">{new Date(a.created_at).toLocaleDateString('id-ID')}</span>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'files' && (
                    <div className="space-y-2">
                        {documents.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-6">No files uploaded yet.</p>
                        ) : documents.map((d: any) => (
                            <a key={d.id} href={`/storage/${d.file_path}`} target="_blank" rel="noreferrer"
                                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                            >
                                <FolderOpen size={14} className="text-gray-400" />
                                <span className="text-xs font-semibold text-gray-700 truncate">{d.file_name}</span>
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
