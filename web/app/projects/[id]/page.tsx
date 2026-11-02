import { loadProjectPage } from './projectData';
import { OverviewPanel, ProjectShell, type ProjectPayload } from './panels';

/**
 * `/projects/<id>` — the NATIVE overview.
 *
 * The panel is a server component: the brief, the escrow summary and the
 * milestones are in the first response. The legacy workspace is no longer
 * mounted for this route; the remaining panels still use it until each is
 * ported.
 */
export default async function ProjectPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const { project } = await loadProjectPage(id);

    return (
        <ProjectShell project={project as ProjectPayload} activeTab="overview">
            <OverviewPanel project={project as ProjectPayload} />
        </ProjectShell>
    );
}
