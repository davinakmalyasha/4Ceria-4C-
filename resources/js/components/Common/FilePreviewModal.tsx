import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Download } from 'lucide-react';

interface FilePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    filePath: string | null;
    fileName: string;
}

export default function FilePreviewModal({ isOpen, onClose, filePath, fileName }: FilePreviewModalProps) {
    if (!filePath) return null;

    const getFullUrl = (path: string) => {
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/storage/') || path.startsWith('data:')) {
            return path;
        }
        return `/storage/${path}`;
    };

    const fullUrl = getFullUrl(filePath);
    const ext = filePath.split('.').pop()?.toLowerCase();
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'].includes(ext || '');
    const isPdf = ext === 'pdf';

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
                    {/* Backdrop */}
                    <div className="absolute inset-0 cursor-pointer" onClick={onClose} />
                    
                    {/* Modal Content */}
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                        className="relative bg-white rounded-[2.5rem] w-full max-w-5xl h-[85vh] shadow-2xl border border-slate-200/50 flex flex-col overflow-hidden"
                    >
                        {/* Modal Header */}
                        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 backdrop-blur-sm relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                                    <FileText size={18} />
                                </div>
                                <div className="text-left">
                                    <h4 className="text-sm font-black text-slate-900 truncate max-w-[300px] sm:max-w-[450px]">
                                        {fileName}
                                    </h4>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Document Viewer</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <a 
                                    href={fullUrl} 
                                    download 
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5"
                                >
                                    <Download size={14} /> Download File
                                </a>
                                <button 
                                    onClick={onClose} 
                                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-xl transition-all cursor-pointer"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                        
                        {/* Modal Body / Viewer */}
                        <div className="flex-1 bg-slate-100 flex items-center justify-center p-6 relative overflow-hidden">
                            {isImage ? (
                                <div className="w-full h-full flex items-center justify-center overflow-auto">
                                    <img 
                                        src={fullUrl} 
                                        alt={fileName} 
                                        className="max-h-full max-w-full object-contain rounded-xl shadow-lg border border-slate-250 bg-white" 
                                    />
                                </div>
                            ) : isPdf ? (
                                <iframe 
                                    src={fullUrl} 
                                    title={fileName}
                                    className="w-full h-full border-none rounded-xl bg-white shadow-lg"
                                />
                            ) : (
                                <div className="text-center space-y-4 max-w-sm p-8 bg-white rounded-[2rem] border border-slate-200 shadow-xl animate-in zoom-in-95 duration-200">
                                    <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                                        <FileText size={32} />
                                    </div>
                                    <div className="space-y-1">
                                        <h5 className="text-sm font-black text-slate-900">Preview Not Available</h5>
                                        <p className="text-[11px] font-medium text-slate-500 leading-relaxed">
                                            This file type ({ext?.toUpperCase() || 'UNKNOWN'}) cannot be rendered directly in the browser.
                                        </p>
                                    </div>
                                    <a 
                                        href={fullUrl} 
                                        download 
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full py-3 bg-zinc-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        <Download size={14} /> Download Document
                                    </a>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
