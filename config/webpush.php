<?php

return [
    /*
     * VAPID keys for Web Push. Generate with:
     *   php -r "require 'vendor/autoload.php'; print_r(Minishlink\WebPush\VAPID::createVapidKeys());"
     * On Windows, set OPENSSL_CONF to <php>/extras/ssl/openssl.cnf if keygen fails.
     */
    'public_key' => env('VAPID_PUBLIC_KEY'),
    'private_key' => env('VAPID_PRIVATE_KEY'),
    'subject' => env('VAPID_SUBJECT', 'mailto:support@4ceria.com'),
];
