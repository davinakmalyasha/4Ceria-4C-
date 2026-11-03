import Link from 'next/link';
import { assetUrl } from '@/lib/assets';
import { formatIDR, titleCase } from '@/lib/format';
import { CoverImage } from '@/components/CoverImage';

/**
 * Native dashboard "Explore" panel.
 *
 * The legacy ExploreTab held four sections in client state and mounted every
 * directory at once. Here the section is a URL (`/dashboard/explore?section=…`)
 * and only that section's data is fetched on the server, so a page view costs
 * one request (or one parallel batch for professionals) instead of nine.
 */

export const EXPLORE_SECTIONS = ['houses', 'professionals', 'marketplace', 'saved'] as const;
export type ExploreSection = (typeof EXPLORE_SECTIONS)[number];

export function isExploreSection(value: string): value is ExploreSection {
    return (EXPLORE_SECTIONS as readonly string[]).includes(value);
}

export interface HouseRow {
    id: number;
    name?: string | null;
    price?: string | number | null;
    description?: string | null;
    dimensions?: { width?: number | null; length?: number | null; floors?: number | null } | null;
    rooms?: { bedrooms?: number | null; bathrooms?: number | null } | null;
    address?: {
        street?: string | null;
        kelurahan?: string | null;
        kecamatan?: string | null;
        city?: string | null;
        province?: string | null;
        postal_code?: string | null;
    } | null;
    views?: number | null;
    user_id?: number | null;
    housePic?: { id?: number; dir?: string | null }[] | null;
}

export interface DirectoryRow {
    id: number;
    nama?: string | null;
    nama_perusahaan?: string | null;
    spesialisasi?: string | null;
    lokasi?: string | null;
    pengalaman_tahun?: number | null;
    rate_harga?: string | null;
    projects_count?: number | null;
    count?: number | null;
    is_verified?: boolean;
    foto?: string | null;
}

export interface MaterialRow {
    id: number;
    name?: string | null;
    price?: string | null;
    unit?: string | null;
    category?: string | null;
    stock?: number | null;
    is_available?: boolean;
    image_path?: string | null;
    description?: string | null;
    supplier?: { id?: number; store_name?: string | null } | null;
}

export interface SupplierRow {
    id: number;
    store_name?: string | null;
    address?: string | null;
    category?: string | null;
    bio?: string | null;
    foto?: string | null;
    verification_status?: string | null;
    materials_count?: number | null;
    reviews_avg_rating?: number | null;
}

export interface FavoriteItem {
    id: number;
    type?: string | null;
    title?: string | null;
    subtitle?: string | null;
    image?: string | null;
    price?: number | null;
}

export interface ExploreData {
    houses: HouseRow[];
    professionals: Record<string, DirectoryRow[]>;
    materials: MaterialRow[];
    suppliers: SupplierRow[];
    favorites: Record<string, FavoriteItem[]>;
}

const SECTIONS: { id: ExploreSection; label: string; description: string }[] = [
    { id: 'houses', label: 'Houses', description: 'Homes listed by owners and agents.' },
    { id: 'professionals', label: 'Professionals', description: 'Architects, contractors, notaries and specialists.' },
    { id: 'marketplace', label: 'Marketplace', description: 'Materials and furniture from verified suppliers.' },
    { id: 'saved', label: 'Saved', description: 'Everything you bookmarked.' },
];

function SectionNav({ active }: { active: ExploreSection }) {
    return (
        <nav className="flex flex-wrap gap-2" aria-label="Explore sections">
            {SECTIONS.map((section) => (
                <Link
                    key={section.id}
                    href={section.id === 'houses' ? '/dashboard/explore' : `/dashboard/explore?section=${section.id}`}
                    aria-current={section.id === active ? 'page' : undefined}
                    className={
                        section.id === active
                            ? 'px-4 py-2 rounded-xl text-xs font-black bg-neutral-900 text-white'
                            : 'px-4 py-2 rounded-xl text-xs font-bold bg-white border border-neutral-200 text-neutral-500 hover:text-neutral-900'
                    }
                >
                    {section.label}
                </Link>
            ))}
        </nav>
    );
}

function HousesSection({ houses }: { houses: HouseRow[] }) {
    if (houses.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                No houses are listed yet. Owners publish them from the Post House screen.
            </div>
        );
    }

    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {houses.map((house) => {
                const cover = assetUrl(house.housePic?.[0]?.dir ?? null);
                const city = [house.address?.city, house.address?.province].filter(Boolean).join(', ');

                return (
                    <article key={house.id} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                        <Link href={`/dashboard/houses/${house.id}`} aria-label={house.name ?? `House #${house.id}`}>
                            {cover ? (
                                <CoverImage src={cover} alt="" className="h-40" />
                            ) : (
                                <div className="h-40 w-full bg-neutral-100 flex items-center justify-center text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                    No photo
                                </div>
                            )}
                        </Link>
                        <div className="p-5">
                            <h3 className="text-sm font-black text-neutral-900 leading-snug">
                                <Link href={`/dashboard/houses/${house.id}`} className="hover:text-red-600">
                                    {house.name ?? `House #${house.id}`}
                                </Link>
                            </h3>
                            <p className="mt-1 text-xs text-neutral-500">{city || 'Location not set'}</p>
                            <p className="mt-3 text-sm font-bold text-neutral-900">{formatIDR(house.price)}</p>
                            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                {house.rooms?.bedrooms != null && <span>{house.rooms.bedrooms} BR</span>}
                                {house.rooms?.bathrooms != null && <span>{house.rooms.bathrooms} BA</span>}
                                {house.dimensions?.floors != null && <span>{house.dimensions.floors} floors</span>}
                                {house.views != null && <span>{house.views} views</span>}
                            </div>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

const ROLE_GROUPS: { key: string; label: string; href: string }[] = [
    { key: 'project_manager', label: 'Project Management Experts', href: '/dashboard/project_manager' },
    { key: 'arsitek', label: 'Architects & Designers', href: '/dashboard/architects' },
    { key: 'interior', label: 'Interior Design Studios', href: '/dashboard/interior' },
    { key: 'kontraktor', label: 'Constructors & Build Teams', href: '/dashboard/constructors' },
    { key: 'notaris', label: 'Legal Specialists & Notaries', href: '/dashboard/notaris' },
    { key: 'structural', label: 'Structural Engineers', href: '/dashboard/structural' },
    { key: 'mep', label: 'MEP Engineering Specialists', href: '/dashboard/mep' },
];

function ProfessionalCard({ professional }: { professional: DirectoryRow }) {
    return (
        <article className="bg-white rounded-2xl border border-neutral-200 p-4 flex flex-col">
            <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-black text-neutral-900 leading-snug">
                    {professional.nama_perusahaan || professional.nama || 'Professional'}
                </h4>
                {professional.is_verified && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-wider">
                        Verified
                    </span>
                )}
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">{professional.lokasi ?? 'Location not set'}</p>
            {professional.spesialisasi && (
                <p className="mt-2 text-xs text-neutral-600 leading-relaxed line-clamp-2">{professional.spesialisasi}</p>
            )}
            <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                <span>{professional.pengalaman_tahun ?? 0} yrs</span>
                <span>{formatIDR(professional.rate_harga)}</span>
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-100">
                <Link
                    href="/dashboard/projects"
                    className="text-[10px] font-black uppercase tracking-wider text-neutral-900 hover:text-red-600"
                >
                    Invite to a project →
                </Link>
            </div>
        </article>
    );
}

function ProfessionalsSection({ professionals }: { professionals: Record<string, DirectoryRow[]> }) {
    return (
        <div className="space-y-10">
            {ROLE_GROUPS.map((group) => {
                const rows = professionals[group.key] ?? [];
                return (
                    <section key={group.key} data-native-section={group.key}>
                        <div className="flex items-baseline justify-between gap-3 mb-3">
                            <h3 className="text-sm font-black text-neutral-900">
                                {group.label} <span className="text-neutral-400">· {rows.length}</span>
                            </h3>
                            <Link href={group.href} className="text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900">
                                View all →
                            </Link>
                        </div>
                        {rows.length === 0 ? (
                            <p className="text-xs text-neutral-500">No professionals are listed in this category yet.</p>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {rows.slice(0, 4).map((professional) => (
                                    <ProfessionalCard key={professional.id} professional={professional} />
                                ))}
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

function MarketplaceSection({ materials, suppliers }: { materials: MaterialRow[]; suppliers: SupplierRow[] }) {
    return (
        <div className="space-y-10">
            <section>
                <div className="flex items-baseline justify-between gap-3 mb-3">
                    <h3 className="text-sm font-black text-neutral-900">
                        Materials &amp; Furniture <span className="text-neutral-400">· {materials.length}</span>
                    </h3>
                    <Link href="/dashboard/marketplace" className="text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900">
                        Open marketplace →
                    </Link>
                </div>
                {materials.length === 0 ? (
                    <p className="text-xs text-neutral-500">No materials are listed yet.</p>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {materials.map((material) => (
                            <article key={material.id} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                                {assetUrl(material.image_path) ? (
                                    <CoverImage src={assetUrl(material.image_path) ?? ''} alt="" className="h-36" />
                                ) : (
                                    <div className="h-36 w-full bg-neutral-100" />
                                )}
                                <div className="p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <h4 className="text-sm font-black text-neutral-900">{material.name}</h4>
                                        {material.is_available === false && (
                                            <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-neutral-400">Out of stock</span>
                                        )}
                                    </div>
                                    <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                        {titleCase(material.category)}
                                    </p>
                                    <p className="mt-2 text-sm font-bold text-neutral-900">
                                        {formatIDR(material.price)}
                                        {material.unit ? <span className="text-[10px] font-semibold text-neutral-400"> / {material.unit}</span> : null}
                                    </p>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section>
                <div className="flex items-baseline justify-between gap-3 mb-3">
                    <h3 className="text-sm font-black text-neutral-900">
                        Suppliers <span className="text-neutral-400">· {suppliers.length}</span>
                    </h3>
                </div>
                {suppliers.length === 0 ? (
                    <p className="text-xs text-neutral-500">No suppliers are listed yet.</p>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {suppliers.map((supplier) => (
                            <article key={supplier.id} className="bg-white rounded-2xl border border-neutral-200 p-5">
                                <div className="flex items-start justify-between gap-2">
                                    <h4 className="text-sm font-black text-neutral-900">{supplier.store_name}</h4>
                                    {supplier.verification_status === 'verified' && (
                                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-wider">
                                            Verified
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 text-[11px] text-neutral-500">{supplier.address ?? supplier.category ?? ''}</p>
                                {supplier.bio && <p className="mt-2 text-xs text-neutral-600 leading-relaxed line-clamp-2">{supplier.bio}</p>}
                                <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                    <span>{supplier.materials_count ?? 0} materials</span>
                                    <span>{supplier.reviews_avg_rating ? `★ ${supplier.reviews_avg_rating}` : 'No reviews'}</span>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function SavedSection({ favorites }: { favorites: Record<string, FavoriteItem[]> }) {
    const groups = Object.entries(favorites).filter(([, rows]) => rows.length > 0);

    if (groups.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                Nothing saved yet. Bookmark a house, a professional or a material and it appears here.
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {groups.map(([type, rows]) => (
                <section key={type}>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                        {titleCase(type)} · {rows.length}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {rows.map((item) => (
                            <article key={`${type}-${item.id}`} className="bg-white rounded-2xl border border-neutral-200 p-4">
                                <p className="text-sm font-black text-neutral-900">{item.title}</p>
                                <p className="mt-1 text-[11px] text-neutral-500">{item.subtitle ?? ''}</p>
                                {item.price != null && (
                                    <p className="mt-2 text-sm font-bold text-neutral-900">{formatIDR(item.price)}</p>
                                )}
                            </article>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

export function ExplorePanel({ section, data }: { section: ExploreSection; data: ExploreData }) {
    const current = SECTIONS.find((entry) => entry.id === section);

    return (
        <div data-native-panel="explore" className="space-y-6">
            <div>
                <h1 className="text-2xl font-black text-neutral-900">Explore</h1>
                <p className="text-sm text-neutral-500 mt-1">
                    {current?.description ?? 'Browse houses, find professionals, and shop materials.'}
                </p>
            </div>

            <SectionNav active={section} />

            {section === 'houses' && <HousesSection houses={data.houses} />}
            {section === 'professionals' && <ProfessionalsSection professionals={data.professionals} />}
            {section === 'marketplace' && (
                <MarketplaceSection materials={data.materials} suppliers={data.suppliers} />
            )}
            {section === 'saved' && <SavedSection favorites={data.favorites} />}
        </div>
    );
}
