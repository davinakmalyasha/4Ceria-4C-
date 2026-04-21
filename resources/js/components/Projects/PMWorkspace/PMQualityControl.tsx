import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ShieldCheck, Upload, FileText, Trash2, CheckCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PMQualityControlProps {
    project: any;
    user: any;
    onRefresh: () => void;
}

export default function PMQualityControl({ project, user, onRefresh }: PMQualityControlProps) {
    const [isUploading, setIsUploading] = useState(false);
    const documents = (project.documents || []).filter((d: any) => d.category === 'qa_report');
    const isPM = project.pm_id === user?.id;

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', 'qa_report');
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
        if (!confirm('Are you sure you want to remove this QA report?')) return;

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
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Quality Assurance & Control</h2>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">Site Inspections & Standards Verification</p>
                </div>
                
                {isPM && (
                    <label className={`
                        flex items-center gap-2 px-6 py-3 rounded-2xl cursor-pointer transition-all active:scale-95
                        ${isUploading ? 'bg-gray-100 text-gray-400' : 'bg-gray-900 text-white hover:bg-black shadow-lg shadow-gray-200'}
                    `}>
                        <Upload size={18} />
                        <span className="text-xs font-black uppercase tracking-widest">Upload QA Report</span>
                        <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
                    </label>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-4">
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest px-1">Recent Reports</h3>
                    
                    {documents.length === 0 ? (
                        <div className="bg-gray-50/50 rounded-[2.5rem] p-16 text-center border border-dashed border-gray-200">
                            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4 text-gray-300">
                                <ShieldCheck size={32} />
                            </div>
                            <p className="text-gray-500 font-bold text-sm">No QA reports filed yet.</p>
                            <p className="text-gray-400 text-xs mt-1">PM must upload inspection results to satisfy bid requirements.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {documents.map((doc: any) => (
                                <div 
                                    key={doc.id}
                                    className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between group hover:border-gray-200 transition-all"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400">
                                            <FileText size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900 truncate max-w-[200px] md:max-w-xs">{doc.file_name}</h4>
                                            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">
                                                {new Date(doc.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <a 
                                            href={`/storage/${doc.file_path}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
                                        >
                                            <Upload size={18} className="rotate-180" />
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
                    <div className="bg-gray-900 rounded-[2.5rem] p-8 text-white">
                        <h4 className="text-xs font-black uppercase tracking-widest opacity-50 mb-4">Inspection Status</h4>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium opacity-80">Reports Filed</span>
                                <span className="text-xl font-black">{documents.length}</span>
                            </div>
                            <div className="pt-4 border-t border-white/10 flex items-center gap-3">
                                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                                    <CheckCircle size={16} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-tighter">Active Oversight</p>
                                    <p className="text-[9px] opacity-60">Meeting Standards</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                        <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-4">Next Inspection</h4>
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center">
                                <Clock size={18} />
                            </div>
                            <div>
                                <p className="text-xs font-black text-gray-900">Weekly Site Walkthrough</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Every Monday</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
