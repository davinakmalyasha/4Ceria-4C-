'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Menu, Search } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { allDocArticles, type DocArticle } from '@/content/constants/docsData';
import { DocsArticle, slugify } from './DocsArticle';
import { DocsSidebar } from './DocsSidebar';

/**
 * The Help Centre — a port of `resources/js/pages/Docs.tsx`.
 *
 * THE SELECTION MOVED INTO THE URL. The legacy keeps the selected article in
 * `useState`, seeded from `?article=` once on mount and never written back, so
 * a reader can never link to what they are reading and the back button leaves
 * the page. Here `?article=` is the state: the sidebar navigates with a link,
 * the URL is shareable, and the browser's history works.
 *
 * The search box stays local — it is a filter over a list already in memory,
 * not a navigable location.
 *
 * The article body is rendered by `DocsArticle`, which is a CLIENT component
 * here only because this shell is: the prose is static, and the chart of the
 * page belongs to the widgets inside it, which are interactive by nature.
 */
export function HelpShell({ articleId, authed }: { articleId?: string; authed: boolean }) {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeSection, setActiveSection] = useState('');
    const [mobileSidebar, setMobileSidebar] = useState(false);

    const selectedArticle: DocArticle | undefined =
        (articleId && allDocArticles.find((art) => art.id === articleId)) || allDocArticles[0];

    const filteredArticles = useMemo(() => {
        const q = searchQuery.toLowerCase();

        return allDocArticles.filter(
            (art) =>
                art.title.toLowerCase().includes(q)
                || art.summary.toLowerCase().includes(q)
                || art.sections.some((s) => s.body?.toLowerCase().includes(q)),
        );
    }, [searchQuery]);

    const toc = useMemo(
        () =>
            (selectedArticle?.sections
                .map((s) =>
                    s.title
                        ? { label: s.title, id: slugify(s.title) }
                        : s.type === 'widget'
                            ? { label: 'Interactive Preview', id: 'interactive-preview' }
                            : null,
                )
                .filter(Boolean) as { label: string; id: string }[]) ?? [],
        [selectedArticle],
    );

    // The "On this page" highlight. It is a scroll spy and nothing else.
    useEffect(() => {
        const handleScroll = () => {
            const ids = toc.map((item) => item.id);

            for (const id of ids) {
                const el = document.getElementById(id);

                if (el && el.getBoundingClientRect().top <= 200) {
                    setActiveSection(id);
                }
            }
        };

        window.addEventListener('scroll', handleScroll);

        return () => window.removeEventListener('scroll', handleScroll);
    }, [toc]);

    const selectArticle = (art: DocArticle) => {
        setMobileSidebar(false);
        router.push(`/help?article=${art.id}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const searchInput = (
        <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-400" />
            <input
                type="text"
                placeholder="Search guides..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-xl text-[11px] font-bold focus:outline-none focus:border-red-500 transition-all shadow-sm"
            />
        </div>
    );

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans flex flex-col">
            <Navbar authed={authed} />

            <main className="grow max-w-7xl mx-auto w-full px-6 pt-24 pb-12 flex gap-8 relative">
                <button
                    type="button"
                    onClick={() => setMobileSidebar(!mobileSidebar)}
                    className="lg:hidden fixed bottom-6 right-6 p-4 bg-neutral-900 text-white rounded-full shadow-lg z-50 hover:bg-neutral-800 transition-all"
                >
                    <Menu className="w-5 h-5" />
                </button>

                <div className={`lg:flex flex-col gap-4 w-68 shrink-0 ${mobileSidebar ? 'fixed inset-0 z-45 bg-white p-6 pt-24' : 'hidden lg:block'}`}>
                    {searchInput}
                    <DocsSidebar selectedArticle={selectedArticle} onSelectArticle={selectArticle} />
                </div>

                <div className="grow max-w-3xl overflow-hidden space-y-6">
                    <div className="lg:hidden">{searchInput}</div>

                    {searchQuery ? (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-neutral-100 text-xs font-extrabold text-neutral-500">
                                <span>Search Results ({filteredArticles.length})</span>
                                <button type="button" onClick={() => setSearchQuery('')} className="text-red-500 flex items-center gap-1">
                                    <ArrowLeft className="w-3.5 h-3.5" /> Reset
                                </button>
                            </div>
                            <div className="grid gap-3">
                                {filteredArticles.map((art) => (
                                    <button
                                        type="button"
                                        key={art.id}
                                        onClick={() => selectArticle(art)}
                                        className="w-full text-left bg-white p-4 rounded-2xl border hover:border-red-200 shadow-sm transition-all animate-fade-in"
                                    >
                                        <h4 className="font-extrabold text-neutral-800 text-xs">{art.title}</h4>
                                        <p className="text-[10px] text-neutral-400 mt-1">{art.summary}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <DocsArticle article={selectedArticle} />
                    )}
                </div>

                {selectedArticle && toc.length > 0 && !searchQuery && (
                    <aside className="w-56 shrink-0 hidden xl:block sticky top-28 h-fit space-y-4">
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-neutral-400">On this Page</h4>
                        <nav className="flex flex-col gap-2.5 border-l-2 border-neutral-100 pl-4">
                            {toc.map((item) => (
                                <button
                                    type="button"
                                    key={item.id}
                                    onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                                    className={`text-left text-[11px] font-bold leading-normal transition-all ${
                                        activeSection === item.id
                                            ? 'text-red-500 pl-1 border-l-2 border-red-500 ml-[-18px]'
                                            : 'text-neutral-400 hover:text-neutral-700'
                                    }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </nav>
                    </aside>
                )}
            </main>
        </div>
    );
}
