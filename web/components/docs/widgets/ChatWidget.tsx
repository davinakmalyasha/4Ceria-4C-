import React, { useState } from 'react';
import { MessageSquare, Send, User } from 'lucide-react';

interface Message { id: number; text: string; mine: boolean }
interface Contact { name: string; role: string; unread: number }

const contacts: Contact[] = [
    { name: 'Budi Santoso', role: 'Contractor', unread: 2 },
    { name: 'Siti Rahayu', role: 'Architect', unread: 0 },
    { name: 'Ahmad Yani', role: 'Inspector', unread: 1 },
];

const initialMessages: Message[] = [
    { id: 1, text: 'Foundation work is 80% done.', mine: false },
    { id: 2, text: 'Great! Send photos when ready.', mine: true },
    { id: 3, text: 'Will do, uploading now...', mine: false },
];

export default function ChatWidget() {
    const [active, setActive] = useState<number>(0);
    const [msgs, setMsgs] = useState<Message[]>(initialMessages);
    const [input, setInput] = useState<string>('');

    const handleSend = () => {
        const text = input.trim() || 'Looks good, proceed! 👍';
        setMsgs(prev => [...prev, { id: prev.length + 1, text, mine: true }]);
        setInput('');
    };

    return (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-md mx-auto my-4 overflow-hidden transition-all hover:shadow-md">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-100">
                <MessageSquare className="w-4 h-4 text-red-500" />
                <h4 className="font-extrabold text-neutral-800 text-sm">Project Chat</h4>
            </div>
            <div className="flex h-56">
                <div className="w-28 border-r border-neutral-100 overflow-y-auto shrink-0">
                    {contacts.map((c, i) => (
                        <button key={c.name} onClick={() => setActive(i)}
                            className={`w-full px-2.5 py-2 text-left transition-all ${active === i ? 'bg-red-50' : 'hover:bg-neutral-50'}`}>
                            <div className="flex items-center gap-1.5">
                                <User className={`w-3.5 h-3.5 ${active === i ? 'text-red-500' : 'text-neutral-400'}`} />
                                <span className="text-[10px] font-bold text-neutral-800 truncate">{c.name.split(' ')[0]}</span>
                            </div>
                            <span className="text-[9px] text-neutral-400">{c.role}</span>
                            {c.unread > 0 && (
                                <span className="ml-1 text-[9px] bg-red-500 text-white font-bold px-1.5 rounded-full">{c.unread}</span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="flex-1 flex flex-col">
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {msgs.map(m => (
                            <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[75%] px-2.5 py-1.5 rounded-xl text-[11px] font-medium ${
                                    m.mine ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'
                                }`}>{m.text}</div>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5 p-2 border-t border-neutral-100">
                        <input value={input} onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                            placeholder="Type a message..."
                            className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-neutral-50 border border-neutral-200 outline-none focus:border-red-300 transition-all" />
                        <button onClick={handleSend}
                            className="p-1.5 bg-red-500 hover:bg-red-600 rounded-lg transition-all">
                            <Send className="w-3.5 h-3.5 text-white" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
