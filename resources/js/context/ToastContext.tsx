import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, message, type }]);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
                <AnimatePresence>
                    {toasts.map(toast => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            className="pointer-events-auto"
                        >
                            <div className={`
                                flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border backdrop-blur-md
                                ${toast.type === 'success' ? 'bg-emerald-50/90 border-emerald-100 text-emerald-800' : 
                                  toast.type === 'error' ? 'bg-red-50/90 border-red-100 text-red-800' : 
                                  'bg-zinc-900/90 border-zinc-800 text-white'}
                            `}>
                                {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                                {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                                {toast.type === 'info' && <Info className="w-5 h-5 text-blue-400" />}
                                
                                <span className="text-[13.5px] font-bold tracking-tight">{toast.message}</span>
                                
                                <button 
                                    onClick={() => removeToast(toast.id)}
                                    className="ml-2 p-1 hover:bg-white/20 rounded-lg transition-colors"
                                >
                                    <X className="w-4 h-4 opacity-50" />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context;
};
