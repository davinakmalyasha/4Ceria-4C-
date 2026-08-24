#!/bin/sh
set -e

# Run migrations at startup (MySQL is available at runtime, not during build)
php artisan migrate --force --no-interaction

# Bootstrap framework caches for production performance.
# Each command is non-fatal on its own so a single cache failure cannot
# prevent the container from serving traffic.
php artisan config:cache || echo "WARN: config:cache failed"
php artisan route:cache || echo "WARN: route:cache failed"
php artisan view:cache || echo "WARN: view:cache failed"
php artisan event:cache || echo "WARN: event:cache failed"

# Start supervisord (nginx + php-fpm + queue worker + scheduler)
exec /usr/bin/supervisord -c /etc/supervisord.conf
