import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Paperclip, MoreVertical, Minus } from 'lucide-react';

interface ChatWidgetProps {
    professional: any; // The recipient
    onClose: () => void;
}

interface Message {
    id: number;
    text: string;
    sender: 'user' | 'system';
    time: string;
}

export default function ChatWidget({ professional, onClose }: ChatWidgetProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isMinimized, setIsMinimized] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const name = professional?.nama_perusahaan || professional?.nama || 'Professional';
    const initialGreeting = `Halo ${name}, saya tertarik untuk mendiskusikan penawaran proyek. Apakah Anda memiliki waktu luang?`;

    useEffect(() => {
        // Pre-fill the input box when opening a new chat
        setInputValue(initialGreeting);
    }, [name, initialGreeting]);

    useEffect(() => {
        // Scroll to bottom on new message
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        const newMsg: Message = { id: Date.now(), text: inputValue, sender: 'user', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        setMessages(prev => [...prev, newMsg]);
        setInputValue('');

        // Simulate reply
        setTimeout(() => {
            setMessages(prev => [...prev, {
                id: Date.now(),
                text: "Halo! Terima kasih telah menghubungi saya. Tentu, mari kita diskusikan proyek Anda. Apa detail utamanya?",
                sender: 'system',
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]);
        }, 1500);
    };

    if (isMinimized) {
        return (
            <motion.button 
                initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => setIsMinimized(false)}
                className="fixed bottom-6 right-6 z-[60] bg-gray-900 text-white rounded-full px-6 py-4 shadow-2xl flex items-center gap-3 font-bold hover:-translate-y-1 transition-transform"
            >
                <div className="w-8 h-8 bg-[#FF2D20] rounded-full flex items-center justify-center shrink-0 border-2 border-white overflow-hidden text-sm">
                    {professional?.user?.pic ? <img src={`/storage/${professional.user.pic}`} className="w-full h-full object-cover" /> : name.charAt(0)}
                </div>
                Message {name}
            </motion.button>
        );
    }

    return (
        <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[60] w-[380px] h-[550px] max-h-[85vh] bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-gray-200 flex flex-col overflow-hidden"
        >
            {/* Header */}
            <div className="bg-gray-900 text-white p-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#FF2D20] text-white rounded-full flex items-center justify-center font-bold relative border border-white/10 overflow-hidden">
                        {professional?.user?.pic ? <img src={`/storage/${professional.user.pic}`} className="w-full h-full object-cover" /> : name.charAt(0)}
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900"></div>
                    </div>
                    <div>
                        <h4 className="font-bold text-sm leading-none line-clamp-1">{name}</h4>
                        <span className="text-[10px] text-gray-400">Biasanya membalas dalam 1 jam</span>
                    </div>
                </div>
                <div className="flex items-center gap-1 text-gray-400">
                    <button className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"><MoreVertical size={16} /></button>
                    <button onClick={() => setIsMinimized(true)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"><Minus size={16} /></button>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/10 hover:text-red-400 rounded-lg transition-colors"><X size={16} /></button>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 bg-gray-50/50 p-4 overflow-y-auto space-y-4">
                <div className="text-center">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{new Date().toLocaleDateString('id-ID', { weekday: 'long', month: 'long', day: 'numeric'})}</p>
                </div>
                
                {messages.length === 0 && (
                    <div className="my-8 text-center text-sm text-gray-400">
                        Kirim pesan untuk memulai diskusi dengan profesional ini.
                    </div>
                )}

                {messages.map(msg => (
                    <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${msg.sender === 'user' ? 'bg-[#FF2D20] text-white rounded-br-none' : 'bg-gray-200 text-gray-900 rounded-bl-none'}`}>
                            {msg.text}
                        </div>
                        <span className="text-[10px] text-gray-400 mt-1 mx-1">{msg.time}</span>
                    </div>
                ))}
                
                {/* Typing Indicator if waiting for reply */}
                {messages.length > 0 && messages[messages.length - 1].sender === 'user' && (
                    <div className="flex items-center gap-1 text-gray-400 bg-gray-200 w-fit px-3 py-2 rounded-2xl rounded-bl-none">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */ }
            <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex items-end gap-2 shrink-0">
                <button type="button" className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full mb-0.5"><Paperclip size={18} /></button>
                <textarea 
                    value={inputValue} 
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                    placeholder="Tulis pesan..."
                    rows={1}
                    className="flex-1 bg-gray-100 border-none rounded-2xl px-4 py-2.5 outline-none text-sm resize-none overflow-y-auto max-h-32 mb-0.5 focus:ring-2 focus:ring-[#FF2D20]/20"
                />
                <button type="submit" disabled={!inputValue.trim()} className="p-2.5 bg-[#FF2D20] disabled:bg-red-200 text-white rounded-full mb-0.5 hover:bg-red-700 transition-colors shadow-sm disabled:shadow-none">
                    <Send size={16} className={inputValue.trim() ? "ml-0.5" : ""} />
                </button>
            </form>
        </motion.div>
    );
}
