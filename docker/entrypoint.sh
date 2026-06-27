#!/bin/sh
set -e

# Run migrations at startup (MySQL is available at runtime, not during build)
php artisan migrate --force --no-interaction

# Start supervisord (nginx + php-fpm)
exec /usr/bin/supervisord -c /etc/supervisord.conf
