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
 * THE HELP CENTRE KEEPS THE PUBLIC SHELL for signed-in visitors. The legacy
 * swaps in the dashboard sidebar + header here; the port renders the public
 * navbar instead because the dashboard chrome is tab-scoped (its header needs
 * the tab, counts and inbox) and the help centre is not a dashboard tab. The
 * content is identical either way, and `Navbar authed` keeps the account menu.
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
