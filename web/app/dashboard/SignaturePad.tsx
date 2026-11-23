'use client';

import { useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

/**
 * A small signature canvas. The data URL is written into a hidden input named
 * `signature` so the surrounding form can post it with the rest of the fields.
 */
export function SignaturePad({ name = 'signature' }: { name?: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const [value, setValue] = useState('');

    const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: ((event.clientX - rect.left) / rect.width) * canvas.width,
            y: ((event.clientY - rect.top) / rect.height) * canvas.height,
        };
    };

    const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;
        drawing.current = true;
        canvas.setPointerCapture(event.pointerId);
        const point = position(event);
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineWidth = 2.4;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.strokeStyle = '#0f172a';
    };

    const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawing.current) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;
        const point = position(event);
        context.lineTo(point.x, point.y);
        context.stroke();
    };

    const end = () => {
        if (!drawing.current) return;
        drawing.current = false;
        const canvas = canvasRef.current;
        if (canvas) setValue(canvas.toDataURL('image/png'));
    };

    const clear = () => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        setValue('');
    };

    return (
        <div>
            <input type="hidden" name={name} value={value} />
            <div className="relative overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-white">
                <canvas
                    ref={canvasRef}
                    width={600}
                    height={180}
                    onPointerDown={start}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerLeave={end}
                    className="h-32 w-full touch-none cursor-crosshair"
                    aria-label="Draw your signature"
                />
                {!value && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-neutral-300">
                        Sign here
                    </span>
                )}
            </div>
            <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-neutral-400">
                    {value ? 'Signature captured' : 'Use a finger, stylus or mouse'}
                </span>
                <button
                    type="button"
                    onClick={clear}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-neutral-500 hover:bg-neutral-100"
                >
                    <Eraser className="h-3 w-3" /> Clear
                </button>
            </div>
        </div>
    );
}
