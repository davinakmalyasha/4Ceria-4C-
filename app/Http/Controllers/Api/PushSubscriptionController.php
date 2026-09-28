<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PushSubscriptionController extends Controller
{
    /**
     * Known Web Push service host suffixes.
     *
     * SECURITY (SSRF): the stored `endpoint` is fetched by the queue worker on
     * every notification (SendWebPushJob). Validating it as a bare `url` let any
     * authenticated user persist `http://169.254.169.254/...` or an intranet
     * host, turning the worker into a request proxy reachable from the public
     * API, and the row was then reused forever. Push endpoints are HTTPS-only
     * and are issued by the browser vendor, so an allowlist is exact here.
     */
    private const ALLOWED_ENDPOINT_SUFFIXES = [
        'fcm.googleapis.com',
        'updates.push.services.mozilla.com',
        'push.services.mozilla.com',
        'wns2-{region}.notify.windows.com',
        'notify.windows.com',
        'web.push.apple.com',
        'push.apple.com',
    ];

    /**
     * VAPID public key for the browser's pushManager.subscribe().
     */
    public function publicKey(): JsonResponse
    {
        $key = config('webpush.public_key');

        if (! $key) {
            return response()->json(['message' => 'Web push is not configured'], 501);
        }

        return response()->json(['public_key' => $key]);
    }

    /**
     * Store (or refresh) the browser push subscription for the authed user.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => ['required', 'string', 'url', 'max:500', 'starts_with:https://'],
            'keys.p256dh' => ['required', 'string', 'max:255'],
            'keys.auth' => ['required', 'string', 'max:255'],
            'contentEncoding' => ['nullable', 'string', 'max:20'],
        ]);

        $this->assertTrustedEndpoint($data['endpoint']);

        $request->user()->pushSubscriptions()->updateOrCreate(
            ['endpoint' => $data['endpoint']],
            [
                'p256dh' => $data['keys']['p256dh'],
                'auth' => $data['keys']['auth'],
                'content_encoding' => $data['contentEncoding'] ?? 'aesgcm',
                'user_agent' => mb_substr((string) $request->userAgent(), 0, 500),
            ]
        );

        return response()->json(['message' => 'Push subscription saved']);
    }

    /**
     * Remove a subscription (endpoint-keyed so it works even after re-login).
     */
    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => ['required', 'string', 'url', 'max:500', 'starts_with:https://'],
        ]);

        $this->assertTrustedEndpoint($data['endpoint']);

        $request->user()->pushSubscriptions()
            ->where('endpoint', $data['endpoint'])
            ->delete();

        return response()->json(['message' => 'Push subscription removed']);
    }

    /**
     * Reject loopback / link-local / RFC1918 / non-vendor push hosts.
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    private function assertTrustedEndpoint(string $endpoint): void
    {
        $host = strtolower((string) parse_url($endpoint, PHP_URL_HOST));

        if ($host === '') {
            abort(422, 'Invalid push endpoint.');
        }

        $blocked = [
            'localhost', '127.0.0.1', '::1', '0.0.0.0',
            '169.254.169.254', // cloud instance metadata
            'metadata.google.internal',
        ];

        if (in_array($host, $blocked, true) || filter_var($host, FILTER_VALIDATE_IP) !== false) {
            abort(422, 'Invalid push endpoint.');
        }

        $trusted = false;
        foreach (self::ALLOWED_ENDPOINT_SUFFIXES as $suffix) {
            if ($host === $suffix || str_ends_with($host, '.'.ltrim($suffix, '.'))) {
                $trusted = true;
                break;
            }
        }

        if (! $trusted) {
            abort(422, 'Unrecognized push service endpoint.');
        }
    }
}
