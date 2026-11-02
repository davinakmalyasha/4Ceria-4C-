/**
 * The project workspace's routable panels.
 *
 * These names are `ProjectDetailPage`'s internal `TabId` union. A segment
 * outside this list is a 404, so a renamed panel cannot silently fall back to
 * the overview.
 */
export const PROJECT_TABS = [
    'overview',
    'proposals',
    'budget',
    'process',
    'interviews',
    'payments',
    'qa',
    'activity',
    'files',
    'pm_legal',
    'engineering',
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];

export function isProjectTab(value: string): value is ProjectTab {
    return (PROJECT_TABS as readonly string[]).includes(value);
}
