import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import DocsSidebar from '../components/docs/DocsSidebar';
import DocsArticle, { slugify } from '../components/docs/DocsArticle';
import { allDocArticles, DocArticle } from '../constants/docsData';
import { Search, ArrowLeft, Menu } from 'lucide-react';
import { DashboardSidebar } from '../components/Dashboard/DashboardSidebar';
import { DashboardHeader } from '../components/Dashboard/DashboardHeader';

export default function Docs() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [selectedArticle, setSelectedArticle] = useState<DocArticle | undefined>(allDocArticles[0]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeSection, setActiveSection] = useState('');
    const [mobileSidebar, setMobileSidebar] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const articleId = params.get('article') || params.get('id');
        if (articleId) {
            const article = allDocArticles.find(art => art.id === articleId);
            if (article) {
                setSelectedArticle(article);
            }
        }
    }, []);

    const handleSetActiveTab = (tab: string) => {
        navigate(`/dashboard?tab=${tab}`);
    };

    const filteredArticles = allDocArticles.filter(art => {
        const q = searchQuery.toLowerCase();
        return art.title.toLowerCase().includes(q) || art.summary.toLowerCase().includes(q) ||
            art.sections.some(s => s.body?.toLowerCase().includes(q));
    });

    useEffect(() => {
        const handleScroll = () => {
            const ids = selectedArticle?.sections.map(s => s.title ? slugify(s.title) : s.type === 'widget' ? 'interactive-preview' : '').filter(Boolean) || [];
            for (const id of ids) {
                const el = document.getElementById(id);
                if (el && el.getBoundingClientRect().top <= 200) { setActiveSection(id); }
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [selectedArticle]);

    const toc = selectedArticle?.sections.map(s => s.title ? { label: s.title, id: slugify(s.title) } : s.type === 'widget' ? { label: 'Interactive Preview', id: 'interactive-preview' } : null).filter(Boolean) as { label: string, id: string }[] || [];

    const handleSelectArticle = (art: DocArticle) => {
        setSelectedArticle(art);
        setMobileSidebar(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const renderSearchInput = () => (
        <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-400" />
            <input type="text" placeholder="Search guides..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-xl text-[11px] font-bold focus:outline-none focus:border-red-500 transition-all shadow-sm" />
        </div>
    );

    const mainContent = (
        <>
            <button onClick={() => setMobileSidebar(!mobileSidebar)} className="lg:hidden fixed bottom-6 right-6 p-4 bg-neutral-900 text-white rounded-full shadow-lg z-50 hover:bg-neutral-800 transition-all"><Menu className="w-5 h-5" /></button>
            <div className={`lg:flex flex-col gap-4 w-68 shrink-0 ${mobileSidebar ? 'fixed inset-0 z-45 bg-white p-6 pt-24' : 'hidden lg:block'}`}>
                {renderSearchInput()}
                <DocsSidebar selectedArticle={selectedArticle} onSelectArticle={handleSelectArticle} />
            </div>
            <div className="flex-grow max-w-3xl overflow-hidden space-y-6">
                <div className="lg:hidden">{renderSearchInput()}</div>
                {searchQuery ? (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-neutral-100 text-xs font-extrabold text-neutral-500">
                            <span>Search Results ({filteredArticles.length})</span>
                            <button onClick={() => setSearchQuery('')} className="text-red-500 flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Reset</button>
                        </div>
                        <div className="grid gap-3">
                            {filteredArticles.map(art => (
                                <button key={art.id} onClick={() => handleSelectArticle(art)} className="w-full text-left bg-white p-4 rounded-2xl border hover:border-red-200 shadow-sm transition-all animate-fade-in">
                                    <h4 className="font-extrabold text-neutral-800 text-xs">{art.title}</h4>
                                    <p className="text-[10px] text-neutral-400 mt-1">{art.summary}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : <DocsArticle article={selectedArticle} />}
            </div>
            {selectedArticle && toc.length > 0 && !searchQuery && (
                <aside className="w-56 shrink-0 hidden xl:block sticky top-28 h-fit space-y-4">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-neutral-400">On this Page</h4>
                    <nav className="flex flex-col gap-2.5 border-l-2 border-neutral-100 pl-4">
                        {toc.map(item => (
                            <button key={item.id} onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className={`text-left text-[11px] font-bold leading-normal transition-all ${activeSection === item.id ? 'text-red-500 pl-1 border-l-2 border-red-500 -ml-[18px]' : 'text-neutral-400 hover:text-neutral-700'}`}>{item.label}</button>
                        ))}
                    </nav>
                </aside>
            )}
        </>
    );

    if (user) {
        return (
            <div className="min-h-screen bg-neutral-100 flex overflow-hidden font-sans">
                <DashboardSidebar 
                    sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} 
                    activeTab="help" setActiveTab={handleSetActiveTab} 
                />

                <main className="flex-1 flex flex-col h-screen overflow-hidden">
                    <DashboardHeader 
                        activeTab="help" 
                        setActiveTab={handleSetActiveTab}
                        onMenuClick={() => setSidebarOpen(true)} 
                    />

                    <div className="flex-grow overflow-y-auto p-4 sm:p-8 relative">
                        <div className="max-w-7xl mx-auto">
                            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-neutral-100 flex gap-8 relative min-h-[calc(100vh-120px)]">
                                {mainContent}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans flex flex-col">
            <Navbar />
            <main className="flex-grow max-w-7xl mx-auto w-full px-6 pt-24 pb-12 flex gap-8 relative">
                {mainContent}
            </main>
        </div>
    );
}
