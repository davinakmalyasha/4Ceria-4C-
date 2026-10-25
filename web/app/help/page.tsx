import { sessionToken } from '@/lib/session';
import { HelpShell } from '@/components/docs/HelpShell';

/**
 * The Help Centre — a port of `resources/js/pages/Docs.tsx`.
 *
 * THE ARTICLE IS IN THE URL. `/help?article=welcome-platform` is a real
 * location: it can be linked, shared and reloaded, and the sidebar navigates
 * with links. The legacy page reads `?article=` once on mount and then keeps
 * the selection in `useState`, so the URL never changes and the back button
 * leaves the page.
 *
 * A signed-in visitor gets the same PUBLIC layout for now. The legacy switches
 * to the dashboard shell (sidebar + header) when a user is present, and those
 * two components are part of the dashboard port, which is not done yet. The
 * difference is visible and deliberate rather than silent: it disappears when
 * the shell lands.
 */
export default async function HelpPage({
    searchParams,
}: {
    searchParams: Promise<{ article?: string }>;
}) {
    const authed = (await sessionToken()) !== null;
    const { article } = await searchParams;

    return <HelpShell authed={authed} articleId={article} />;
}
