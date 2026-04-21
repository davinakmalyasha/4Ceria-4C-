import React, { useState } from 'react';
import axios from 'axios';
import { FileText, Upload, Trash2, Calendar, ClipboardCheck, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

interface PMReportsProps {
    project: any;
    user: any;
    onRefresh: () => void;
}

export default function PMReports({ project, user, onRefresh }: PMReportsProps) {
    const [isUploading, setIsUploading] = useState(false);
    const reports = (project.documents || []).filter((d: any) => d.category === 'weekly_report');
    const isPM = project.pm_id === user?.id;

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', 'weekly_report');
        formData.append('status', 'uploaded');

        try {
            await axios.post(`/projects/${project.id}/documents`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            onRefresh();
        } catch (error) {
            console.error('Upload failed:', error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (docId: number) => {
        if (!confirm('Are you sure you want to remove this report?')) return;

        try {
            await axios.delete(`/projects/${project.id}/documents/${docId}`);
            onRefresh();
        } catch (error) {
            console.error('Delete failed:', error);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Executive Reports</h2>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">Weekly Progress & Milestone Updates</p>
                </div>
                
                {isPM && (
                    <label className={`
                        flex items-center gap-2 px-6 py-3 rounded-2xl cursor-pointer transition-all active:scale-95
                        ${isUploading ? 'bg-gray-100 text-gray-400' : 'bg-gray-900 text-white hover:bg-black shadow-lg shadow-gray-200'}
                    `}>
                        <Upload size={18} />
                        <span className="text-xs font-black uppercase tracking-widest">Submit Weekly Report</span>
                        <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} accept=".pdf,.doc,.docx" />
                    </label>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-4">
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest px-1">Report History</h3>
                    
                    {reports.length === 0 ? (
                        <div className="bg-gray-50/50 rounded-[2.5rem] p-16 text-center border border-dashed border-gray-200">
                            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4 text-gray-300">
                                <FileText size={32} />
                            </div>
                            <p className="text-gray-500 font-bold text-sm">No reports submitted yet.</p>
                            <p className="text-gray-400 text-xs mt-1">Detailed weekly updates help keep the project on track and the owner informed.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {reports.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((doc: any, idx: number) => (
                                <div 
                                    key={doc.id}
                                    className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between group hover:border-gray-200 transition-all"
                                >
                                    <div className="flex items-center gap-5">
                                        <div className="relative">
                                            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400">
                                                <FileText size={24} />
                                            </div>
                                            {idx === 0 && (
                                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white" />
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black text-gray-900">{doc.file_name}</h4>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="flex items-center gap-1 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                                    <Calendar size={10} />
                                                    {new Date(doc.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                                <span className="w-1 h-1 bg-gray-200 rounded-full" />
                                                <span className="text-[10px] text-emerald-600 font-black uppercase tracking-tighter">Verified</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <a 
                                            href={`/storage/${doc.file_path}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="px-4 py-2 bg-gray-50 text-gray-900 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-all shadow-sm"
                                        >
                                            View Report
                                        </a>
                                        {isPM && (
                                            <button 
                                                onClick={() => handleDelete(doc.id)}
                                                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="bg-emerald-600 rounded-[2.5rem] p-8 text-white shadow-xl shadow-emerald-100">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-white/20 rounded-xl">
                                <TrendingUp size={20} />
                            </div>
                            <h4 className="text-xs font-black uppercase tracking-widest">Report Health</h4>
                        </div>
                        
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="opacity-80">Consistency</span>
                                <span className="font-black">{reports.length > 0 ? '100%' : '0%'}</span>
                            </div>
                            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: reports.length > 0 ? '100%' : '0%' }}
                                    className="h-full bg-white"
                                />
                            </div>
                            <p className="text-[10px] opacity-60 mt-4 leading-relaxed font-medium">
                                Regular reporting ensures project transparency and professional accountability.
                            </p>
                        </div>
                    </div>

                    <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 text-blue-500 rounded-xl">
                                <ClipboardCheck size={20} />
                            </div>
                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Requirements</h4>
                        </div>
                        
                        <ul className="space-y-4">
                            {[
                                'Current Phase Progress',
                                'Budget Utilization',
                                'Site Photos & Logs',
                                'Upcoming Milestones'
                            ].map((item, i) => (
                                <li key={i} className="flex items-start gap-3">
                                    <div className="mt-1 w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0" />
                                    <span className="text-xs font-medium text-gray-600">{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
