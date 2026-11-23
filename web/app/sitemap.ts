import type { MetadataRoute } from 'next';

const site = (process.env.SITE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');

export default function sitemap(): MetadataRoute.Sitemap {
    const now = new Date();

    return [
        { url: `${site}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
        { url: `${site}/help`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
        { url: `${site}/register`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
        { url: `${site}/pro/register`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
        { url: `${site}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    ];
}
