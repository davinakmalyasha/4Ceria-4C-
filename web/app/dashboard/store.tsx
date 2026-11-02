import { assetUrl } from '@/lib/assets';
import { formatIDR, titleCase } from '@/lib/format';
import { updateStoreProfile } from './store-actions';

/**
 * Native "My Store" screen.
 *
 * The store is resolved from `GET /marketplace/suppliers` by the signed-in
 * user's id, then `GET /marketplace/suppliers/{id}` supplies the materials and
 * reviews. The owner can update the store through `updateStoreProfile`
 * (`PUT /merchant/profile` via a multipart `_method=PUT`); materials have their
 * own inventory screen.
 */

export interface StoreMaterial {
    id: number;
    name?: string | null;
    price?: string | null;
    unit?: string | null;
    category?: string | null;
    image_path?: string | null;
    images?: { path?: string | null; url?: string | null }[] | null;
}

export interface StoreReview {
    id: number;
    rating?: number | null;
    comment?: string | null;
    created_at?: string | null;
    user?: { id?: number; name?: string | null } | null;
}

export interface StorePayload {
    id: number;
    user_id?: number | null;
    store_name?: string | null;
    address?: string | null;
    no_telp?: string | null;
    category?: string | null;
    bio?: string | null;
    foto?: string | null;
    detail_location?: string | null;
    latitude?: string | number | null;
    longitude?: string | number | null;
    verification_status?: string | null;
    materials_count?: number | null;
    reviews_avg_rating?: string | number | null;
    reviews_count?: number | null;
    materials?: StoreMaterial[] | null;
    reviews?: StoreReview[] | null;
}

export function StorePanel({ store, error }: { store: StorePayload | null; error?: string }) {
    if (!store) {
        return (
            <div data-native-panel="store" className="space-y-6">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">My Store</h1>
                    <p className="text-sm text-neutral-500 mt-1">Supplier storefront and catalogue.</p>
                </div>
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                    No store profile is linked to this account. Register a supplier account to open a store.
                </div>
            </div>
        );
    }

    const cover = assetUrl(store.foto);
    const materials = store.materials ?? [];
    const reviews = store.reviews ?? [];
    const rating = Number(store.reviews_avg_rating ?? 0);

    return (
        <div data-native-panel="store" className="space-y-6">
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="h-40 w-full object-cover" />
                ) : (
                    <div className="h-24 w-full bg-neutral-100" />
                )}
                <div className="p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="text-2xl font-black text-neutral-900">
                                    {store.store_name ?? 'My Store'}
                                </h1>
                                {store.verification_status === 'verified' && (
                                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider">
                                        Verified
                                    </span>
                                )}
                                {store.category && (
                                    <span className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-500 text-[9px] font-black uppercase tracking-wider">
                                        {store.category}
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-sm text-neutral-500">{store.address ?? 'Address not set'}</p>
                            {store.no_telp && <p className="mt-0.5 text-[11px] text-neutral-400">{store.no_telp}</p>}
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Rating</p>
                            <p className="mt-1 text-sm font-black text-neutral-900">
                                {rating > 0 ? `★ ${rating}` : 'No reviews'}
                                <span className="ml-1 text-[10px] font-semibold text-neutral-400">
                                    ({store.reviews_count ?? 0})
                                </span>
                            </p>
                        </div>
                    </div>

                    {store.bio && (
                        <p className="mt-4 text-sm leading-relaxed text-neutral-600 whitespace-pre-line">{store.bio}</p>
                    )}

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Materials</p>
                            <p className="mt-1 text-sm font-black text-neutral-900">{materials.length}</p>
                        </div>
                        <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Reviews</p>
                            <p className="mt-1 text-sm font-black text-neutral-900">{store.reviews_count ?? 0}</p>
                        </div>
                        <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Store id</p>
                            <p className="mt-1 text-sm font-black text-neutral-900">#{store.id}</p>
                        </div>
                    </div>
                </div>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            <details className="bg-white rounded-2xl border border-neutral-200 p-5">
                <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-neutral-900">
                    Edit store profile
                </summary>
                <form action={updateStoreProfile} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="block sm:col-span-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Store name</span>
                        <input name="store_name" required maxLength={255} defaultValue={store.store_name ?? ''} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Category</span>
                        <input name="category" defaultValue={store.category ?? ''} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Phone</span>
                        <input name="no_telp" maxLength={20} defaultValue={store.no_telp ?? ''} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block sm:col-span-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Address</span>
                        <input name="address" defaultValue={store.address ?? ''} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block sm:col-span-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Detail location</span>
                        <input name="detail_location" defaultValue={store.detail_location ?? ''} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Latitude</span>
                        <input name="latitude" defaultValue={store.latitude ?? ''} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Longitude</span>
                        <input name="longitude" defaultValue={store.longitude ?? ''} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block sm:col-span-2 xl:col-span-4">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Bio</span>
                        <textarea name="bio" rows={3} defaultValue={store.bio ?? ''} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block sm:col-span-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Store photo</span>
                        <input type="file" name="foto" accept="image/jpeg,image/png,image/webp" className="mt-1 block text-xs text-neutral-600 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-2 file:py-1.5 file:text-[9px] file:font-black file:uppercase file:tracking-wider file:text-white" />
                    </label>
                    <div className="sm:col-span-2 xl:col-span-4 flex justify-end">
                        <button type="submit" className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700">
                            Save store profile
                        </button>
                    </div>
                </form>
            </details>

            <section>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                    Store catalogue · {materials.length}
                </h2>
                {materials.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                        No materials are listed in this store yet.
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {materials.map((material) => {
                            const image = assetUrl(
                                material.image_path ?? material.images?.[0]?.path ?? material.images?.[0]?.url ?? null,
                            );
                            return (
                                <article key={material.id} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                                    {image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={image} alt="" className="h-32 w-full object-cover" />
                                    ) : (
                                        <div className="h-32 w-full bg-neutral-100" />
                                    )}
                                    <div className="p-4">
                                        <h3 className="text-sm font-black text-neutral-900">{material.name}</h3>
                                        <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                            {titleCase(material.category)}
                                        </p>
                                        <p className="mt-2 text-sm font-bold text-neutral-900">
                                            {formatIDR(material.price)}
                                            {material.unit && (
                                                <span className="text-[10px] font-semibold text-neutral-400">
                                                    {' '}
                                                    / {material.unit}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            {reviews.length > 0 && (
                <section>
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                        Latest reviews
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {reviews.slice(0, 6).map((review) => (
                            <article key={review.id} className="bg-white rounded-2xl border border-neutral-200 p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-black text-neutral-900">
                                        {review.user?.name ?? 'Customer'}
                                    </p>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                                        ★ {review.rating ?? 0}
                                    </span>
                                </div>
                                {review.comment && (
                                    <p className="mt-2 text-xs leading-relaxed text-neutral-600">{review.comment}</p>
                                )}
                            </article>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
