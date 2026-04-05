import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Building, MapPin, Star, ShoppingBag, 
    ChevronLeft, Search, Filter, Loader2, ArrowRight,
    CheckCircle, MessageSquare, Package, User, Image as ImageIcon
} from 'lucide-react';
import MaterialCard from './MaterialCard';

interface StoreDetailViewProps {
    storeId: number;
    onBack: () => void;
    onOpenChat: (profOrId: any) => void;
    onOpenDetails: (material: any) => void;
}

export default function StoreDetailView({ storeId, onBack, onOpenChat, onOpenDetails }: StoreDetailViewProps) {
    const [store, setStore] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');

    // Reviews infinite scroll + filter state
    const [reviews, setReviews] = useState<any[]>([]);
    const [reviewPage, setReviewPage] = useState(1);
    const [hasMoreReviews, setHasMoreReviews] = useState(true);
    const [isLoadingReviews, setIsLoadingReviews] = useState(false);
    const [reviewRating, setReviewRating] = useState<number | null>(null);
    const [reviewHasImages, setReviewHasImages] = useState(false);
    const [reviewSort, setReviewSort] = useState<'latest' | 'rating_high' | 'rating_low'>('latest');
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const fetchStore = async () => {
            setIsLoading(true);
            try {
                const res = await axios.get(`/marketplace/suppliers/${storeId}`);
                setStore(res.data.data);
            } catch (err) {
                console.error('Failed to fetch store detail', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStore();
    }, [storeId]);

    // Fetch reviews page
    const fetchReviews = useCallback(async (page: number, currentRating: number | null, currentHasImages: boolean, currentSort: string) => {
        if (isLoadingReviews || (!hasMoreReviews && page !== 1)) return;
        setIsLoadingReviews(true);
        try {
            const params: any = { page };
            if (currentRating) params.rating = currentRating;
            if (currentHasImages) params.has_images = 'true';
            if (currentSort) params.sort = currentSort;

            const res = await axios.get(`/suppliers/${storeId}/reviews`, { params });
            const data = res.data.data;
            const newItems = data.data || [];
            
            setReviews(prev => page === 1 ? newItems : [...prev, ...newItems]);
            setHasMoreReviews(data.current_page < data.last_page);
            setReviewPage(page);
        } catch (err) {
            console.error('Failed to fetch reviews', err);
        } finally {
            setIsLoadingReviews(false);
        }
    }, [storeId, isLoadingReviews, hasMoreReviews]);

    // Initial reviews load + reset on filter change
    useEffect(() => {
        if (store) {
            setReviews([]);
            setReviewPage(1);
            setHasMoreReviews(true);
            fetchReviews(1, reviewRating, reviewHasImages, reviewSort);
        }
    }, [store, reviewRating, reviewHasImages, reviewSort]);

    // IntersectionObserver for infinite scroll
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMoreReviews && !isLoadingReviews) {
                    fetchReviews(reviewPage + 1, reviewRating, reviewHasImages, reviewSort);
                }
            },
            { threshold: 1 }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMoreReviews, isLoadingReviews, reviewPage, reviewRating, reviewHasImages, reviewSort, fetchReviews]);

    if (isLoading) {
        return (
            <div className="w-full h-96 flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-12 h-12 text-red-500 animate-spin" />
                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs animate-pulse">Syncing Storefront...</p>
            </div>
        );
    }

    if (!store) return null;

    const materials = store.materials || [];
    const rating = parseFloat(store.reviews_avg_rating) || 0;
    const reviewCount = store.reviews_count || 0;

    const filteredMaterials = materials.filter((m: any) => {
        const matchesCategory = activeCategory === 'All' || m.category === activeCategory;
        const matchesSearch = m.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             m.description?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const storeCategories = ['All', ...new Set(materials.map((m: any) => m.category))] as string[];

    return (
        <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -20 }}
            className="w-full space-y-8 pb-20"
        >
            {/* Header / Navigation */}
            <div className="flex items-center justify-between">
                <button 
                    onClick={onBack}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 text-gray-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm active:scale-95"
                >
                    <ChevronLeft size={16} />
                    Back to Marketplace
                </button>
                
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => onOpenChat(store.user)}
                        className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-100 text-gray-900 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm active:scale-95 group"
                    >
                        <MessageSquare size={16} className="text-red-500" />
                        Chat Supplier
                    </button>
                </div>
            </div>

            {/* Store Profile Card */}
            <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm overflow-hidden p-8 md:p-12 relative">
                <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
                    <Building size={200} />
                </div>

                <div className="flex flex-col md:flex-row gap-10 items-center md:items-start relative z-10">
                    <div className="w-32 h-32 rounded-[2.5rem] bg-gray-900 text-white flex items-center justify-center text-4xl font-black shadow-2xl shadow-gray-900/20">
                        {store.store_name?.charAt(0) || "S"}
                    </div>
                    
                    <div className="flex-1 text-center md:text-left space-y-4">
                        <div>
                            <div className="flex items-center justify-center md:justify-start gap-4 mb-2">
                                <h2 className="text-4xl font-black text-gray-900 tracking-tight">{store.store_name}</h2>
                                <CheckCircle size={24} className="text-blue-500 shrink-0" />
                            </div>
                            <div className="flex flex-wrap justify-center md:justify-start gap-3 items-center text-sm font-bold text-gray-400">
                                <div className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-500 rounded-full text-[10px] uppercase tracking-widest border border-red-100">
                                    <ShoppingBag size={12} />
                                    Verified Supplier
                                </div>
                                <span>•</span>
                                <div className="flex items-center gap-1">
                                    <MapPin size={14} className="text-gray-400" />
                                    {store.address || "Main Distribution Center"}
                                </div>
                            </div>
                        </div>

                        <p className="text-gray-500 max-w-2xl font-medium leading-relaxed italic">
                            {store.bio || "Premium construction materials distribution partner providing high-quality building supplies to verified projects across the region."}
                        </p>

                        <div className="flex flex-wrap justify-center md:justify-start gap-8 pt-4">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Average Rating</span>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1">
                                        {[1, 2, 3, 4, 5].map((s) => (
                                            <Star key={s} size={16} className={`${s <= Math.round(rating) ? 'text-amber-500 fill-amber-500' : 'text-gray-200'}`} />
                                        ))}
                                    </div>
                                    <span className="text-lg font-black text-gray-900">{rating > 0 ? rating.toFixed(1) : "N/A"}</span>
                                    <span className="text-xs text-gray-400 font-bold">({reviewCount} reviews)</span>
                                </div>
                            </div>
                            
                            <div className="w-px h-10 bg-gray-100 hidden md:block" />

                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Inventory</span>
                                <div className="flex items-center gap-2 text-lg font-black text-gray-900">
                                    <Package size={20} className="text-blue-500" />
                                    {materials.length} Items Listed
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Product Catalog Section */}
            <div className="space-y-8 pt-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <h3 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                        <ShoppingBag size={24} className="text-red-500" />
                        Store Catalog
                    </h3>

                    <div className="relative group max-w-md w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-red-500 transition-colors" size={20} />
                        <input 
                            type="text" 
                            placeholder="Search within this store..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-100 rounded-[1.5rem] focus:ring-4 focus:ring-red-500/5 focus:border-red-500/50 outline-none transition-all shadow-sm"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Category List */}
                    <div className="lg:col-span-1">
                        <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm sticky top-6">
                            <h4 className="font-black text-gray-900 mb-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em]">
                                <Filter size={14} className="text-red-500" /> Filter Store
                            </h4>
                            <div className="space-y-1">
                                {storeCategories.map(cat => (
                                    <button 
                                        key={cat} 
                                        onClick={() => setActiveCategory(cat)}
                                        className={`w-full text-left px-4 py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-between group ${
                                            activeCategory === cat 
                                            ? 'bg-red-50 text-red-500' 
                                            : 'text-gray-500 hover:bg-gray-50'
                                        }`}
                                    >
                                        {cat}
                                        {activeCategory === cat && <ArrowRight size={14} />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Products Grid */}
                    <div className="lg:col-span-3">
                        {filteredMaterials.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {filteredMaterials.map((material: any) => (
                                    <MaterialCard 
                                        key={material.id} 
                                        material={material} 
                                        onOpenDetails={() => onOpenDetails(material)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[2.5rem] p-20 text-center flex flex-col items-center justify-center min-h-[400px]">
                                <Package size={48} className="text-gray-200 mb-4" />
                                <h3 className="text-xl font-black text-gray-900 mb-2">No matching items</h3>
                                <p className="text-gray-500 max-w-sm mx-auto mb-6 text-sm font-medium italic">We couldn't find any products matching your search query in this store.</p>
                                <button 
                                    onClick={() => { setActiveCategory('All'); setSearchQuery(''); }}
                                    className="px-6 py-2.5 bg-gray-900 text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-gray-800 transition-all"
                                >
                                    Reset Search
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Store Reviews — Infinite Scroll */}
            <div className="space-y-6 pt-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <h3 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                        <Star size={24} className="text-amber-500 fill-amber-500" />
                        Customer Reviews
                    </h3>
                    
                    <div className="flex flex-wrap items-center gap-4">
                        {/* Star Filters */}
                        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-100 shadow-sm">
                            <button 
                                onClick={() => setReviewRating(null)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all ${reviewRating === null ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-900'}`}
                            >
                                All
                            </button>
                            {[5, 4, 3, 2, 1].map(r => (
                                <button 
                                    key={r}
                                    onClick={() => setReviewRating(r)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 transition-all ${reviewRating === r ? 'bg-amber-500 text-white' : 'text-gray-400 hover:text-amber-500'}`}
                                >
                                    {r} <Star size={10} className={reviewRating === r ? 'fill-white' : ''} />
                                </button>
                            ))}
                        </div>

                        {/* Image Filter */}
                        <button 
                            onClick={() => setReviewHasImages(!reviewHasImages)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${reviewHasImages ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-300'}`}
                        >
                            <ImageIcon size={14} />
                            With Photos
                        </button>

                        {/* Sort Dropdown */}
                        <select 
                            value={reviewSort}
                            onChange={(e) => setReviewSort(e.target.value as any)}
                            className="bg-white border border-gray-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-600 outline-none focus:border-red-500 shadow-sm"
                        >
                            <option value="latest">Latest First</option>
                            <option value="rating_high">Highest Rated</option>
                            <option value="rating_low">Lowest Rated</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-4">
                    <AnimatePresence>
                        {reviews.map((review, idx) => (
                            <ReviewCard key={review.id} review={review} index={idx} />
                        ))}
                    </AnimatePresence>

                    {/* Infinite scroll sentinel */}
                    <div ref={sentinelRef} className="h-1" />

                    {isLoadingReviews && (
                        <div className="flex items-center justify-center py-8 gap-3">
                            <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Loading more reviews...</span>
                        </div>
                    )}

                    {!hasMoreReviews && reviews.length > 0 && (
                        <div className="text-center py-8">
                            <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">— End of reviews —</span>
                        </div>
                    )}

                    {!isLoadingReviews && reviews.length === 0 && (
                        <div className="bg-white border border-gray-100 rounded-[2.5rem] p-16 text-center flex flex-col items-center justify-center">
                            <Star size={40} className="text-gray-200 mb-4" />
                            <h4 className="text-lg font-black text-gray-900 mb-2">No reviews yet</h4>
                            <p className="text-gray-400 text-sm font-medium max-w-xs mx-auto">Be the first to share your experience with this supplier after completing an order.</p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

/** Individual review card — extracted for performance */
function ReviewCard({ review, index }: { review: any; index: number }) {
    const productNames = review.order?.items?.map((item: any) => item.material?.name).filter(Boolean) || [];

    return (
        <motion.div 
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.05, 0.3) }}
            className="bg-white rounded-[2rem] border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow"
        >
            <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
                    <User size={18} />
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                    {/* Header row */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                            <span className="font-bold text-gray-900 text-sm">{review.user?.name || 'Anonymous Buyer'}</span>
                            <span className="text-xs text-gray-400 font-medium ml-2">
                                {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                        </div>
                        <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map(s => (
                                <Star key={s} size={14} className={s <= review.rating ? 'text-amber-500 fill-amber-500' : 'text-gray-200'} />
                            ))}
                        </div>
                    </div>

                    {/* Product context */}
                    {productNames.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {productNames.map((name: string, i: number) => (
                                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase tracking-tight border border-blue-100">
                                    <Package size={10} />
                                    {name}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Comment */}
                    {review.comment && (
                        <p className="text-gray-600 text-sm leading-relaxed">{review.comment}</p>
                    )}

                    {/* Review images - Now shown by default at a smaller size */}
                    {review.image_paths && parseInt(String(review.image_paths.length)) > 0 && (
                        <div className="pt-2">
                            <div className="flex flex-wrap gap-2">
                                {review.image_paths.map((path: string, i: number) => (
                                    <motion.img 
                                        key={i}
                                        whileHover={{ scale: 1.1 }}
                                        src={`/storage/${path}`}
                                        alt={`Review photo ${i + 1}`}
                                        className="w-16 h-16 object-cover rounded-xl border border-gray-100 cursor-zoom-in"
                                        loading="lazy"
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

