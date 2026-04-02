import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

interface DropdownOption {
    label: string;
    value: string;
}

interface CustomDropdownProps {
    options: DropdownOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    icon?: React.ReactNode;
}

export default function CustomDropdown({ options, value, onChange, placeholder, className, icon }: CustomDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const selectedOption = options.find(opt => opt.value === value) || options[0];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 bg-zinc-50 border transition-all rounded-xl text-sm font-bold ${
                    isOpen 
                    ? 'border-red-600 ring-4 ring-red-600/5 bg-white text-zinc-900' 
                    : 'border-zinc-100 text-zinc-700 hover:bg-white hover:border-zinc-200'
                }`}
            >
                <div className="flex items-center gap-2">
                    {icon && <span className="text-zinc-400">{icon}</span>}
                    <span className="truncate">{selectedOption?.label || placeholder}</span>
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180 text-red-600' : 'text-zinc-400'}`} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="absolute z-[100] top-full left-0 mt-2 w-full bg-white border border-zinc-100 rounded-2xl shadow-2xl shadow-zinc-200/50 overflow-hidden py-2 min-w-[200px]"
                    >
                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                            {options.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(option.value);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-4 py-3 text-sm font-bold transition-colors text-left ${
                                        option.value === value 
                                        ? 'bg-red-50 text-red-600' 
                                        : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                                    }`}
                                >
                                    <span className="truncate">{option.label}</span>
                                    {option.value === value && <Check className="w-4 h-4 shrink-0 shadow-sm" />}
                                </button>
                            ))}
                            {options.length === 0 && (
                                <div className="px-4 py-2 text-sm text-zinc-400">No options found</div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
