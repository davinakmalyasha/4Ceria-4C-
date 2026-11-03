import Link from 'next/link';
import { assetUrl } from '@/lib/assets';
import { formatIDR, titleCase } from '@/lib/format';
import type { MaterialRow, SupplierRow } from './explore';
import { CoverImage } from '@/components/CoverImage';
import { requestQuote } from './quotes-actions';

/**
 * Native marketplace cluster.
 *
 * `GET /marketplace/materials` + `GET /marketplace/suppliers` feed all three
 * routes. The type, category and search live in the URL (`?type=&category=&q=`),
 * so filtering is server-side and bookmarkable instead of client state. The
 * type split reproduces the legacy rule exactly, including its quirk: the
 * FURNITURE catalogue is the subcategory list plus `Furniture & Decor`, so a
 * row stored with the flat category `Furniture` stays in Materials.
 */

export type MarketplaceMode = 'materials' | 'furniture';

const MATERIAL_CATEGORIES = [
    'All',
    'General Store',
    'Cement & Masonry',
    'Steel & Metals',
    'Wood & Lumber',
    'Electrical & Plumbing',
    'Finishing & Painting',
    'Tools & Safety',
];

const FURNITURE_CATEGORIES = [
    'All',
    'Living Room',
    'Bedroom',
    'Kitchen & Dining',
    'Workspace',
    'Lighting',
    'Rugs & Decor',
];

function isFurnitureCategory(category: string | null | undefined): boolean {
    return Boolean(
        category &&
            (FURNITURE_CATEGORIES.includes(category) || category === 'Furniture & Decor'),
    );
}

function hrefFor({
    mode,
    typeToggle,
    q,
    category,
}: {
    mode: MarketplaceMode;
    typeToggle?: boolean;
    q?: string;
    category?: string;
}): string {
    const params = new URLSearchParams();
    if (typeToggle) {
        params.set('type', mode);
    }
    if (q) {
        params.set('q', q);
    }
    if (category && category !== 'All') {
        params.set('category', category);
    }
    const query = params.toString();
    return query ? `/dashboard/marketplace?${query}` : '/dashboard/marketplace';
}

export function MarketplacePanel({
    mode,
    materials,
    suppliers,
    q,
    category,
    fixedType,
}: {
    mode: MarketplaceMode;
    materials: MaterialRow[];
    suppliers: SupplierRow[];
    q?: string;
    category?: string;
    fixedType: boolean;
}) {
    const activeCategory = category && category !== '' ? category : 'All';
    const search = (q ?? '').trim().toLowerCase();
    const categories = mode === 'materials' ? MATERIAL_CATEGORIES : FURNITURE_CATEGORIES;

    const filteredMaterials = materials.filter((material) => {
        const furniture = isFurnitureCategory(material.category);
        if (mode === 'materials' && furniture) return false;
        if (mode === 'furniture' && !furniture) return false;
        if (!material.is_available) return false;
        if (activeCategory !== 'All' && material.category !== activeCategory) return false;
        if (search) {
            const haystack = `${material.name ?? ''} ${material.description ?? ''}`.toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    const filteredSuppliers = suppliers.filter((supplier) => {
        if (!search) return true;
        return (supplier.store_name ?? '').toLowerCase().includes(search);
    });

    const title = mode === 'furniture' ? 'Furniture Marketplace' : 'Materials Marketplace';
    const otherMode: MarketplaceMode = mode === 'furniture' ? 'materials' : 'furniture';
    const fixedRoute = mode === 'furniture' ? '/dashboard/marketplace-furniture' : '/dashboard/marketplace-materials';
    const otherHref = fixedType
        ? otherMode === 'furniture'
            ? '/dashboard/marketplace-furniture'
            : '/dashboard/marketplace-materials'
        : hrefFor({ mode: otherMode, typeToggle: true, q, category });

    return (
        <div data-native-panel="marketplace" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">{title}</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        {mode === 'furniture'
                            ? 'Furniture and decor from verified suppliers.'
                            : 'Materials, tools and finishes from verified suppliers.'}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                        {filteredMaterials.length} items · {filteredSuppliers.length} suppliers
                    </span>
                    <Link
                        href={otherHref}
                        className="px-3 py-1.5 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                    >
                        {otherMode === 'furniture' ? 'Furniture' : 'Materials'}
                    </Link>
                </div>
            </div>

            <form
                method="get"
                action={fixedType ? fixedRoute : '/dashboard/marketplace'}
                className="flex flex-wrap gap-2 items-center"
            >
                {!fixedType && <input type="hidden" name="type" value={mode} />}
                <input
                    type="search"
                    name="q"
                    defaultValue={q ?? ''}
                    placeholder="Search materials or suppliers…"
                    className="flex-1 min-w-[220px] rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900"
                />
                <button
                    type="submit"
                    className="px-4 py-2 rounded-xl border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                >
                    Search
                </button>
                {search && (
                    <Link
                        href={fixedType ? (mode === 'furniture' ? '/dashboard/marketplace-furniture' : '/dashboard/marketplace-materials') : hrefFor({ mode, typeToggle: true })}
                        className="text-[10px] font-black uppercase tracking-wider text-neutral-400 hover:text-neutral-900"
                    >
                        Clear
                    </Link>
                )}
            </form>

            <nav className="flex flex-wrap gap-2" aria-label="Marketplace categories">
                {categories.map((entry) => {
                    const params = new URLSearchParams();
                    if (entry !== 'All') params.set('category', entry);
                    if (q) params.set('q', q);
                    const query = params.toString();
                    const href = fixedType
                        ? `${fixedRoute}${query ? `?${query}` : ''}`
                        : hrefFor({ mode, typeToggle: true, q, category: entry });
                    const active = activeCategory === entry;
                    return (
                        <Link
                            key={entry}
                            href={href}
                            aria-current={active ? 'page' : undefined}
                            className={
                                active
                                    ? 'px-3 py-1.5 rounded-full bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider'
                                    : 'px-3 py-1.5 rounded-full bg-white border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900'
                            }
                        >
                            {entry}
                        </Link>
                    );
                })}
            </nav>

            <section>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                    {mode === 'furniture' ? 'Furniture' : 'Materials'} · {filteredMaterials.length}
                </h2>

                {filteredMaterials.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-10 text-center">
                        <h3 className="text-sm font-black text-neutral-900">No materials found</h3>
                        <p className="mt-1 text-xs text-neutral-500 max-w-md mx-auto">
                            {search
                                ? `We couldn't find any materials matching "${q}" in the ${activeCategory} category.`
                                : 'Nothing is listed in this section yet.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {filteredMaterials.map((material) => {
                            const image = assetUrl(material.image_path);
                            return (
                                <article
                                    key={material.id}
                                    data-native-material={material.id}
                                    className="bg-white rounded-2xl border border-neutral-200 overflow-hidden"
                                >
                                    {image ? (
                                        <CoverImage src={image} alt="" className="h-40" />
                                    ) : (
                                        <div className="h-40 w-full bg-neutral-100" />
                                    )}
                                    <div className="p-4">
                                        <div className="flex items-start justify-between gap-2">
                                            <h3 className="text-sm font-black text-neutral-900 leading-snug">
                                                {material.name}
                                            </h3>
                                            <span className="shrink-0 px-2 py-0.5 rounded-full bg-neutral-100 text-[9px] font-black uppercase tracking-wider text-neutral-500">
                                                {titleCase(material.category)}
                                            </span>
                                        </div>
                                        {material.supplier?.store_name && (
                                            <p className="mt-1 text-[11px] text-neutral-500">
                                                {material.supplier.store_name}
                                            </p>
                                        )}
                                        {material.description && (
                                            <p className="mt-2 text-xs leading-relaxed text-neutral-600 line-clamp-2">
                                                {material.description}
                                            </p>
                                        )}
                                        <p className="mt-3 text-sm font-bold text-neutral-900">
                                            {formatIDR(material.price)}
                                            {material.unit && (
                                                <span className="text-[10px] font-semibold text-neutral-400">
                                                    {' '}
                                                    / {material.unit}
                                                </span>
                                            )}
                                        </p>
                                        {material.stock != null && (
                                            <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                                {material.stock} in stock
                                            </p>
                                        )}
                                        {material.supplier?.id ? (
                                            <form action={requestQuote} className="mt-3 border-t border-neutral-100 pt-3">
                                                <input type="hidden" name="supplier_id" value={material.supplier.id} />
                                                <input type="hidden" name="material_id" value={material.id} />
                                                <input type="hidden" name="name" value={material.name ?? `Material #${material.id}`} />
                                                <input type="hidden" name="price_at_quote" value={material.price ?? '0'} />
                                                <input type="hidden" name="unit" value={material.unit ?? 'pcs'} />
                                                <div className="flex gap-2">
                                                    <label className="block w-20 shrink-0">
                                                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                                            Qty
                                                        </span>
                                                        <input
                                                            name="qty"
                                                            type="number"
                                                            min={1}
                                                            step={1}
                                                            defaultValue={1}
                                                            required
                                                            className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs text-neutral-800 outline-none focus:border-neutral-900"
                                                        />
                                                    </label>
                                                    <label className="block min-w-0 flex-1">
                                                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                                            Delivery address
                                                        </span>
                                                        <input
                                                            name="delivery_address"
                                                            required
                                                            maxLength={500}
                                                            placeholder="Street, city…"
                                                            className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs text-neutral-800 outline-none focus:border-neutral-900"
                                                        />
                                                    </label>
                                                </div>
                                                <button
                                                    type="submit"
                                                    className="mt-2 w-full px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                                >
                                                    Request quote
                                                </button>
                                            </form>
                                        ) : (
                                            <p className="mt-3 border-t border-neutral-100 pt-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                                Supplier unavailable — quoting disabled
                                            </p>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            <section>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                    Verified Suppliers · {filteredSuppliers.length}
                </h2>

                {filteredSuppliers.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                        No suppliers match this search.
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {filteredSuppliers.map((supplier) => (
                            <article key={supplier.id} className="bg-white rounded-2xl border border-neutral-200 p-5">
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="text-sm font-black text-neutral-900">{supplier.store_name}</h3>
                                    {supplier.verification_status === 'verified' && (
                                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-wider">
                                            Verified
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 text-[11px] text-neutral-500">
                                    {supplier.address ?? supplier.category ?? ''}
                                </p>
                                {supplier.bio && (
                                    <p className="mt-2 text-xs text-neutral-600 leading-relaxed line-clamp-2">
                                        {supplier.bio}
                                    </p>
                                )}
                                <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                    <span>{supplier.materials_count ?? 0} materials</span>
                                    <span>
                                        {supplier.reviews_avg_rating ? `★ ${supplier.reviews_avg_rating}` : 'No reviews'}
                                    </span>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
