# Production Dockerfile for Laravel API Backend (Frontend deployed on Vercel)
FROM php:8.2-fpm-alpine
WORKDIR /var/www/html

# Install system dependencies
RUN apk add --no-cache \
    nginx \
    supervisor \
    curl \
    libpng-dev \
    libxml2-dev \
    zip \
    unzip \
    git \
    oniguruma-dev \
    postgresql-dev \
    libzip-dev \
    mysql-client

# Install PHP extensions
RUN docker-php-ext-install pdo pdo_mysql pdo_pgsql mbstring exif pcntl bcmath gd xml zip

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Copy application files
COPY . .

# Install PHP production dependencies
RUN composer install --no-dev --optimize-autoloader --no-interaction

# Create necessary Laravel directories and set permissions
RUN mkdir -p /var/www/html/storage/framework/cache/data \
             /var/www/html/storage/framework/sessions \
             /var/www/html/storage/framework/testing \
             /var/www/html/storage/framework/views \
             /var/www/html/storage/logs \
             /var/www/html/bootstrap/cache \
    && chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

# Copy Nginx and Supervisor configurations
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisord.conf

# Expose HTTP port
EXPOSE 80

# Start Supervisor to run both PHP-FPM and Nginx
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
