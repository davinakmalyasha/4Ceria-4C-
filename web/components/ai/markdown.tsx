'use client';

/**
 * Minimal Markdown renderer for assistant replies.
 *
 * No new dependencies: the replies are model-generated GitHub-flavoured
 * Markdown, and the subset worth rendering is bold, italic, inline code,
 * code fences, headings, links, bullet/numbered lists and paragraphs.
 * Anything unrecognised renders as plain text — never raw HTML (the model
 * output is untrusted, so `dangerouslySetInnerHTML` is off the table).
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
    // Split on `code`, **bold**, *italic*, [label](url) keeping delimiters.
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, i) => {
        const key = `${keyPrefix}-${i}`;
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
            return (
                <code key={key} className="px-1 py-0.5 rounded-md bg-neutral-100 text-[12px] font-mono text-neutral-800">
                    {part.slice(1, -1)}
                </code>
            );
        }
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return (
                <strong key={key} className="font-bold">
                    {part.slice(2, -2)}
                </strong>
            );
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            return <em key={key}>{part.slice(1, -1)}</em>;
        }
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
            const href = link[2];
            // Only in-product or https links; everything else is plain text.
            if (href.startsWith('/') || href.startsWith('https://')) {
                return (
                    <a key={key} href={href} className="text-red-600 underline underline-offset-2 hover:text-red-700">
                        {link[1]}
                    </a>
                );
            }
            return <span key={key}>{link[1]}</span>;
        }
        return <span key={key}>{part}</span>;
    });
}

export function Markdown({ text }: { text: string }) {
    const lines = text.split('\n');
    const blocks: React.ReactNode[] = [];
    let list: { ordered: boolean; items: string[] } | null = null;
    let code: string[] | null = null;

    const flushList = () => {
        if (!list) return;
        const items = list.items;
        const ordered = list.ordered;
        list = null;
        blocks.push(
            ordered ? (
                <ol key={`b${blocks.length}`} className="my-2 space-y-1 list-decimal list-inside text-sm leading-relaxed">
                    {items.map((item, i) => (
                        <li key={i}>{renderInline(item, `li${blocks.length}-${i}`)}</li>
                    ))}
                </ol>
            ) : (
                <ul key={`b${blocks.length}`} className="my-2 space-y-1 text-sm leading-relaxed">
                    {items.map((item, i) => (
                        <li key={i} className="flex gap-2">
                            <span className="text-neutral-400 select-none">•</span>
                            <span>{renderInline(item, `li${blocks.length}-${i}`)}</span>
                        </li>
                    ))}
                </ul>
            ),
        );
    };

    lines.forEach((line) => {
        if (line.trim().startsWith('```')) {
            if (code !== null) {
                const body = (code as string[]).join('\n');
                code = null;
                blocks.push(
                    <pre key={`b${blocks.length}`} className="my-2 p-3 rounded-xl bg-neutral-900 text-neutral-100 text-[12px] font-mono overflow-x-auto whitespace-pre-wrap">
                        {body}
                    </pre>,
                );
            } else {
                flushList();
                code = [];
            }
            return;
        }
        if (code) {
            code.push(line);
            return;
        }
        const heading = /^(#{1,3})\s+(.*)$/.exec(line);
        if (heading) {
            flushList();
            const level = heading[1].length;
            blocks.push(
                <p key={`b${blocks.length}`} className={level === 1 ? 'mt-3 mb-1 text-base font-black' : 'mt-2 mb-1 text-sm font-black'}>
                    {renderInline(heading[2], `h${blocks.length}`)}
                </p>,
            );
            return;
        }
        const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
        if (ordered) {
            if (!list || !list.ordered) {
                flushList();
                list = { ordered: true, items: [] };
            }
            list.items.push(ordered[1]);
            return;
        }
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
        if (bullet) {
            if (!list || list.ordered) {
                flushList();
                list = { ordered: false, items: [] };
            }
            list.items.push(bullet[1]);
            return;
        }
        if (line.trim() === '') {
            flushList();
            return;
        }
        flushList();
        blocks.push(
            <p key={`b${blocks.length}`} className="my-1 text-sm leading-relaxed whitespace-pre-line">
                {renderInline(line, `p${blocks.length}`)}
            </p>,
        );
    });
    flushList();
    if (code !== null) {
        const tail = code as string[];
        blocks.push(
            <pre key={`b${blocks.length}`} className="my-2 p-3 rounded-xl bg-neutral-900 text-neutral-100 text-[12px] font-mono overflow-x-auto whitespace-pre-wrap">
                {tail.join('\n')}
            </pre>,
        );
    }
    return <div>{blocks}</div>;
}
