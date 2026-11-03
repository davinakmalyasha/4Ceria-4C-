import Link from 'next/link';
import { assetUrl } from '@/lib/assets';
import { formatIDR } from '@/lib/format';
import type { DirectoryRow } from './explore';
import { CoverImage } from '@/components/CoverImage';

/**
 * Native "Hire Sub-Contractors" panel.
 *
 * The legacy tab rendered the constructor directory (`/kontraktor`) under a
 * hiring heading. The rows are fetched on the server; each card links to the
 * full constructor directory, which is already a native panel.
 */
export function FindSubContractorsPanel({ contractors }: { contractors: DirectoryRow[] }) {
    return (
        <div data-native-panel="find-sub-contractors" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Hire Sub-Contractors</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Browse and invite specialist contractors (roofing, pool, HVAC, etc.) to your active
                        projects.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {contractors.length} listed
                </span>
            </div>

            {contractors.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-10 text-center">
                    <h2 className="text-sm font-black text-neutral-900">No sub-contractors found</h2>
                    <p className="mt-1 text-xs text-neutral-500">
                        No contractor profiles are listed yet.
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {contractors.map((contractor) => {
                        const image = assetUrl(contractor.foto);
                        return (
                            <article
                                key={contractor.id}
                                data-native-contractor={contractor.id}
                                className="bg-white rounded-2xl border border-neutral-200 p-5"
                            >
                                <div className="flex items-start gap-3">
                                    <span className="h-12 w-12 shrink-0 rounded-xl bg-neutral-900 text-white text-sm font-black flex items-center justify-center overflow-hidden">
                                        {image ? (
                                            <CoverImage src={image} alt="" className="h-full" />
                                        ) : (
                                            (contractor.nama ?? '?').trim().charAt(0).toUpperCase()
                                        )}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <h2 className="text-sm font-black text-neutral-900 leading-snug truncate">
                                                {contractor.nama ?? 'Contractor'}
                                            </h2>
                                            {contractor.is_verified && (
                                                <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-wider">
                                                    Verified
                                                </span>
                                            )}
                                        </div>
                                        {contractor.nama_perusahaan && contractor.nama_perusahaan !== contractor.nama && (
                                            <p className="mt-0.5 text-[11px] text-neutral-500 truncate">
                                                {contractor.nama_perusahaan}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {contractor.spesialisasi && (
                                    <p className="mt-3 text-xs leading-relaxed text-neutral-600 line-clamp-2">
                                        {contractor.spesialisasi}
                                    </p>
                                )}

                                <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                    <span>
                                        {contractor.projects_count ?? contractor.count ?? 0} projects
                                    </span>
                                    <span className="text-neutral-900">{formatIDR(contractor.rate_harga)}</span>
                                </div>

                                <Link
                                    href="/dashboard/constructors"
                                    className="mt-4 inline-flex text-[10px] font-black uppercase tracking-wider text-neutral-900 hover:text-red-600"
                                >
                                    View directory →
                                </Link>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
