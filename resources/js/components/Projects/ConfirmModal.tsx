import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, AlertTriangle, CheckCircle, X } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: (inputValue?: string) => void;
    onCancel: () => void;
    isLoading?: boolean;
    variant?: 'info' | 'success' | 'danger' | 'warning';
    showInput?: boolean;
    inputPlaceholder?: string;
}

const VARIANT_MAP = {
    success: {
        icon: <CheckCircle className="w-8 h-8 text-emerald-600" />,
        iconBg: 'bg-emerald-50 border-emerald-50/50',
        confirmBtn: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
    },
    danger: {
        icon: <X className="w-8 h-8 text-red-600" />,
        iconBg: 'bg-red-50 border-red-50/50',
        confirmBtn: 'bg-red-600 hover:bg-red-700 shadow-red-500/20'
    },
    warning: {
        icon: <AlertTriangle className="w-8 h-8 text-amber-600" />,
        iconBg: 'bg-amber-50 border-amber-50/50',
        confirmBtn: 'bg-amber-600 hover:bg-emerald-750 shadow-amber-500/20'
    },
    info: {
        icon: <HelpCircle className="w-8 h-8 text-slate-600" />,
        iconBg: 'bg-slate-50 border-slate-50/50',
        confirmBtn: 'bg-zinc-900 hover:bg-zinc-800 shadow-slate-500/20'
    }
};

export default function ConfirmModal({
    isOpen,
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    onConfirm,
    onCancel,
    isLoading = false,
    variant = 'info',
    showInput = false,
    inputPlaceholder = 'Specify details here...'
    }: ConfirmModalProps) {
    const [inputValue, setInputValue] = React.useState('');
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    React.useEffect(() => {
        if (isOpen) {
            setInputValue('');
        }
    }, [isOpen]);

    const styles = VARIANT_MAP[variant];

    const handleConfirm = () => {
        if (showInput) {
            if (!inputValue.trim()) return;
            onConfirm(inputValue);
        } else {
            onConfirm();
        }
    };

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={onCancel} />
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col"
                    >
                        <div className="p-6 text-center">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border-8 ${styles.iconBg}`}>
                                {styles.icon}
                            </div>
                            <h2 className="text-xl font-black text-gray-900 mb-2">{title}</h2>
                            <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
                            
                            {showInput && (
                                <textarea
                                    required
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder={inputPlaceholder}
                                    className="w-full min-h-[90px] p-3 mt-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all resize-none text-left"
                                />
                            )}
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
                            <button 
                                type="button" 
                                onClick={onCancel} 
                                disabled={isLoading} 
                                className="flex-1 px-4 py-2.5 text-sm font-bold text-gray-750 hover:text-gray-950 bg-white border border-gray-200 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-50"
                            >
                                {cancelText}
                            </button>
                            <button 
                                type="button" 
                                onClick={handleConfirm} 
                                disabled={isLoading || (showInput && !inputValue.trim())} 
                                className={`flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 ${styles.confirmBtn}`}
                            >
                                {isLoading && <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin"></span>}
                                {isLoading ? 'Processing...' : confirmText}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
