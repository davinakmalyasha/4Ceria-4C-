import React, { useState } from 'react';
import { User, HardHat, Store, Truck, ShieldCheck, ChevronDown, BookOpen } from 'lucide-react';
import { docCategories, CategoryGroup, allDocArticles, DocArticle } from '../../constants/docsData';

interface DocsSidebarProps {
    selectedArticle?: DocArticle;
    onSelectArticle: (art: DocArticle) => void;
}

export default function DocsSidebar({ selectedArticle, onSelectArticle }: DocsSidebarProps) {
    const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({
        client: true, // Default open Client docs
        professional: false,
        merchant: false,
        courier: false,
        common: false
    });

    const toggleRole = (role: string) => {
        setExpandedRoles(prev => ({ ...prev, [role]: !prev[role] }));
    };

    const renderIcon = (iconName: string) => {
        const props = { className: 'w-4 h-4 shrink-0 text-red-500' };
        switch (iconName) {
            case 'User': return <User {...props} />;
            case 'HardHat': return <HardHat {...props} />;
            case 'Store': return <Store {...props} />;
            case 'Truck': return <Truck {...props} />;
            case 'ShieldAlert': return <ShieldCheck {...props} />;
            default: return <BookOpen {...props} />;
        }
    };

    return (
        <aside className="w-full lg:w-68 shrink-0 flex flex-col gap-2 p-4 bg-white rounded-3xl border border-neutral-100 shadow-[0_4px_25px_rgba(0,0,0,0.01)] h-fit">
            <div className="flex items-center gap-1.5 px-3 mb-2 pb-2 border-b border-neutral-100">
                <BookOpen className="w-4 h-4 text-red-500" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                    Documentation
                </h3>
            </div>

            <div className="flex flex-col gap-1.5">
                {docCategories.map((cat: CategoryGroup) => {
                    const isOpen = expandedRoles[cat.role];
                    const catArticles = allDocArticles.filter(art => art.role === cat.role);

                    return (
                        <div key={cat.role} className="space-y-1">
                            {/* Accordion Category Header */}
                            <button
                                onClick={() => toggleRole(cat.role)}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-black transition-all ${
                                    selectedArticle?.role === cat.role
                                        ? 'bg-red-50/50 text-neutral-800'
                                        : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
                                }`}
                            >
                                <div className="flex items-center gap-2.5">
                                    {renderIcon(cat.icon)}
                                    <span>{cat.name.split(' ')[0]}</span>
                                </div>
                                <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-red-500' : ''}`} />
                            </button>

                            {/* Nested Accordion Article Links */}
                            {isOpen && (
                                <div className="pl-6 pr-1 py-1 flex flex-col gap-1 border-l-2 border-neutral-100 ml-5 space-y-0.5">
                                    {catArticles.map((art: DocArticle) => {
                                        const isSelected = selectedArticle?.id === art.id;
                                        return (
                                            <button
                                                key={art.id}
                                                onClick={() => onSelectArticle(art)}
                                                className={`w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold leading-snug transition-all ${
                                                    isSelected
                                                        ? 'bg-neutral-900 text-white shadow-sm'
                                                        : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
                                                }`}
                                            >
                                                {art.title}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
