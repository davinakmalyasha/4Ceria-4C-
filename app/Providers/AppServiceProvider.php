<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Database\Eloquent\Model;
use Laravel\Sanctum\Sanctum;
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

