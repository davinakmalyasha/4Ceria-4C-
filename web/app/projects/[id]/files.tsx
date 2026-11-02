import { titleCase } from '@/lib/format';
import { ConfirmSubmit } from '@/app/dashboard/confirmSubmit';
import { DocumentUpload } from './documentUpload';
import { deleteDocument, verifyDocument } from './files-actions';

/**
 * Native document vault.
 *
 * `GET /projects/{id}/documents` returns the document rows with `file_url`
 * resolved and the uploader's public user block. Upload is a client island
 * posting multipart to the BFF; verify and delete are server actions. The API
 * owns the real gates: owner/PM may verify, uploader/owner may delete, and
 * verified/approved documents are locked.
 */

export interface DocumentRow {
    id: number;
    uploader_id?: number | null;
    file_name?: string | null;
    description?: string | null;
    category?: string | null;
    target_role?: string | null;
    status?: string | null;
    version?: number | null;
    version_label?: string | null;
    file_type?: string | null;
    file_url?: string | null;
    review_note?: string | null;
    reviewed_at?: string | null;
    created_at?: string | null;
    uploader?: { id?: number; name?: string } | null;
}

function statusClasses(status: string | null | undefined): string {
    switch (status) {
        case 'verified':
        case 'approved':
            return 'bg-emerald-50 text-emerald-600';
        case 'under_review':
        case 'reviewed':
            return 'bg-amber-50 text-amber-700';
        default:
            return 'bg-neutral-100 text-neutral-500';
    }
}

function isLocked(status: string | null | undefined): boolean {
    return status === 'verified' || status === 'approved';
}

export function FilesPanel({
    projectId,
    documents,
    viewerId,
    projectOwnerId,
    canVerify,
    error,
}: {
    projectId: number;
    documents: DocumentRow[];
    viewerId: number;
    projectOwnerId: number;
    canVerify: boolean;
    error?: string;
}) {
    const groups = new Map<string, DocumentRow[]>();
    for (const document of documents) {
        const category = document.category ?? 'uncategorised';
        const rows = groups.get(category) ?? [];
        rows.push(document);
        groups.set(category, rows);
    }

    return (
        <section data-native-panel="files" className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-neutral-900">Document Vault</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Drawings, permits, contracts and proofs uploaded to this project.
                    </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {documents.length} {documents.length === 1 ? 'document' : 'documents'}
                </span>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            <DocumentUpload projectId={projectId} />

            {documents.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-200 p-8 text-sm text-neutral-500">
                    The vault is empty. Upload the first document above.
                </div>
            ) : (
                <div className="space-y-8">
                    {[...groups.entries()].map(([category, rows]) => (
                        <div key={category}>
                            <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">
                                {titleCase(category)} · {rows.length}
                            </h2>
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {rows.map((document) => {
                                    const mayDelete =
                                        (document.uploader_id === viewerId || projectOwnerId === viewerId) &&
                                        !isLocked(document.status);
                                    const mayVerify = canVerify && !isLocked(document.status);

                                    return (
                                        <article
                                            key={document.id}
                                            data-native-document={document.id}
                                            className="bg-white rounded-2xl border border-neutral-200 p-5 flex flex-col"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h3 className="text-sm font-black text-neutral-900 truncate">
                                                        {document.file_name ?? `Document #${document.id}`}
                                                    </h3>
                                                    <p className="text-[11px] text-neutral-500 mt-0.5">
                                                        {[titleCase(document.category), document.file_type?.toUpperCase()]
                                                            .filter(Boolean)
                                                            .join(' · ')}
                                                    </p>
                                                </div>
                                                <span
                                                    className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${statusClasses(document.status)}`}
                                                >
                                                    {titleCase(document.status)}
                                                </span>
                                            </div>

                                            {document.description && (
                                                <p className="mt-2 text-xs leading-relaxed text-neutral-600 line-clamp-3">
                                                    {document.description}
                                                </p>
                                            )}

                                            <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                                <span>
                                                    {document.uploader?.name ?? 'System'}
                                                    {document.version_label ? ` · ${document.version_label}` : ''}
                                                </span>
                                                <span>{document.created_at ? document.created_at.slice(0, 10) : ''}</span>
                                            </div>

                                            {document.review_note && (
                                                <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                                                    {document.review_note}
                                                </p>
                                            )}

                                            <div className="mt-auto pt-4 flex flex-wrap items-center gap-2">
                                                {document.file_url && (
                                                    <a
                                                        href={document.file_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center px-2 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-900 hover:text-red-600"
                                                    >
                                                        Open →
                                                    </a>
                                                )}

                                                {mayVerify && (
                                                    <form action={verifyDocument}>
                                                        <input type="hidden" name="project_id" value={projectId} />
                                                        <input type="hidden" name="document_id" value={document.id} />
                                                        <button
                                                            type="submit"
                                                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-500"
                                                        >
                                                            Verify
                                                        </button>
                                                    </form>
                                                )}

                                                {mayDelete && (
                                                    <form action={deleteDocument}>
                                                        <input type="hidden" name="project_id" value={projectId} />
                                                        <input type="hidden" name="document_id" value={document.id} />
                                                        <ConfirmSubmit message="Delete this document? This cannot be undone.">
                                                            Delete
                                                        </ConfirmSubmit>
                                                    </form>
                                                )}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
