import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
    images?: { dir: string }[];
    altText: string;
    className?: string;
    hoverScale?: boolean;
}

export default function AutoHoverSlider({ images, altText, className = "absolute inset-0 w-full h-full object-cover", hoverScale = true }: Props) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        if (!isHovered || !images || images.length <= 1) return;
        const interval = setInterval(() => setCurrentIndex((p) => (p + 1) % images.length), 3000);
        return () => clearInterval(interval);
    }, [isHovered, images]);

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!images) return;
        setCurrentIndex((prev) => (prev + 1) % images.length);
    };

    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!images) return;
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    const handleDotClick = (e: React.MouseEvent, index: number) => {
        e.stopPropagation();
        setCurrentIndex(index);
    };

    if (!images || images.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gradient-to-br from-gray-50 to-gray-200">
                <Home size={32} className="mb-2 opacity-50" />
                <span className="text-[10px] font-bold tracking-widest uppercase">No Image</span>
            </div>
        );
    }

    return (
        <div className="w-full h-full relative group/slider" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => { setIsHovered(false); setCurrentIndex(0); }}>
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.img 
                    key={currentIndex} 
                    src={`/storage/${images[currentIndex].dir}`} 
                    alt={`${altText} ${currentIndex + 1}`}
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }} 
                    transition={{ duration: 0.6 }}
                    className={`${className} ${hoverScale ? 'group-hover:scale-110' : ''} transition-transform duration-700 ease-out`} 
                />
            </AnimatePresence>

            {images.length > 1 && (
                <>
                    {/* Navigation Buttons */}
                    <div className="absolute inset-0 flex items-center justify-between px-2 opacity-0 group-hover/slider:opacity-100 transition-opacity z-20">
                        <button 
                            type="button"
                            onClick={handlePrev}
                            className="p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm transition-all hover:scale-110 active:scale-90"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button 
                            type="button"
                            onClick={handleNext}
                            className="p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm transition-all hover:scale-110 active:scale-90"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    {/* Dots indicator */}
                    <div className="absolute bottom-[70px] left-0 right-0 flex justify-center gap-1.5 z-20">
                        {images.map((_, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={(e) => handleDotClick(e, idx)}
                                className={`h-1.5 rounded-full bg-white transition-all duration-300 shadow-[0_1px_3px_rgb(0,0,0,0.5)] cursor-pointer pointer-events-auto shrink-0 ${idx === currentIndex ? 'w-4 opacity-100' : 'w-1.5 opacity-50 hover:opacity-80'}`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
