import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageCircle, Link2, CheckCircle2, Copy } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface PaymentTriggerNotificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    termin: any;
    milestone?: any;
    project: any;
}

export default function PaymentTriggerNotificationModal({ 
    isOpen, 
    onClose, 
    termin, 
    milestone, 
    project 
}: PaymentTriggerNotificationModalProps) {
    const { showToast } = useToast();

    if (!isOpen || !termin) return null;

    // Generate the direct payment link
    const appUrl = window.location.origin;
    const paymentLink = `${appUrl}/projects/${project.id}?tab=payments&highlight=${termin.id}`;
    
    // Generate the message template
    const messageTemplate = `Halo, progress untuk tahap *${milestone?.title || termin.label}* pada proyek ${project.title} telah disetujui.

Silakan lakukan pembayaran untuk *${termin.label}* sebesar *Rp ${Number(termin.amount).toLocaleString('id-ID')}*.

Klik link berikut untuk melihat detail dan melakukan pembayaran:
${paymentLink}

Terima kasih.`;

    const handleWhatsApp = () => {
        // We need the owner's phone number. If not available, we use a generic wa.me link that prompts for number.
        const phone = project.owner?.phone || project.user?.phone || '';
        let cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '62' + cleanPhone.substring(1);
        }
        
        const encodedMessage = encodeURIComponent(messageTemplate);
        const waUrl = cleanPhone 
            ? `https://wa.me/${cleanPhone}?text=${encodedMessage}`
            : `https://wa.me/?text=${encodedMessage}`;
            
        window.open(waUrl, '_blank');
        onClose();
    };

    const handleInternalChat = () => {
        // MVP: Copy to clipboard and instruct user
        navigator.clipboard.writeText(messageTemplate);
        showToast('Pesan disalin! Silakan paste di Internal Chat.', 'success');
        // If we have a dedicated route for messages, we can redirect.
        // window.location.href = `/projects/${project.id}?tab=messages`;
        onClose();
    };

    const copyLink = () => {
        navigator.clipboard.writeText(paymentLink);
        showToast('Link pembayaran disalin', 'success');
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white rounded-[2rem] p-8 max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden relative"
                    >
                        {/* Header */}
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center">
                                    <CheckCircle2 size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Payment Unlocked</h3>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Notify Project Owner</p>
                                </div>
                            </div>
                            <button 
                                onClick={onClose}
                                className="p-2 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-xl transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content Overview */}
                        <div className="bg-slate-50 rounded-2xl p-5 mb-6 border border-slate-100">
                            <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Termin to Pay</p>
                                    <p className="text-sm font-black text-slate-900">{termin.label}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Amount</p>
                                    <p className="text-lg font-black text-emerald-600">Rp {Number(termin.amount).toLocaleString('id-ID')}</p>
                                </div>
                            </div>
                            
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                                    <span>Direct Payment Link</span>
                                    <button onClick={copyLink} className="text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded">
                                        <Copy size={10} /> Copy
                                    </button>
                                </p>
                                <div className="bg-white px-3 py-2 rounded-xl text-xs text-slate-600 truncate border border-slate-200 font-mono">
                                    {paymentLink}
                                </div>
                            </div>
                        </div>

                        {/* Message Preview */}
                        <div className="mb-8">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Message Preview</p>
                            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 text-xs text-slate-700 whitespace-pre-wrap font-medium leading-relaxed">
                                {messageTemplate}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={handleWhatsApp}
                                className="w-full py-4 bg-[#25D366] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#128C7E] transition-all shadow-lg shadow-green-200 flex items-center justify-center gap-2"
                            >
                                <MessageCircle size={16} /> Send via WhatsApp
                            </button>
                            
                            <button 
                                onClick={handleInternalChat}
                                className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                <Send size={16} /> Copy & Send Internal Chat
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
