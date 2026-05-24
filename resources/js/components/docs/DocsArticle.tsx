import React from 'react';
import { HelpCircle, AlertCircle, Info, Lightbulb } from 'lucide-react';
import { DocArticle } from '../../constants/docsData';
import InteractiveWidgets from './InteractiveWidgets';

interface DocsArticleProps {
    article?: DocArticle;
}

export const slugify = (text: string) => {
    return text.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
};

export default function DocsArticle({ article }: DocsArticleProps) {
    if (!article) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center text-neutral-400 bg-white rounded-3xl border border-neutral-100 p-8 shadow-[0_4px_25px_rgba(0,0,0,0.015)]">
                <HelpCircle className="w-12 h-12 mb-3 text-neutral-300 animate-bounce" />
                <p className="text-sm font-bold">Select a topic from the left sidebar to start learning.</p>
            </div>
        );
    }

    return (
        <article className="bg-white rounded-3xl border border-neutral-100 p-6 sm:p-8 shadow-[0_4px_25px_rgba(0,0,0,0.01)] space-y-6 animate-fade-in flex-grow">
            <div>
                <span className="text-[9px] font-black uppercase text-red-500 tracking-wider">
                    Help Center &gt; {article.role}
                </span>
                <h1 className="text-xl sm:text-2xl font-black text-neutral-800 tracking-tight mt-1 mb-2">
                    {article.title}
                </h1>
                <p className="text-xs sm:text-sm text-neutral-500 leading-relaxed font-semibold">
                    {article.summary}
                </p>
                <div className="h-px bg-neutral-100 mt-4" />
            </div>

            {article.sections.map((sec, idx) => {
                const sectionId = sec.title ? slugify(sec.title) : undefined;
                switch (sec.type) {
                    case 'text':
                        return (
                            <p key={idx} className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                                {sec.body}
                            </p>
                        );
                    case 'list':
                        return (
                            <div key={idx} className="space-y-2" id={sectionId}>
                                {sec.title && (
                                    <h4 className="text-xs sm:text-sm font-black text-neutral-700 tracking-tight">
                                        {sec.title}
                                    </h4>
                                )}
                                <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-neutral-600">
                                    {sec.items?.map((item, itemIdx) => (
                                        <li key={itemIdx} className="leading-relaxed font-semibold">{item}</li>
                                    ))}
                                </ul>
                            </div>
                        );
                    case 'alert':
                        return (
                            <div 
                                key={idx} 
                                className={`p-4 rounded-2xl flex gap-3 text-xs sm:text-sm leading-relaxed border ${
                                    sec.alertType === 'warning' ? 'bg-red-50/50 text-red-700 border-red-100/50' :
                                    sec.alertType === 'tip' ? 'bg-amber-50/50 text-amber-700 border-amber-100/50' :
                                    'bg-sky-50/50 text-sky-700 border-sky-100/50'
                                }`}
                            >
                                {sec.alertType === 'warning' ? <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" /> :
                                 sec.alertType === 'tip' ? <Lightbulb className="w-5 h-5 shrink-0 mt-0.5" /> :
                                 <Info className="w-5 h-5 shrink-0 mt-0.5" />}
                                <span className="font-semibold">{sec.body}</span>
                            </div>
                        );
                    case 'widget':
                        return sec.widgetName ? (
                            <div key={idx} className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100/80 my-4" id="interactive-preview">
                                <p className="text-[9px] text-neutral-400 font-extrabold uppercase tracking-widest text-center mb-1">
                                    Visual Interactive Simulation
                                </p>
                                <InteractiveWidgets name={sec.widgetName} />
                            </div>
                        ) : null;
                    default:
                        return null;
                }
            })}
        </article>
    );
}
