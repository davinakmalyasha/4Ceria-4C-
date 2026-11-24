#!/usr/bin/env node
// A small dependency-free load generator for the seeded gateway.
//
// It is intentionally an HTTP-level benchmark, not a framework benchmark:
// the question is what a client sees with keep-alive, gzip and the real
// middleware chain. Node's global fetch (undici) reuses connections.
//
//   node tools/bench/loadtest.mjs \
//     --url 'http://127.0.0.1:8099/api/houses?per_page=12' \
//     --duration 5 --concurrency 20
//
// Add --token (one user) or --tokens (comma-separated users; workers
// round-robin) for authenticated endpoints. Multiple users are how a
// realistic run stays inside the per-user rate limit instead of measuring
// 429 responses. --rate caps total requests/second, which keeps a run under
// the API's scoped limiter. Add --header 'X: y' for anything else. The output
// is JSON so a run can be recorded verbatim.

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    const value = process.argv[i + 1];
    if (!key?.startsWith('--') || value === undefined) {
        console.error(`usage: node ${process.argv[1]} --url URL [--duration 5] [--concurrency 20] [--token TOKEN] [--warmup 1]`);
        process.exit(2);
    }
    args.set(key.slice(2), value);
}

const url = args.get('url');
if (!url) {
    console.error('--url is required');
    process.exit(2);
}

const durationMs = Math.max(1, Number(args.get('duration') ?? 5)) * 1000;
const concurrency = Math.max(1, Number(args.get('concurrency') ?? 20));
const warmupMs = Math.max(0, Number(args.get('warmup') ?? 1)) * 1000;
const targetRps = Math.max(0, Number(args.get('rate') ?? 0));
const workerDelayMs = targetRps > 0 ? (concurrency / targetRps) * 1000 : 0;
const tokens = (args.get('tokens') ?? args.get('token') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
const extraHeader = args.get('header');

const baseHeaders = { 'Accept-Encoding': 'gzip' };
if (extraHeader) {
    const split = extraHeader.indexOf(':');
    if (split > 0) baseHeaders[extraHeader.slice(0, split).trim()] = extraHeader.slice(split + 1).trim();
}

const latencies = [];
const statuses = new Map();
let errors = 0;
let bytes = 0;
const startedAt = performance.now();
const deadline = startedAt + warmupMs + durationMs;
const warmupEnd = startedAt + warmupMs;

function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[index];
}

async function worker(index) {
    const headers = { ...baseHeaders };
    if (tokens.length > 0) headers.Authorization = `Bearer ${tokens[index % tokens.length]}`;
    while (performance.now() < deadline) {
        const begin = performance.now();
        try {
            const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(8000) });
            const body = await response.arrayBuffer();
            const end = performance.now();
            statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
            bytes += body.byteLength;
            if (begin >= warmupEnd) latencies.push(end - begin);
        } catch (error) {
            errors++;
            if (errors <= 3) console.error(`request error: ${error?.message ?? error}`);
        }
        if (workerDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, workerDelayMs));
        }
    }
}

await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
const endedAt = performance.now();
const measuredSeconds = Math.max(0.001, (endedAt - warmupEnd) / 1000);
latencies.sort((a, b) => a - b);

const result = {
    url,
    concurrency,
    users: tokens.length,
    target_rps: targetRps || null,
    duration_seconds: Number(measuredSeconds.toFixed(2)),
    requests: latencies.length,
    requests_per_second: Number((latencies.length / measuredSeconds).toFixed(1)),
    errors,
    statuses: Object.fromEntries([...statuses.entries()].sort((a, b) => a[0] - b[0])),
    bytes,
    latency_ms: {
        p50: Number(percentile(latencies, 50).toFixed(2)),
        p95: Number(percentile(latencies, 95).toFixed(2)),
        p99: Number(percentile(latencies, 99).toFixed(2)),
        min: Number((latencies[0] ?? 0).toFixed(2)),
        max: Number((latencies[latencies.length - 1] ?? 0).toFixed(2)),
    },
};

console.log(JSON.stringify(result, null, 2));
