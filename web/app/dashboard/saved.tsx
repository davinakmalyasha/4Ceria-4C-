import Link from 'next/link';
import { assetUrl } from '@/lib/assets';
import { formatIDR, titleCase } from '@/lib/format';
import { removeFavorite } from './saved-actions';
import type { FavoriteItem } from './explore';
import { CoverImage } from '@/components/CoverImage';

/**
 * Native "Saved" panel.
 *
 * `GET /favorites` answers two maps: `data` (type → ids) and `items` (type →
 * resolved cards: title, subtitle, image, price). The resolved map is the one
 * that renders here, grouped by type in the same order the legacy tabs used.
 */

const GROUPS: { type: string; label: string; browseHref: string }[] = [
    { type: 'house', label: 'Houses', browseHref: '/dashboard/houses' },
    { type: 'arsitek', label: 'Architects', browseHref: '/dashboard/architects' },
    { type: 'kontraktor', label: 'Contractors', browseHref: '/dashboard/constructors' },
    { type: 'interior', label: 'Interior', browseHref: '/dashboard/interior' },
    { type: 'notaris', label: 'Notaries', browseHref: '/dashboard/notaris' },
    { type: 'project_manager', label: 'Project Managers', browseHref: '/dashboard/project_manager' },
    { type: 'structural', label: 'Structural Engineers', browseHref: '/dashboard/structural' },
    { type: 'mep', label: 'MEP Engineers', browseHref: '/dashboard/mep' },
    { type: 'material', label: 'Materials', browseHref: '/dashboard/marketplace-materials' },
];

export function SavedPanel({
    items,
    error,
}: {
    items: Record<string, FavoriteItem[]>;
    error?: string;
}) {
    const total = Object.values(items).reduce((sum, rows) => sum + rows.length, 0);
    const groups = GROUPS.filter((group) => (items[group.type]?.length ?? 0) > 0);

    return (
        <div data-native-panel="saved" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Saved Items</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Houses, professionals and materials you bookmarked.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {total} saved
                </span>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            {groups.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-10 text-center">
                    <h2 className="text-sm font-black text-neutral-900">Nothing saved yet</h2>
                    <p className="mt-1 text-xs text-neutral-500 max-w-md mx-auto">
                        Bookmark a house, a professional or a material and it appears here.
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <Link
                            href="/dashboard/explore"
                            className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700"
                        >
                            Explore
                        </Link>
                        <Link
                            href="/dashboard/houses"
                            className="px-4 py-2 rounded-xl border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                        >
                            Browse houses
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="space-y-8">
                    {groups.map((group) => {
                        const rows = items[group.type] ?? [];
                        return (
                            <section key={group.type} data-native-section={group.type}>
                                <div className="flex items-baseline justify-between gap-3 mb-3">
                                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                        {group.label} · {rows.length}
                                    </h2>
                                    <Link
                                        href={group.browseHref}
                                        className="text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900"
                                    >
                                        Browse →
                                    </Link>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                    {rows.map((item) => {
                                        const image = assetUrl(item.image);
                                        return (
                                            <article
                                                key={`${group.type}-${item.id}`}
                                                className="bg-white rounded-2xl border border-neutral-200 overflow-hidden"
                                            >
                                                {image ? (
                                                    <CoverImage src={image} alt="" className="h-32" />
                                                ) : (
                                                    <div className="h-32 w-full bg-neutral-100 flex items-center justify-center text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                                        {titleCase(item.type ?? group.type)}
                                                    </div>
                                                )}
                                                <div className="p-4">
                                                    <h3 className="text-sm font-black text-neutral-900 leading-snug">
                                                        {item.title ?? 'Saved item'}
                                                    </h3>
                                                    <p className="mt-1 text-[11px] text-neutral-500">
                                                        {item.subtitle ?? ''}
                                                    </p>
                                                    {item.price != null && (
                                                        <p className="mt-2 text-sm font-bold text-neutral-900">
                                                            {formatIDR(item.price)}
                                                        </p>
                                                    )}
                                                    <form action={removeFavorite} className="mt-3">
                                                        <input type="hidden" name="type" value={group.type} />
                                                        <input type="hidden" name="id" value={item.id} />
                                                        <button
                                                            type="submit"
                                                            className="px-3 py-1.5 rounded-lg border border-red-200 text-[10px] font-black uppercase tracking-wider text-red-600 hover:bg-red-50"
                                                        >
                                                            Remove
                                                        </button>
                                                    </form>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
