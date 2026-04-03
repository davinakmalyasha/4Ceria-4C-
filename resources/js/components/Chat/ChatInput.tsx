import React, { useState, useRef } from 'react';
import { Send, Image as ImageIcon, X } from 'lucide-react';

interface ChatInputProps {
    onSend: (content: string, image?: File | null) => void;
    placeholder?: string;
    isDisabled?: boolean;
}

export default function ChatInput({ onSend, placeholder = "Type a message...", isDisabled }: ChatInputProps) {
    const [content, setContent] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSend = (e?: React.FormEvent) => {
        e?.preventDefault();
        if ((!content.trim() && !image) || isDisabled) return;
        
        onSend(content.trim(), image);
        setContent('');
        setImage(null);
        setPreview(null);
        
        // Reset height
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImage(file);
            setPreview(URL.createObjectURL(file));
        }
    };

    const removeImage = () => {
        setImage(null);
        setPreview(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setContent(e.target.value);
        
        // Auto-expand
        const target = e.target;
        target.style.height = 'auto';
        target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
    };

    return (
        <div className="bg-white border-t border-gray-100 flex flex-col shrink-0">
            {/* Image Preview Overlay */}
            {preview && (
                <div className="p-4 flex gap-4 overflow-x-auto bg-gray-50/50">
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-red-100 group shadow-lg">
                        <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                        <button 
                            onClick={removeImage}
                            className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full hover:bg-red-500 transition-colors"
                        >
                            <X size={12} />
                        </button>
                    </div>
                </div>
            )}

            <form onSubmit={handleSend} className="p-4 flex items-end gap-2">
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleImageChange}
                />
                
                <div className="flex items-center gap-1 mb-1">
                    <button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()}
                        className={`p-2 rounded-full transition-all ${preview ? 'bg-red-50 text-red-500 shadow-sm' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                    >
                        <ImageIcon size={20} />
                    </button>
                </div>
                
                <div className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl flex items-end p-1 shadow-sm focus-within:ring-2 focus-within:ring-red-100 focus-within:bg-white transition-all">
                    <textarea 
                        ref={inputRef}
                        rows={1}
                        value={content}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        placeholder={preview ? "Add a caption..." : placeholder}
                        className="flex-1 bg-transparent border-none focus:ring-0 py-2 px-3 text-[13.5px] resize-none max-h-[120px] scrollbar-thin"
                    />
                </div>
                
                <button 
                    type="submit" 
                    disabled={(!content.trim() && !image) || isDisabled}
                    className="p-3 bg-red-500 text-white rounded-2xl hover:bg-red-600 active:scale-95 transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:scale-100 shadow-lg shadow-red-500/20 mb-0.5"
                >
                    <Send size={18} />
                </button>
            </form>
        </div>
    );
}
