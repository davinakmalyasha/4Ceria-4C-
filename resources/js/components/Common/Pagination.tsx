import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
    currentPage: number;
    lastPage: number;
    total: number;
    from: number;
    to: number;
    onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
    currentPage,
    lastPage,
    total,
    from,
    to,
    onPageChange,
}) => {
    if (total === 0 || lastPage <= 1) return null;

    return (
        <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-between flex-wrap gap-4">
            <p className="text-[11px] text-neutral-400 font-semibold">
                Showing <span className="font-extrabold text-neutral-700">{from}</span> to <span className="font-extrabold text-neutral-700">{to}</span> of <span className="font-extrabold text-neutral-700">{total}</span> records
            </p>

            <div className="flex items-center space-x-1.5">
                <button
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(currentPage - 1)}
                    className="p-1.5 border border-neutral-200 rounded-xl bg-white hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-white text-neutral-500 hover:text-neutral-900 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                    <ChevronLeft size={14} />
                </button>

                {Array.from({ length: lastPage }, (_, idx) => {
                    const pageNum = idx + 1;
                    // Render page number button only if it's near the current page
                    if (
                        pageNum === 1 ||
                        pageNum === lastPage ||
                        (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                    ) {
                        return (
                            <button
                                key={pageNum}
                                onClick={() => onPageChange(pageNum)}
                                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border ${
                                    currentPage === pageNum
                                        ? 'bg-neutral-950 border-neutral-950 text-white shadow-sm'
                                        : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900'
                                }`}
                            >
                                {pageNum}
                            </button>
                        );
                    }
                    if (pageNum === 2 || pageNum === lastPage - 1) {
                        return (
                            <span key={pageNum} className="text-neutral-300 text-xs px-1 select-none font-bold">
                                ...
                            </span>
                        );
                    }
                    return null;
                })}

                <button
                    disabled={currentPage === lastPage}
                    onClick={() => onPageChange(currentPage + 1)}
                    className="p-1.5 border border-neutral-200 rounded-xl bg-white hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-white text-neutral-500 hover:text-neutral-900 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
};
