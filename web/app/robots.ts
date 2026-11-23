import type { MetadataRoute } from 'next';

const site = process.env.SITE_URL ?? 'http://127.0.0.1:3000';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/', '/help', '/login', '/register', '/pro/register', '/forgot-password'],
                disallow: ['/api/', '/dashboard/', '/admin/', '/projects/', '/storage/', '/auth/'],
            },
        ],
        sitemap: `${site.replace(/\/+$/, '')}/sitemap.xml`,
    };
}
