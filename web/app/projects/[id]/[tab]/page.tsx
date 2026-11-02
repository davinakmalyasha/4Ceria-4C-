import { notFound } from 'next/navigation';
import { apiFetch, ApiFailure } from '@/lib/api';
import { loadProjectPage } from '../projectData';
import { isProjectTab } from '../tabs';
import { BudgetPanel, OverviewPanel, ProcessPanel, ProposalsPanel, ProjectShell, type BidsPayload, type BudgetPayload, type MilestoneRow, type ProjectPayload } from '../panels';
import { PaymentsPanel, type TerminRow } from '../payments';
import { QaPanel, type CommentRow } from '../qa';
import { ActivityPanel, type ActivityRow } from '../activity';
import { FilesPanel, type DocumentRow } from '../files';
import { InterviewsPanel, type SubProfessionalRow } from '../interviews';
import { LegalPanel } from '../legal';
import { EngineeringPanel, type EngineeringRequest } from '../engineering';

/**
 * `/projects/<id>/<tab>` — one route per project panel.
 *
 * PORTED PANELS ARE SERVER COMPONENTS. EVERY project panel now fetches its own
 * data on the server and renders native markup; the synced
 * `ProjectDetailPage` is no longer mounted by any project route.
 */
export default async function ProjectTabPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string; tab: string }>;
    searchParams: Promise<{ error?: string }>;
}) {
    const { id, tab } = await params;
    const { error } = await searchParams;

    if (!isProjectTab(tab)) {
        notFound();
    }

    if (tab === 'overview') {
        const { project } = await loadProjectPage(id);

        return (
            <ProjectShell project={project as ProjectPayload} activeTab={tab}>
                <OverviewPanel project={project as ProjectPayload} />
            </ProjectShell>
        );
    }

    if (tab === 'budget') {
        const { project } = await loadProjectPage(id);

        let budget: BudgetPayload | null = null;
        try {
            budget = await apiFetch<BudgetPayload>(`/projects/${id}/budget`);
        } catch (error) {
            if (!(error instanceof ApiFailure) || error.status !== 403) {
                throw error;
            }
            // A viewer without financial access gets the header and the empty
            // state rather than an error page.
        }

        return (
            <ProjectShell project={project as ProjectPayload} activeTab={tab}>
                {budget ? (
                    <BudgetPanel project={project as ProjectPayload} budget={budget} />
                ) : (
                    <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-sm text-neutral-500">
                        The budget is visible to the project owner, the assigned PM and the hired
                        professionals only.
                    </div>
                )}
            </ProjectShell>
        );
    }

    if (tab === 'proposals') {
        const { project } = await loadProjectPage(id);

        let bids: BidsPayload | null = null;
        try {
            const response = await apiFetch<{ data: BidsPayload }>(`/projects/${id}/bids`);
            bids = response.data;
        } catch (error) {
            if (!(error instanceof ApiFailure) || error.status !== 403) {
                throw error;
            }
        }

        return (
            <ProjectShell project={project as ProjectPayload} activeTab={tab}>
                {bids ? (
                    <ProposalsPanel bids={bids} />
                ) : (
                    <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-sm text-neutral-500">
                        Proposals are visible to the project owner, the assigned PM and bidders only.
                    </div>
                )}
            </ProjectShell>
        );
    }

    if (tab === 'process') {
        const { project } = await loadProjectPage(id);

        let milestones: MilestoneRow[] = [];
        let denied = false;
        try {
            const response = await apiFetch<{ data: MilestoneRow[] }>(`/projects/${id}/milestones`);
            milestones = response.data ?? [];
        } catch (error) {
            if (!(error instanceof ApiFailure) || error.status !== 403) {
                throw error;
            }
            denied = true;
        }

        let bids: BidsPayload | null = null;
        try {
            const response = await apiFetch<{ data: BidsPayload }>(`/projects/${id}/bids`);
            bids = response.data;
        } catch (error) {
            if (!(error instanceof ApiFailure) || error.status !== 403) {
                throw error;
            }
        }

        return (
            <ProjectShell project={project as ProjectPayload} activeTab={tab}>
                {denied ? (
                    <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-sm text-neutral-500">
                        The delivery process is visible to the project team only.
                    </div>
                ) : (
                    <ProcessPanel project={project as ProjectPayload} milestones={milestones} bids={bids} />
                )}
            </ProjectShell>
        );
    }

    if (tab === 'payments') {
        const { project } = await loadProjectPage(id);

        let termins: TerminRow[] = [];
        let denied = false;
        try {
            const response = await apiFetch<{ data: TerminRow[] }>(`/projects/${id}/payment-termins`);
            termins = response.data ?? [];
        } catch (error) {
            if (!(error instanceof ApiFailure) || error.status !== 403) {
                throw error;
            }
            denied = true;
        }

        return (
            <ProjectShell project={project as ProjectPayload} activeTab={tab}>
                {denied ? (
                    <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-sm text-neutral-500">
                        Payment stages are visible to the project team only.
                    </div>
                ) : (
                    <PaymentsPanel termins={termins} />
                )}
            </ProjectShell>
        );
    }

    if (tab === 'qa') {
        const { project } = await loadProjectPage(id);

        let comments: CommentRow[] = [];
        let denied = false;
        try {
            const response = await apiFetch<{ data: CommentRow[] }>(`/projects/${id}/comments`);
            comments = response.data ?? [];
        } catch (error) {
            if (!(error instanceof ApiFailure) || error.status !== 403) {
                throw error;
            }
            denied = true;
        }

        return (
            <ProjectShell project={project as ProjectPayload} activeTab={tab}>
                {denied ? (
                    <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-sm text-neutral-500">
                        The project Q&amp;A is visible to the project team only.
                    </div>
                ) : (
                    <QaPanel projectId={Number.parseInt(id, 10)} comments={comments} error={error} />
                )}
            </ProjectShell>
        );
    }

    if (tab === 'activity') {
        const { project } = await loadProjectPage(id);

        let events: ActivityRow[] = [];
        let denied = false;
        try {
            const response = await apiFetch<{ data: ActivityRow[] }>(`/projects/${id}/activity`);
            events = response.data ?? [];
        } catch (error) {
            if (!(error instanceof ApiFailure) || error.status !== 403) {
                throw error;
            }
            denied = true;
        }

        return (
            <ProjectShell project={project as ProjectPayload} activeTab={tab}>
                {denied ? (
                    <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-sm text-neutral-500">
                        The activity timeline is visible to the project team only.
                    </div>
                ) : (
                    <ActivityPanel events={events} />
                )}
            </ProjectShell>
        );
    }

    if (tab === 'files') {
        const { project, user } = await loadProjectPage(id);
        const record = project as { user_id?: number; pm_id?: number | null };
        const canVerify =
            record.user_id === user.id ||
            (user.role_type === 'project_manager' && user.project_manager?.id === record.pm_id);

        let documents: DocumentRow[] = [];
        let denied = false;
        try {
            const response = await apiFetch<{ data: DocumentRow[] }>(`/projects/${id}/documents`);
            documents = response.data ?? [];
        } catch (error) {
            if (!(error instanceof ApiFailure) || error.status !== 403) {
                throw error;
            }
            denied = true;
        }

        return (
            <ProjectShell project={project as ProjectPayload} activeTab={tab}>
                {denied ? (
                    <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-sm text-neutral-500">
                        The document vault is visible to the project team only.
                    </div>
                ) : (
                    <FilesPanel
                        projectId={Number.parseInt(id, 10)}
                        documents={documents}
                        viewerId={user.id}
                        projectOwnerId={record.user_id ?? 0}
                        canVerify={canVerify}
                        error={error}
                    />
                )}
            </ProjectShell>
        );
    }

    if (tab === 'interviews') {
        const { project, user } = await loadProjectPage(id);
        const record = project as {
            user_id?: number;
            pm_id?: number | null;
            selected_arsitek_id?: number | null;
            selected_kontraktor_id?: number | null;
        };
        const isPm =
            user.role_type === 'project_manager' && user.project_manager?.id === record.pm_id;
        const canManage = user.id === record.user_id || isPm;
        const canShortlistSpecialist =
            (user.role_type === 'arsitek' && user.arsitek?.id === record.selected_arsitek_id) ||
            (user.role_type === 'kontraktor' && user.kontraktor?.id === record.selected_kontraktor_id);

        let bids: BidsPayload | null = null;
        try {
            const response = await apiFetch<{ data: BidsPayload }>(`/projects/${id}/bids`);
            bids = response.data;
        } catch (error) {
            if (!(error instanceof ApiFailure) || error.status !== 403) {
                throw error;
            }
        }

        let subs: SubProfessionalRow[] = [];
        if (bids) {
            try {
                const response = await apiFetch<{ data: SubProfessionalRow[] }>(
                    `/projects/${id}/sub-professionals`,
                );
                subs = response.data ?? [];
            } catch (error) {
                if (!(error instanceof ApiFailure) || error.status !== 403) {
                    throw error;
                }
            }
        }

        return (
            <ProjectShell project={project as ProjectPayload} activeTab={tab}>
                {bids ? (
                    <InterviewsPanel
                        projectId={Number.parseInt(id, 10)}
                        project={project as ProjectPayload}
                        bids={bids}
                        viewerRole={user.role_type}
                        canManage={canManage}
                        canShortlistSpecialist={canShortlistSpecialist}
                        subs={subs}
                        error={error}
                    />
                ) : (
                    <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-sm text-neutral-500">
                        Interview candidates are visible to the project team and the bidders themselves.
                    </div>
                )}
            </ProjectShell>
        );
    }

    if (tab === 'pm_legal') {
        const { project } = await loadProjectPage(id);

        let documents: DocumentRow[] = [];
        let denied = false;
        try {
            const response = await apiFetch<{ data: DocumentRow[] }>(`/projects/${id}/documents`);
            documents = response.data ?? [];
        } catch (error) {
            if (!(error instanceof ApiFailure) || error.status !== 403) {
                throw error;
            }
            denied = true;
        }

        return (
            <ProjectShell project={project as ProjectPayload} activeTab={tab}>
                {denied ? (
                    <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-sm text-neutral-500">
                        The legal workspace is visible to the project team only.
                    </div>
                ) : (
                    <LegalPanel project={project as ProjectPayload} documents={documents} />
                )}
            </ProjectShell>
        );
    }

    if (tab === 'engineering') {
        const { project, user } = await loadProjectPage(id);
        const record = project as { user_id?: number; pm_id?: number | null };
        const isPm =
            user.role_type === 'project_manager' && user.project_manager?.id === record.pm_id;
        const canVerify = user.id === record.user_id || isPm;

        let bids: BidsPayload | null = null;
        try {
            const response = await apiFetch<{ data: BidsPayload }>(`/projects/${id}/bids`);
            bids = response.data;
        } catch (error) {
            if (!(error instanceof ApiFailure) || error.status !== 403) {
                throw error;
            }
        }

        let requests: EngineeringRequest[] = [];
        if (bids) {
            try {
                const response = await apiFetch<{ addendums?: EngineeringRequest[] }>(
                    `/projects/${id}/budget`,
                );
                requests = (response.addendums ?? []).filter(
                    (addendum) => addendum.type === 'specialist_request',
                );
            } catch (error) {
                if (!(error instanceof ApiFailure) || error.status !== 403) {
                    throw error;
                }
            }
        }

        return (
            <ProjectShell project={project as ProjectPayload} activeTab={tab}>
                {bids ? (
                    <EngineeringPanel
                        projectId={Number.parseInt(id, 10)}
                        project={project as ProjectPayload}
                        bids={bids}
                        requests={requests}
                        canVerify={canVerify}
                        error={error}
                    />
                ) : (
                    <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-sm text-neutral-500">
                        Engineering proposals are visible to the project team and the specialists who
                        bid.
                    </div>
                )}
            </ProjectShell>
        );
    }

    notFound();
}
