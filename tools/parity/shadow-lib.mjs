/**
 * The shadow comparison, as a function.
 *
 * `shadow.mjs` runs one route by hand; `shadow-all.mjs` runs every PORTED route
 * as part of the gate. Both share this, so "identical" means the same thing in
 * both places.
 */

export async function callStack(base, { method = 'GET', uri, token, body = null }) {
    const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    if (body !== null) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${base.replace(/\/$/, '')}/${uri}`, {
        method,
        headers,
        body: body ?? undefined,
        redirect: 'manual',
    });

    return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        body: await response.text(),
    };
}

/**
 * Compare two responses. Returns an array of problems — empty means identical.
 */
export function diffResponses(legacy, port, bases = null) {
    // THE HOST IS THE CALLER'S, NOT THE APPLICATION'S.
    //
    // A paginator embeds `$request->url()` — the scheme and host the client
    // used. Behind a proxy both stacks see the same public host, so the value
    // is identical in production; in the shadow run they are on different
    // ports. Comparing them literally would report a difference that cannot
    // exist once deployed, so each stack's own origin is replaced with one
    // placeholder before the bodies are compared.
    const escapedSlash = String.fromCharCode(92) + '/';
    const placeholderPlain = 'http://shadow.test';
    const placeholderEscaped = 'http:' + escapedSlash + escapedSlash + 'shadow.test';

    const normalise = (body, base) => {
        if (!base || !bases) {
            return body;
        }

        const escaped = base.split("/").join(escapedSlash);

        return body
            .split(escaped).join(placeholderEscaped)
            .split(base).join(placeholderPlain);
    };

    legacy = { ...legacy, body: normalise(legacy.body, bases?.legacy) };
    port = { ...port, body: normalise(port.body, bases?.port) };

    const problems = [];

    if (legacy.status !== port.status) {
        problems.push(`status: laravel ${legacy.status}, gateway ${port.status}`);
    }

    if (legacy.contentType !== port.contentType) {
        problems.push(`content-type: laravel ${legacy.contentType}, gateway ${port.contentType}`);
    }

    if (legacy.body !== port.body) {
        let at = 0;

        while (at < legacy.body.length && at < port.body.length && legacy.body[at] === port.body[at]) {
            at += 1;
        }

        const window = (text) => text.slice(Math.max(0, at - 60), at + 60);

        problems.push(
            `body differs at byte ${at}\n` +
            `      laravel: …${window(legacy.body)}…\n` +
            `      gateway: …${window(port.body)}…`,
        );
    }

    return problems;
}

/** The full exchange for one route. */
export async function shadowRoute({ route, laravel, gateway, token, method = 'GET', uri = null, body = null }) {
    const target = uri ?? route.uri;

    const [legacy, port] = await Promise.all([
        callStack(laravel, { method, uri: target, token, body }),
        callStack(gateway, { method, uri: target, token, body }),
    ]);

    return diffResponses(legacy, port, { legacy: laravel, port: gateway });
}
