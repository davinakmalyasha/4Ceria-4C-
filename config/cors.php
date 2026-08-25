<?php

return [

    'paths' => ['api/*', 'storage/*'],

    'allowed_methods' => ['*'],

    // Locked to the deployed SPA origin. FRONTEND_URL is set in production;
    // when absent (local dev), the API origin itself is allowed so Vite
    // proxy-less workflows keep working.
    'allowed_origins' => array_values(array_filter([
        env('FRONTEND_URL'),
        env('APP_URL'), // local: http://localhost:9000
    ])),

    'allowed_origins_patterns' => [
        // Vercel preview deployments for THIS project only. The previous
        // pattern matched ANY *.vercel.app subdomain, including
        // attacker-controlled ones. Set VERCEL_PROJECT_SLUG to your Vercel
        // project name; previews look like <slug>-git-branch-team.vercel.app.
        '#^https://'.preg_quote(env('VERCEL_PROJECT_SLUG', '4ceria'), '#').'[a-z0-9-]*\.vercel\.app$#',
    ],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    // Auth is Bearer-token based; no cookie sessions cross-origin.
    'supports_credentials' => false,

];
