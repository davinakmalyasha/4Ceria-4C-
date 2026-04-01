import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, X, Trash2 } from 'lucide-react';

interface Props {
    title: string;
    description: string;
    onConfirm: () => void;
    onCancel: () => void;
    isDeleting: boolean;
}

export default function ConfirmDeleteModal({ title, description, onConfirm, onCancel, isDeleting }: Props) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col"
            >
                <div className="p-6 text-center">
                    <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border-8 border-red-50/50">
                        <AlertTriangle size={28} />
                    </div>
                    
                    <h2 className="text-xl font-black text-gray-900 mb-2">Delete Project?</h2>
                    <p className="text-sm text-gray-500">
                        Are you sure you want to delete <span className="font-bold text-gray-800">"{title}"</span>? {description}
                    </p>
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
                    <button 
                        type="button" 
                        onClick={onCancel} 
                        disabled={isDeleting} 
                        className="flex-1 px-4 py-2.5 text-sm font-bold text-gray-700 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button 
                        type="button" 
                        onClick={onConfirm} 
                        disabled={isDeleting} 
                        className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-md shadow-red-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isDeleting ? (
                            <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin"></span>
                        ) : (
                            <Trash2 size={16} />
                        )}
                        {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
