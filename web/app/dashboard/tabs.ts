/**
 * The dashboard's routable tabs.
 *
 * The SPA addressed them as `/dashboard?tab=<x>`; each is now its own route.
 * `project-detail`/`bidding-brief` are NOT here: they are states of a selected
 * project, and live under `/projects/<id>` instead.
 */
export const DASHBOARD_TABS = [
    'overview',
    'explore',
    'projects',
    'consultations',
    'my-bids',
    'hire-history',
    'post-project',
    'houses',
    'my-houses',
    'post-house',
    'saved',
    'marketplace',
    'marketplace-materials',
    'marketplace-furniture',
    'profile',
    'verification',
    'material-orders',
    'orders',
    'quotes',
    'architects',
    'constructors',
    'interior',
    'find-engineers',
    'find-sub-contractors',
    'structural',
    'mep',
    'notaris',
    'project_manager',
    'chat',
    'management',
    'my-firm',
    'my-firms',
    'delivery-jobs',
    'job-radar',
    'my-deliveries',
    'inventory',
    'store',
] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export function isDashboardTab(value: string): value is DashboardTab {
    return (DASHBOARD_TABS as readonly string[]).includes(value);
}
