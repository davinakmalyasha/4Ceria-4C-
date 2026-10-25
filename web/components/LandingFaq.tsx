'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * The FAQ accordion — the one piece of the landing page that is interactive.
 *
 * The legacy version wraps the answer in framer-motion's `AnimatePresence` and
 * animates height. Here the open answer is plain markup with the same classes,
 * because the visual contract compares SETTLED screens and an entry animation
 * is not part of the design. The rotation of the chevron IS part of it and is
 * reproduced exactly.
 */
export function LandingFaq({ faqs }: { faqs: { q: string; a: string }[] }) {
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    return (
        <div className="space-y-4">
            {faqs.map((faq, index) => {
                const isOpen = openFaq === index;

                return (
                    <div
                        key={index}
                        className="border border-neutral-200/80 rounded-2xl overflow-hidden bg-neutral-50/50 hover:bg-neutral-50 transition-colors"
                    >
                        <button
                            type="button"
                            onClick={() => setOpenFaq(isOpen ? null : index)}
                            className="w-full px-6 py-5 text-left flex justify-between items-center gap-4 focus:outline-none"
                        >
                            <span className="font-bold text-neutral-800 text-sm sm:text-base">{faq.q}</span>
                            <ChevronDown
                                className={`w-5 h-5 text-neutral-400 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-[#FD1D1D]' : ''}`}
                            />
                        </button>

                        {isOpen && (
                            <div className="px-6 pb-5 pt-0 border-t border-neutral-100 text-neutral-500 text-sm leading-relaxed">
                                {faq.a}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
