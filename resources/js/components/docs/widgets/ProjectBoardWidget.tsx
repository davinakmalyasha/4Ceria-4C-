import React, { useState } from 'react';
import { LayoutGrid, ArrowRight } from 'lucide-react';

interface Card { id: number; title: string; budget: string }

const columns = ['Open', 'In Progress', 'Completed'] as const;
const colColors = ['bg-neutral-100', 'bg-amber-50', 'bg-emerald-50'] as const;
const dotColors = ['bg-neutral-400', 'bg-amber-400', 'bg-emerald-400'] as const;

const initialCards: Card[] = [
    { id: 1, title: 'Villa Renovation', budget: 'Rp 85M' },
    { id: 2, title: 'Office Fitout', budget: 'Rp 42M' },
    { id: 3, title: 'Roof Repair', budget: 'Rp 15M' },
    { id: 4, title: 'Kitchen Remodel', budget: 'Rp 28M' },
    { id: 5, title: 'Garden Landscape', budget: 'Rp 12M' },
];

export default function ProjectBoardWidget() {
    const [board, setBoard] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 });

    const moveNext = (cardId: number) => {
        setBoard(prev => {
            const col = prev[cardId];
            if (col >= 2) return prev;
            return { ...prev, [cardId]: col + 1 };
        });
    };

    const getCards = (colIdx: number): Card[] =>
        initialCards.filter(c => board[c.id] === colIdx);

    return (
        <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-md mx-auto my-4 transition-all hover:shadow-md">
            <div className="flex items-center gap-2 mb-3">
                <LayoutGrid className="w-4 h-4 text-red-500" />
                <h4 className="font-extrabold text-neutral-800 text-sm">Project Board</h4>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {columns.map((col, ci) => (
                    <div key={col} className={`${colColors[ci]} rounded-xl p-2 min-h-[120px]`}>
                        <div className="flex items-center gap-1.5 mb-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${dotColors[ci]}`} />
                            <span className="text-[10px] font-extrabold text-neutral-700">{col}</span>
                            <span className="text-[9px] bg-white/70 text-neutral-500 font-bold px-1.5 rounded-full ml-auto">
                                {getCards(ci).length}
                            </span>
                        </div>
                        <div className="space-y-1.5">
                            {getCards(ci).map(card => (
                                <div key={card.id}
                                    className="bg-white rounded-lg p-2 border border-neutral-200/60 shadow-sm group hover:shadow transition-all">
                                    <p className="text-[10px] font-bold text-neutral-800 leading-tight">{card.title}</p>
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-[9px] text-emerald-600 font-semibold">{card.budget}</span>
                                        {ci < 2 && (
                                            <button onClick={() => moveNext(card.id)}
                                                className="opacity-0 group-hover:opacity-100 p-0.5 bg-neutral-900 rounded transition-all"
                                                title={`Move to ${columns[ci + 1]}`}>
                                                <ArrowRight className="w-2.5 h-2.5 text-white" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
