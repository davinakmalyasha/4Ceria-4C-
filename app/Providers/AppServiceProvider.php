<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Laravel\Sanctum\Sanctum;
use App\Jobs\SendWebPushJob;
use App\Models\Notification;
use App\Models\PersonalAccessToken;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     *
     * TRUSTED PROXIES ARE RESOLVED HERE, NOT IN bootstrap/app.php.
     * -------------------------------------------------------
     * Inside `withMiddleware()` neither `env()` nor `config()` is reliably
     * populated -- the container is not bound and the dotenv repository has not
     * run -- so a check there reads "unset" for EVERY deployment and takes the
     * insecure branch. That is precisely how production ended up with
     * `trustProxies(at: '*')` while the surrounding comment said it must not be.
     * In `register()` the environment and config are loaded.
     *
     * Both available settings are bad, which is why this cannot just pick one:
     *
     *   trust nothing  every request appears to come from the edge IP, so all
     *                  users share ONE rate-limit bucket and `throttle:10,1` on
     *                  /login becomes a denial of service against your own users,
     *                  plus audit logs record the edge instead of the client.
     *   trust "*"      any client sets X-Forwarded-For and gets a fresh bucket per
     *                  request, so credential stuffing against /login and mass
     *                  identity creation via /register are effectively unthrottled.
     *
     * So production refuses to boot without an explicit CIDR list. Failing loudly
     * at deploy time is the only outcome that is neither of the two failure modes.
     * Non-production falls back to "*" so artisan serve and Octane keep working
     * behind whatever local infrastructure is in front of them.
     */
    public function register(): void
    {
        $trusted = self::parseTrustedProxies(config('app.trusted_proxies'));

        if ($this->app->isProduction() && empty($trusted)) {
            throw new \RuntimeException(
                'TRUSTED_PROXIES is not set, so this application cannot decide how to '
                .'trust X-Forwarded-For. Set it to the comma-separated CIDR list of the '
                .'reverse proxy / platform edge that terminates TLS in front of the app '
                .'(Railway, Cloudflare, an nginx sidecar). Trusting nothing collapses '
                .'every request into one shared rate-limit bucket, which turns the login '
                .'throttle into a denial of service against your own users; trusting '
                .'everything lets a client mint a fresh bucket per request, which '
                .'disables the login and registration throttles entirely. See '
                .'.env.example and AppServiceProvider::register().'
            );
        }

        // Static, so it must be set before the middleware pipeline runs.
        \Illuminate\Http\Middleware\TrustProxies::at($trusted ?: '*');
    }

    /**
     * Normalise the TRUSTED_PROXIES config value into a list of proxy entries.
     *
     * EXTRACTED SO IT CAN ACTUALLY BE TESTED. This chain used to be inline in
     * `register()`, which is not reachable from a test: `withMiddleware()` runs
     * without env or config populated, so the only way to cover the parsing was
     * to copy it into the test -- which asserted that `explode()` splits strings.
     * A test that reimplements the thing it is testing passes forever and
     * protects nothing.
     *
     * Returns `[]` for every unusable input rather than throwing, because the
     * caller's decision about emptiness is environment-dependent: production
     * refuses to boot, and non-production falls back to `'*'` so artisan serve
     * and Octane keep working.
     *
     * @return list<string>
     */
    public static function parseTrustedProxies(mixed $trusted): array
    {
        // Already a list (a config array, or a .env value Laravel parsed).
        if (is_array($trusted)) {
            return array_values(array_filter(
                array_map(fn ($v) => trim((string) $v), $trusted),
                fn ($v) => $v !== ''
            ));
        }

        if (! is_string($trusted)) {
            return [];
        }

        // `TRUSTED_PROXIES=*` is the documented "trust whatever is in front" form
        // and must survive as a single entry, not be split on nothing.
        if (trim($trusted) === '*') {
            return ['*'];
        }

        return array_values(array_filter(
            array_map('trim', explode(',', $trusted)),
            fn ($v) => $v !== ''
        ));
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Prevent lazy loading, silently discarding attributes, and accessing missing attributes in non-production
        Model::shouldBeStrict(! $this->app->isProduction());

        // Override PersonalAccessToken model to throttle last_used_at write operations
        Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);

        // Short aliases for polymorphic favorites (stored as 'house', 'arsitek', …)
        Relation::morphMap([
            'house' => \App\Models\House::class,
            'arsitek' => \App\Models\Arsitek::class,
            'kontraktor' => \App\Models\Kontraktor::class,
            'interior' => \App\Models\InteriorProfile::class,
            'notaris' => \App\Models\NotarisProfile::class,
            'project_manager' => \App\Models\ProjectManager::class,
            'structural' => \App\Models\StructuralEngineer::class,
            'mep' => \App\Models\MepEngineer::class,
            'material' => \App\Models\Material::class,
        ]);

        // Web Push: one hook fans every in-app Notification out to the
        // recipient's push subscriptions (all 48 create sites stay as-is).
        //
        // The preference policy lives in NotificationPreferenceService so the
        // "always notify about money and disputes" rule is enforceable in ONE
        // place. The in-app row is always created — this only governs the extra
        // push fan-out, so muting never hides a notification from the centre.
        Notification::created(function (Notification $notification): void {
            if (! $notification->user_id) {
                return;
            }

            try {
                if (! app(\App\Services\NotificationPreferenceService::class)->shouldPush($notification)) {
                    return;
                }

                SendWebPushJob::dispatch($notification->id);
            } catch (\Throwable) {
                // Queue unavailable or preference read failed — the in-app
                // notification still exists, so never fail the write.
            }
        });

        // Define API rate limiter (200 requests per minute per bearer token / IP).
        //
        // The throttle is APPENDED to the `api` middleware group in
        // bootstrap/app.php, which runs BEFORE the `auth:sanctum` group wrapping
        // the routes. So `$request->user()` is ALWAYS null in here: the previous
        //
        //     $key = $request->user()?->id ?: $request->ip();
        //     if ($request->user()) { return Limit::perMinute(200)->by($key); }
        //     return Limit::perMinute(60)->by($key);
        //
        // meant the 200/min authenticated branch was unreachable and EVERY
        // request fell through to the 60/min IP bucket. Worse, the IP key is the
        // spoofable one: with `X-Forwarded-For` honoured (see the TRUSTED_PROXIES
        // handling in bootstrap/app.php) a caller could rotate that bucket freely.
        //
        // Keying on the BEARER TOKEN fixes both problems at once, and it is
        // available before authentication has run:
        //
        //   - the intended 200/min tier now actually applies to logged-in traffic;
        //   - the bucket is tied to a credential the caller must possess, so it
        //     cannot be rotated by forging a header.
        //
        // The token is hashed before it becomes a cache key: a raw Sanctum token in
        // a Redis key would leak a live credential to anyone able to read the key
        // space or dump a slowlog.
        RateLimiter::for('api', function (Request $request) {
            $token = $request->bearerToken();

            if (is_string($token) && $token !== '') {
                return Limit::perMinute(200)->by('tok:'.hash('sha256', $token));
            }

            return Limit::perMinute(60)->by('ip:'.$request->ip());
        });
    }
}

