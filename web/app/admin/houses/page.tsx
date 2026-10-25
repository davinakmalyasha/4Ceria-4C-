import AdminHouses from '@/content/pages/admin/AdminHouses';

/**
 * Ported verbatim from `resources/js/pages/admin/AdminHouses.tsx`.
 *
 * The page is a CLIENT component: it fetches its own list from `/api/admin/…`
 * and owns its filters and modals. Those requests reach the API authenticated
 * through the BFF, so the page code is the legacy code.
 */
export default function AdminPage() {
    return <AdminHouses />;
}
