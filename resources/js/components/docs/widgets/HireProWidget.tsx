import React, { useState } from 'react';
import { Star, MessageSquare, Briefcase, Send, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function HireProWidget() {
    const [chatOpen, setChatOpen] = useState(false);
    const [hired, setHired] = useState(false);
    const [messages, setMessages] = useState<{ sender: 'client' | 'pro'; text: string }[]>([
        { sender: 'client', text: 'Halo Pak Budi, saya tertarik dengan portfolio desain Anda.' }
    ]);
    const [inputText, setInputText] = useState('');

    const handleSendMessage = () => {
        if (inputText.trim()) {
            const newMsgs = [...messages, { sender: 'client', text: inputText.trim() }];
            setMessages(newMsgs);
            setInputText('');
            
            // Auto response simulation
            setTimeout(() => {
                setMessages(m => [...m, { sender: 'pro', text: 'Tentu! Ada waktu untuk discuss brief project Anda?' }]);
            }, 1200);
        }
    };

    return (
        <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto my-3 relative overflow-hidden transition-all hover:shadow-md">
            {/* Professional Card Header */}
            <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center font-black text-red-500 text-xs shrink-0">
                    BS
                </div>
                <div className="flex-grow">
                    <h4 className="font-extrabold text-neutral-800 text-xs">Budi Santoso, S.Ars</h4>
                    <p className="text-[9px] text-neutral-400 font-bold">Principal Architect • Jakarta</p>
                </div>
                <div className="flex items-center gap-0.5 bg-amber-50 text-amber-500 px-2 py-0.5 rounded-full text-[9px] font-black shrink-0">
                    <Star className="w-3 h-3 fill-amber-400" /> 4.9
                </div>
            </div>

            <p className="text-[10px] text-neutral-500 mt-3 leading-relaxed">
                Spesialisasi arsitektur tropis modern dan blueprint perizinan IMB / PBG. Rate: <span className="font-bold text-neutral-800">Rp 120.000 / m²</span>.
            </p>

            {/* Chat Drawer simulation */}
            <AnimatePresence>
                {chatOpen && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-4 border-t border-neutral-100 pt-3 space-y-2 bg-neutral-50 p-2.5 rounded-xl border"
                    >
                        <p className="text-[8px] font-extrabold uppercase text-neutral-400 tracking-wider">Live Chat Simulation</p>
                        <div className="max-h-[100px] overflow-y-auto space-y-1.5 scrollbar-none pr-1">
                            {messages.map((m, idx) => (
                                <div key={idx} className={`flex ${m.sender === 'client' ? 'justify-end' : 'justify-start'}`}>
                                    <span className={`px-2.5 py-1 rounded-xl text-[10px] max-w-[85%] font-semibold leading-snug ${
                                        m.sender === 'client' ? 'bg-red-500 text-white' : 'bg-white text-neutral-700 border'
                                    }`}>
                                        {m.text}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-1.5 mt-2">
                            <input 
                                type="text" 
                                placeholder="Tulis pesan..." 
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                className="flex-grow px-2 py-1 bg-white border border-neutral-200 rounded-lg text-[10px] font-bold focus:outline-none"
                            />
                            <button onClick={handleSendMessage} className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600"><Send className="w-3 h-3" /></button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Actions Panel */}
            {!hired ? (
                <div className="flex gap-2 mt-4 pt-3 border-t border-neutral-100">
                    <button 
                        onClick={() => setChatOpen(!chatOpen)}
                        className={`flex-grow py-2 border rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1 transition-all ${
                            chatOpen ? 'bg-neutral-100 border-neutral-300 text-neutral-700' : 'bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-500'
                        }`}
                    >
                        <MessageSquare className="w-3 h-3" /> Chat Builder
                    </button>
                    <button 
                        onClick={() => setHired(true)}
                        className="flex-grow py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1 transition-all"
                    >
                        <Briefcase className="w-3 h-3" /> Hire Professional
                    </button>
                </div>
            ) : (
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="p-2.5 mt-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center gap-2 text-emerald-700 text-[10px] font-extrabold"
                >
                    <Check className="w-4.5 h-4.5" /> Project Offer Sent to Budi!
                </motion.div>
            )}
        </div>
    );
}
