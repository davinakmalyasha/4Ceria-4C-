import { assetUrl } from '@/lib/assets';
import { formatIDR, titleCase } from '@/lib/format';
import { ConfirmSubmit } from './confirmSubmit';
import { createMaterial, deleteMaterial, updateMaterial } from './inventory-actions';

/**
 * Native merchant inventory.
 *
 * `GET /merchant/materials` returns the authenticated supplier's materials
 * (`images` loaded). Add is a multipart create; edit (including the availability
 * toggle) is a multipart `_method=PUT`; delete is a DELETE. Every write is
 * scoped to the supplier by the controller.
 */

export interface InventoryMaterial {
    id: number;
    name?: string | null;
    description?: string | null;
    price?: string | null;
    unit?: string | null;
    category?: string | null;
    stock?: number | null;
    is_available?: boolean;
    image_path?: string | null;
    images?: { id?: number; path?: string | null; url?: string | null; image_path?: string | null }[] | null;
}

const inputClass =
    'mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900';

const fileClass =
    'mt-1 block text-xs text-neutral-600 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-2 file:py-1.5 file:text-[9px] file:font-black file:uppercase file:tracking-wider file:text-white';

function imageOf(material: InventoryMaterial, index = 0): string | null {
    return assetUrl(
        material.images?.[index]?.path ??
            material.images?.[index]?.image_path ??
            material.images?.[index]?.url ??
            (index === 0 ? material.image_path : null) ??
            null,
    );
}

export function InventoryPanel({
    materials,
    role,
    error,
}: {
    materials: InventoryMaterial[];
    role: string;
    error?: string;
}) {
    return (
        <div data-native-panel="inventory" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Merchant Inventory</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Materials your store sells, their stock and availability.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {materials.length} {materials.length === 1 ? 'item' : 'items'}
                </span>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            <details className="bg-white rounded-2xl border border-neutral-200 p-5">
                <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-neutral-900">
                    Add material
                </summary>
                <form action={createMaterial} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 items-end">
                    <label className="block sm:col-span-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Name</span>
                        <input name="name" required maxLength={255} className={inputClass} />
                    </label>
                    <label className="block">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Category</span>
                        <input name="category" required maxLength={100} className={inputClass} />
                    </label>
                    <label className="block">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Price</span>
                        <input name="price" required inputMode="decimal" className={inputClass} />
                    </label>
                    <label className="block">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Unit</span>
                        <input name="unit" required maxLength={50} placeholder="piece" className={inputClass} />
                    </label>
                    <label className="block">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Stock</span>
                        <input name="stock" type="number" min={0} className={inputClass} />
                    </label>
                    <label className="block sm:col-span-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Description</span>
                        <input name="description" className={inputClass} />
                    </label>
                    <label className="block sm:col-span-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Images</span>
                        <input type="file" name="images" multiple accept="image/jpeg,image/png,image/webp" className={fileClass} />
                    </label>
                    <div className="sm:col-span-2 xl:col-span-4 flex justify-end">
                        <button
                            type="submit"
                            className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                        >
                            Add material
                        </button>
                    </div>
                </form>
            </details>

            {role !== 'supplier' && materials.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                    Merchant inventory is available to supplier accounts only.
                </div>
            ) : materials.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-10 text-center">
                    <h2 className="text-sm font-black text-neutral-900">No materials in your inventory yet</h2>
                    <p className="mt-1 text-xs text-neutral-500">
                        Add a material above and it appears in the marketplace.
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {materials.map((material) => {
                        const image = imageOf(material);

                        return (
                            <article
                                key={material.id}
                                data-native-inventory-item={material.id}
                                className="bg-white rounded-2xl border border-neutral-200 overflow-hidden"
                            >
                                {image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={image} alt="" className="h-36 w-full object-cover" />
                                ) : (
                                    <div className="h-36 w-full bg-neutral-100" />
                                )}
                                <div className="p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <h2 className="text-sm font-black text-neutral-900 leading-snug">
                                            {material.name ?? `Material #${material.id}`}
                                        </h2>
                                        <span
                                            className={
                                                material.is_available
                                                    ? 'shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-wider'
                                                    : 'shrink-0 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 text-[9px] font-black uppercase tracking-wider'
                                            }
                                        >
                                            {material.is_available ? 'In stock' : 'Hidden'}
                                        </span>
                                    </div>
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
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                        {material.stock ?? 0} in stock
                                    </p>

                                    <div className="mt-4 border-t border-neutral-100 pt-3 space-y-2">
                                        <div className="flex flex-wrap gap-2">
                                            <form action={updateMaterial}>
                                                <input type="hidden" name="material_id" value={material.id} />
                                                <input
                                                    type="hidden"
                                                    name="is_available"
                                                    value={material.is_available ? '0' : '1'}
                                                />
                                                <button
                                                    type="submit"
                                                    className="px-3 py-1.5 rounded-lg border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                                                >
                                                    {material.is_available ? 'Hide' : 'Publish'}
                                                </button>
                                            </form>

                                            <form action={deleteMaterial}>
                                                <input type="hidden" name="material_id" value={material.id} />
                                                <ConfirmSubmit message="Delete this material and its images?">
                                                    Delete
                                                </ConfirmSubmit>
                                            </form>
                                        </div>

                                        <details>
                                            <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900">
                                                Edit material
                                            </summary>
                                            <form action={updateMaterial} className="mt-2 space-y-2">
                                                <input type="hidden" name="material_id" value={material.id} />
                                                <input name="name" defaultValue={material.name ?? ''} className={inputClass} />
                                                <div className="grid grid-cols-2 gap-2">
                                                    <input name="price" defaultValue={material.price ?? ''} inputMode="decimal" className={inputClass} />
                                                    <input name="stock" type="number" min={0} defaultValue={material.stock ?? 0} className={inputClass} />
                                                    <input name="unit" defaultValue={material.unit ?? ''} className={inputClass} />
                                                    <input name="category" defaultValue={material.category ?? ''} className={inputClass} />
                                                </div>
                                                <input name="description" defaultValue={material.description ?? ''} className={inputClass} />

                                                {(material.images ?? []).length > 0 && (
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                                            Remove images
                                                        </p>
                                                        {(material.images ?? []).map((image) =>
                                                            image.id ? (
                                                                <label key={image.id} className="flex items-center gap-2 text-[10px] text-neutral-600">
                                                                    <input type="checkbox" name="deleted_image_ids" value={image.id} />
                                                                    Image #{image.id}
                                                                </label>
                                                            ) : null,
                                                        )}
                                                    </div>
                                                )}

                                                <input type="file" name="images" multiple accept="image/jpeg,image/png,image/webp" className={fileClass} />
                                                <button
                                                    type="submit"
                                                    className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                                                >
                                                    Save changes
                                                </button>
                                            </form>
                                        </details>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
