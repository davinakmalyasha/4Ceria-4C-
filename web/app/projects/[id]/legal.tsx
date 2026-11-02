import { titleCase } from '@/lib/format';
import type { DocumentRow } from './files';
import type { ProjectPayload } from './panels';

/**
 * Native legal hub (`pm_legal`).
 *
 * The legacy PMLegalHub maps three government clearances to document
 * categories (`legal_land`, `legal_pbg`, `legal_slf`) and shows the vault plus
 * the legal phase state. Both the project and its documents are fetched on the
 * server; verification/upload actions stay legacy until their write flows are
 * ported.
 */

const REQUIREMENTS: { slug: string; category: string; label: string }[] = [
    { slug: 'land_legality', category: 'legal_land', label: 'Land Certificate (SHM/HGB)' },
    { slug: 'building_permit', category: 'legal_pbg', label: 'Persetujuan Bangunan Gedung (PBG)' },
    { slug: 'usage_certificate', category: 'legal_slf', label: 'Sertifikat Laik Fungsi (SLF)' },
];

function documentFor(documents: DocumentRow[], category: string): DocumentRow | undefined {
    return documents.find((document) => document.category === category);
}

function dateOnly(value: string | null | undefined): string {
    return value ? value.slice(0, 10) : '—';
}

export function LegalPanel({
    project,
    documents,
}: {
    project: ProjectPayload;
    documents: DocumentRow[];
}) {
    const legalDocuments = documents.filter(
        (document) => (document.category ?? '').startsWith('legal_') || document.target_role === 'notary',
    );
    const vault = legalDocuments.length > 0 ? legalDocuments : documents;

    return (
        <section>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Legal &amp; Compliance Hub</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Mandatory government clearances, the legal vault and the phase state.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {project.notaris?.nama ?? 'No notary assigned'}
                </span>
            </div>

            <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                Mandatory Government Clearances
            </h2>
            <div className="grid gap-4 sm:grid-cols-3 mb-8">
                {REQUIREMENTS.map((requirement) => {
                    const document = documentFor(documents, requirement.category);
                    return (
                        <article key={requirement.slug} className="bg-white rounded-2xl border border-neutral-200 p-5">
                            <p className="text-sm font-black text-neutral-900 leading-snug">{requirement.label}</p>
                            {document ? (
                                <>
                                    <p className="mt-3 text-xs font-semibold text-neutral-700 truncate">
                                        {document.file_name}
                                    </p>
                                    <div className="mt-2 flex items-center justify-between">
                                        <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600">
                                            {titleCase(document.status ?? 'uploaded')}
                                        </span>
                                        {document.file_url && (
                                            <a
                                                href={document.file_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-[9px] font-black uppercase tracking-wider text-neutral-900 hover:text-red-600"
                                            >
                                                View
                                            </a>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-amber-600">
                                    Awaiting Owner Upload
                                </p>
                            )}
                        </article>
                    );
                })}
            </div>

            <div className="grid gap-5 lg:grid-cols-3 mb-8">
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">PBG verified</p>
                    <p className="mt-2 text-sm font-black text-neutral-900">{dateOnly(project.pbg_verified_at)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">SLF verified</p>
                    <p className="mt-2 text-sm font-black text-neutral-900">{dateOnly(project.slf_verified_at)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Legal handover</p>
                    <p className="mt-2 text-sm font-black text-neutral-900">
                        {project.legal_handover_submitted_at ? dateOnly(project.legal_handover_submitted_at) : 'Not submitted'}
                    </p>
                </div>
            </div>

            {(project.legal_requirements ?? []).length > 0 && (
                <div className="bg-white rounded-2xl border border-neutral-200 p-5 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                        Legal requirements
                    </h2>
                    <ul className="space-y-2 text-sm text-neutral-700">
                        {(project.legal_requirements ?? []).map((requirement) => (
                            <li key={requirement} className="flex items-start gap-2">
                                <span className="text-emerald-600">✓</span>
                                <span>{requirement}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {project.legal_detail && (
                <div className="bg-white rounded-2xl border border-neutral-200 p-5 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">
                        Legal detail
                    </h2>
                    <p className="text-sm leading-relaxed text-neutral-700 whitespace-pre-line">{project.legal_detail}</p>
                </div>
            )}

            {project.legal_handover_notes && (
                <div className="bg-white rounded-2xl border border-neutral-200 p-5 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">
                        Handover notes
                    </h2>
                    <p className="text-sm leading-relaxed text-neutral-700 whitespace-pre-line">
                        {project.legal_handover_notes}
                    </p>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-neutral-100">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        Official Document Vault
                    </h2>
                </div>
                {vault.length === 0 ? (
                    <p className="px-6 py-6 text-sm text-neutral-500">No legal documents uploaded yet.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                <th className="text-left px-6 py-3">Document</th>
                                <th className="text-left px-6 py-3">Category</th>
                                <th className="text-right px-6 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vault.map((document) => (
                                <tr key={document.id} className="border-t border-neutral-100">
                                    <td className="px-6 py-3 font-semibold text-neutral-800">
                                        {document.file_url ? (
                                            <a href={document.file_url} target="_blank" rel="noreferrer" className="hover:text-red-600">
                                                {document.file_name}
                                            </a>
                                        ) : (
                                            document.file_name
                                        )}
                                    </td>
                                    <td className="px-6 py-3 text-neutral-500">{titleCase(document.category)}</td>
                                    <td className="px-6 py-3 text-right text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                        {titleCase(document.status)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </section>
    );
}
