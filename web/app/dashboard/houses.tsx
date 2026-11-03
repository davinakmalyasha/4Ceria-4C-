import Link from 'next/link';
import { assetUrl } from '@/lib/assets';
import { formatIDR, titleCase } from '@/lib/format';
import { deleteHouse } from './houses-actions';
import { updateHouse } from './house-actions';
import { ConfirmSubmit } from './confirmSubmit';
import type { HouseRow } from './explore';
import { CoverImage } from '@/components/CoverImage';

/**
 * Native house listings.
 *
 * `GET /houses` returns the public listing feed (`housePic` cover, address,
 * rooms and dimensions). `/dashboard/houses` renders every listing; `/dashboard/
 * my-houses` filters by `user_id` on the server and adds the delete action.
 */

function HouseCard({ house }: { house: HouseRow }) {
    const cover = assetUrl(house.housePic?.[0]?.dir ?? null);
    const address = [house.address?.city, house.address?.province].filter(Boolean).join(', ');

    return (
        <article data-native-house={house.id} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <Link href={`/dashboard/houses/${house.id}`} aria-label={house.name ?? `House #${house.id}`}>
                {cover ? (
                    <CoverImage src={cover} alt="" className="h-44" />
                ) : (
                    <div className="h-44 w-full bg-neutral-100 flex items-center justify-center text-[10px] font-black uppercase tracking-wider text-neutral-400">
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
                <p className="mt-1 text-xs text-neutral-500">{address || 'Location not set'}</p>
                <p className="mt-3 text-lg font-black text-neutral-900">{formatIDR(house.price)}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    <span>{house.rooms?.bedrooms ?? 0} BR</span>
                    <span>{house.rooms?.bathrooms ?? 0} BA</span>
                    {house.dimensions?.floors != null && <span>{house.dimensions.floors} floors</span>}
                    {house.dimensions?.width != null && house.dimensions?.length != null && (
                        <span>
                            {house.dimensions.width} × {house.dimensions.length} m
                        </span>
                    )}
                    {house.views != null && <span>{house.views} views</span>}
                </div>
                {house.description && (
                    <p className="mt-3 text-xs leading-relaxed text-neutral-600 line-clamp-2">{house.description}</p>
                )}
            </div>
        </article>
    );
}

export interface HouseFilters {
    q?: string;
    city?: string;
    price_min?: string;
    price_max?: string;
    bedrooms?: string;
    sort?: string;
}

export function HousesPanel({ houses, filters }: { houses: HouseRow[]; filters?: HouseFilters }) {
    const active = filters ?? {};
    return (
        <div data-native-panel="houses" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Houses</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Homes listed for sale by owners and agents.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                        {houses.length} listed
                    </span>
                    <Link
                        href="/dashboard/my-houses"
                        className="px-3 py-1.5 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                    >
                        My properties
                    </Link>
                </div>
            </div>

            <form method="get" action="/dashboard/houses" className="bg-white rounded-2xl border border-neutral-200 p-4">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                    <input
                        type="search"
                        name="q"
                        defaultValue={active.q ?? ''}
                        placeholder="Search name or area…"
                        className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-900"
                    />
                    <input
                        name="city"
                        defaultValue={active.city ?? ''}
                        placeholder="City (kab/kota)…"
                        className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-900"
                    />
                    <input
                        name="price_min"
                        inputMode="numeric"
                        defaultValue={active.price_min ?? ''}
                        placeholder="Min price (Rp)"
                        className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-900"
                    />
                    <input
                        name="price_max"
                        inputMode="numeric"
                        defaultValue={active.price_max ?? ''}
                        placeholder="Max price (Rp)"
                        className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-900"
                    />
                    <input
                        name="bedrooms"
                        type="number"
                        min={0}
                        defaultValue={active.bedrooms ?? ''}
                        placeholder="Min bedrooms"
                        className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-900"
                    />
                    <select
                        name="sort"
                        defaultValue={active.sort ?? ''}
                        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs outline-none focus:border-neutral-900"
                    >
                        <option value="">Newest first</option>
                        <option value="price_asc">Price: low to high</option>
                        <option value="price_desc">Price: high to low</option>
                    </select>
                </div>
                <div className="mt-2 flex items-center gap-3">
                    <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                    >
                        Filter
                    </button>
                    <Link
                        href="/dashboard/houses"
                        className="text-[10px] font-black uppercase tracking-wider text-neutral-400 hover:text-neutral-900"
                    >
                        Reset
                    </Link>
                </div>
            </form>

            {houses.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                    No properties match these filters. Try widening the price range or clearing the search.
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {houses.map((house) => (
                        <HouseCard key={house.id} house={house} />
                    ))}
                </div>
            )}
        </div>
    );
}

export function MyHousesPanel({
    houses,
    viewerId,
    error,
}: {
    houses: HouseRow[];
    viewerId: number;
    error?: string;
}) {
    const mine = houses.filter((house) => house.user_id === viewerId);

    return (
        <div data-native-panel="my-houses" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">My Properties</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Manage the listings you are selling.
                    </p>
                </div>
                <Link
                    href="/dashboard/post-house"
                    className="px-4 py-2 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-red-500"
                >
                    Add New Property
                </Link>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            {mine.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-10 text-center">
                    <h2 className="text-sm font-black text-neutral-900">No properties listed yet</h2>
                    <p className="mt-1 text-xs text-neutral-500 max-w-md mx-auto">
                        You have not listed any houses for sale. Post your first property to start receiving
                        enquiries.
                    </p>
                    <Link
                        href="/dashboard/post-house"
                        className="mt-5 inline-flex px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                    >
                        Start selling now
                    </Link>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {mine.map((house) => (
                        <div key={house.id} className="space-y-3">
                            <HouseCard house={house} />
                            <div className="flex items-center justify-between gap-2">
                                <Link
                                    href={`/dashboard/houses/${house.id}`}
                                    className="px-3 py-1.5 rounded-lg border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                                >
                                    Details
                                </Link>
                                <form action={deleteHouse}>
                                    <input type="hidden" name="id" value={house.id} />
                                    <ConfirmSubmit message="Delete this property listing? This cannot be undone.">
                                        Delete listing
                                    </ConfirmSubmit>
                                </form>
                            </div>

                            <details className="bg-white rounded-2xl border border-neutral-200 p-4">
                                <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900">
                                    Edit listing
                                </summary>
                                <form action={updateHouse} className="mt-3 space-y-2">
                                    <input type="hidden" name="house_id" value={house.id} />
                                    <input
                                        name="name"
                                        required
                                        defaultValue={house.name ?? ''}
                                        className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input name="price" required defaultValue={house.price ?? ''} inputMode="decimal" className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                                        <input name="floors" type="number" min={1} defaultValue={house.dimensions?.floors ?? 1} className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                                        <input name="br" type="number" min={0} defaultValue={house.rooms?.bedrooms ?? 0} className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                                        <input name="ba" type="number" min={0} defaultValue={house.rooms?.bathrooms ?? 0} className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                                        <input name="width" type="number" min={0} step="0.01" defaultValue={house.dimensions?.width ?? ''} className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                                        <input name="length" type="number" min={0} step="0.01" defaultValue={house.dimensions?.length ?? ''} className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                                    </div>
                                    <textarea name="house_desc" rows={2} defaultValue={house.description ?? ''} className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input name="street_name" defaultValue={house.address?.street ?? ''} placeholder="Street" className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                                        <input name="kelurahan" defaultValue={house.address?.kelurahan ?? ''} placeholder="Kelurahan" className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                                        <input name="kecamatan" defaultValue={house.address?.kecamatan ?? ''} placeholder="Kecamatan" className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                                        <input name="kab_kota" defaultValue={house.address?.city ?? ''} placeholder="City" className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                                        <input name="province" defaultValue={house.address?.province ?? ''} placeholder="Province" className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                                        <input name="postal_code" defaultValue={house.address?.postal_code ?? ''} placeholder="Postal code" className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                                    </div>

                                    {(house.housePic ?? []).length > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                                Remove photos
                                            </p>
                                            {(house.housePic ?? []).map((pic) =>
                                                pic.id ? (
                                                    <label key={pic.id} className="flex items-center gap-2 text-[10px] text-neutral-600">
                                                        <input type="checkbox" name="deleted_house_pics" value={pic.id} />
                                                        Photo #{pic.id}
                                                    </label>
                                                ) : null,
                                            )}
                                        </div>
                                    )}

                                    <input
                                        type="file"
                                        name="house_pics"
                                        multiple
                                        accept="image/jpeg,image/png"
                                        className="block text-xs text-neutral-600 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-2 file:py-1.5 file:text-[9px] file:font-black file:uppercase file:tracking-wider file:text-white"
                                    />
                                    <button
                                        type="submit"
                                        className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                    >
                                        Save listing
                                    </button>
                                </form>
                            </details>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Native house detail.
 *
 * Served at `/dashboard/houses/[id]` from `GET /houses/{house}` — the same
 * call that counts the view (once per viewer per six hours), so opening a
 * card is what makes the view counter move.
 */
export function HouseDetailPanel({ house }: { house: HouseRow }) {
    const pics = house.housePic ?? [];
    const cover = assetUrl(pics[0]?.dir ?? null);
    const address = [
        house.address?.street,
        house.address?.kelurahan,
        house.address?.kecamatan,
        house.address?.city,
        house.address?.province,
        house.address?.postal_code,
    ].filter(Boolean).join(', ');

    return (
        <div data-native-panel="house-detail" className="space-y-6">
            <Link
                href="/dashboard/houses"
                className="text-xs font-bold text-neutral-500 hover:text-neutral-900"
            >
                ← All houses
            </Link>

            <div className="grid gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-4">
                    {cover ? (
                        <CoverImage src={cover} alt="" className="h-72 w-full rounded-2xl" />
                    ) : (
                        <div className="h-72 w-full rounded-2xl bg-neutral-100 flex items-center justify-center text-[10px] font-black uppercase tracking-wider text-neutral-400">
                            No photo
                        </div>
                    )}
                    {pics.length > 1 && (
                        <div className="grid grid-cols-3 gap-3">
                            {pics.slice(1, 7).map((pic) => {
                                const src = assetUrl(pic.dir ?? null);
                                return src ? (
                                    <CoverImage key={pic.id} src={src} alt="" className="h-24" />
                                ) : null;
                            })}
                        </div>
                    )}
                    <section className="bg-white rounded-2xl border border-neutral-200 p-6">
                        <h2 className="text-sm font-black uppercase tracking-wider text-neutral-400">Description</h2>
                        <p className="mt-3 text-sm leading-relaxed text-neutral-700 whitespace-pre-line">
                            {house.description || 'No description provided.'}
                        </p>
                    </section>
                </div>

                <aside className="space-y-5">
                    <section className="bg-white rounded-2xl border border-neutral-200 p-6">
                        <h1 className="text-xl font-black text-neutral-900 leading-snug">
                            {house.name ?? `House #${house.id}`}
                        </h1>
                        <p className="mt-1 text-xs text-neutral-500">{address || 'Location not set'}</p>
                        <p className="mt-4 text-2xl font-black text-neutral-900">{formatIDR(house.price)}</p>
                        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <dt className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Bedrooms</dt>
                                <dd className="mt-0.5 font-bold">{house.rooms?.bedrooms ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Bathrooms</dt>
                                <dd className="mt-0.5 font-bold">{house.rooms?.bathrooms ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Floors</dt>
                                <dd className="mt-0.5 font-bold">{house.dimensions?.floors ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Size</dt>
                                <dd className="mt-0.5 font-bold">
                                    {house.dimensions?.width != null && house.dimensions?.length != null
                                        ? `${house.dimensions.width} × ${house.dimensions.length} m`
                                        : '—'}
                                </dd>
                            </div>
                        </dl>
                        {house.views != null && (
                            <p className="mt-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                {house.views} {house.views === 1 ? 'view' : 'views'}
                            </p>
                        )}
                    </section>

                    <Link
                        href="/dashboard/my-houses"
                        className="block text-center px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                    >
                        Manage my properties
                    </Link>
                </aside>
            </div>
        </div>
    );
}
