import Link from 'next/link';
import { formatIDR } from '@/lib/format';
import type { DirectoryRow } from './explore';

/**
 * Native "Find Engineers" panel.
 *
 * The legacy tab stacked the structural and MEP directories in one screen. Both
 * are fetched on the server (`/structural-engineers`, `/mep-engineers`) and
 * rendered here; each card links to the fuller directory route, which is already
 * a native panel.
 */

function EngineerCard({
    engineer,
    directoryHref,
}: {
    engineer: DirectoryRow;
    directoryHref: string;
}) {
    return (
        <article className="bg-white rounded-2xl border border-neutral-200 p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-black text-neutral-900 leading-snug">
                        {engineer.nama_perusahaan || engineer.nama || 'Engineer'}
                    </h3>
                    <p className="mt-1 text-[11px] text-neutral-500">{engineer.lokasi ?? 'Location not set'}</p>
                </div>
                {engineer.is_verified && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-wider">
                        Verified
                    </span>
                )}
            </div>

            {engineer.spesialisasi && (
                <p className="mt-3 text-xs leading-relaxed text-neutral-600 line-clamp-2">
                    {engineer.spesialisasi}
                </p>
            )}

            <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                <span>{engineer.pengalaman_tahun ?? 0} yrs experience</span>
                <span className="text-neutral-900">{formatIDR(engineer.rate_harga)}</span>
            </div>

            <Link
                href={directoryHref}
                className="mt-4 inline-flex text-[10px] font-black uppercase tracking-wider text-neutral-900 hover:text-red-600"
            >
                View directory →
            </Link>
        </article>
    );
}

function EngineerSection({
    title,
    rows,
    directoryHref,
}: {
    title: string;
    rows: DirectoryRow[];
    directoryHref: string;
}) {
    return (
        <section data-native-section={title}>
            <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 className="text-sm font-black text-neutral-900">
                    {title} <span className="text-neutral-400">· {rows.length}</span>
                </h2>
                <Link
                    href={directoryHref}
                    className="text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-900"
                >
                    View all →
                </Link>
            </div>

            {rows.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                    No engineers are listed in this category yet.
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {rows.map((engineer) => (
                        <EngineerCard key={engineer.id} engineer={engineer} directoryHref={directoryHref} />
                    ))}
                </div>
            )}
        </section>
    );
}

export function FindEngineersPanel({
    structural,
    mep,
}: {
    structural: DirectoryRow[];
    mep: DirectoryRow[];
}) {
    return (
        <div data-native-panel="find-engineers" className="space-y-8">
            <div>
                <h1 className="text-2xl font-black text-neutral-900">Find Engineers</h1>
                <p className="text-sm text-neutral-500 mt-1">
                    Structural and MEP specialists available for your project.
                </p>
            </div>

            <EngineerSection
                title="Structural Engineers"
                rows={structural}
                directoryHref="/dashboard/structural"
            />
            <EngineerSection
                title="MEP Specialists"
                rows={mep}
                directoryHref="/dashboard/mep"
            />
        </div>
    );
}
