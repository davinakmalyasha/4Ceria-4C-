import React from 'react';
import { FolderOpen, Download, FileText, ChevronRight, Search } from 'lucide-react';
import { motion } from 'framer-motion';

interface ProjectFilesProps {
    project: any;
}

export default function ProjectFiles({ project }: ProjectFilesProps) {
    const documents = project?.documents || [];

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Project Documents</h2>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">Repository of all uploaded files</p>
                </div>
                
                <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <Search size={14} className="text-gray-400 group-focus-within:text-red-500 transition-colors" />
                    </div>
                    <input 
                        type="text" 
                        placeholder="Search files..." 
                        className="bg-white border border-gray-100 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-bold focus:ring-2 focus:ring-red-500/10 focus:border-red-500 outline-none w-full md:w-64 transition-all shadow-sm"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {documents.length === 0 ? (
                    <div className="col-span-full bg-gray-50/50 rounded-[2.5rem] p-16 text-center border border-dashed border-gray-200">
                        <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-6 text-gray-200">
                            <FolderOpen size={40} />
                        </div>
                        <p className="text-gray-500 font-bold text-sm">No documents found.</p>
                        <p className="text-gray-400 text-xs mt-1">Files uploaded in project phases will appear here.</p>
                    </div>
                ) : (
                    documents.map((doc: any, idx: number) => (
                        <motion.a
                            key={doc.id}
                            href={doc.file_url || `/storage/${doc.file_path}`}
                            target="_blank"
                            rel="noreferrer"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.05 }}
                            className="group bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-gray-200/50 transition-all hover:-translate-y-1 flex items-start gap-4"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center shrink-0 group-hover:bg-red-500 group-hover:text-white transition-colors">
                                <FileText size={24} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-black text-gray-900 truncate pr-4">{doc.file_name}</h4>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                    Added {new Date(doc.created_at).toLocaleDateString('id-ID')}
                                </p>
                            </div>
                            <div className="mt-1 text-gray-300 group-hover:text-red-500 transition-colors">
                                <Download size={16} />
                            </div>
                        </motion.a>
                    ))
                )}
            </div>
        </div>
    );
}
