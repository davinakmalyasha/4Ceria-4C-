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
     */
    public function register(): void
    {
        //
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

        // Define API rate limiter (200 requests per minute per user/ip)
        RateLimiter::for('api', function (Request $request) {
            $key = $request->user()?->id ?: $request->ip();
            // Authenticated users get a higher limit
            if ($request->user()) {
                return Limit::perMinute(200)->by($key);
            }
            return Limit::perMinute(60)->by($key);
        });
    }
}

