import { describe, expect, test } from 'vitest';
import { assetUrl } from '@/lib/assets';
import { resolveAsset } from '@/lib/assetUrl';

describe('resolveAsset', () => {
    test('empty values resolve to null', () => {
        expect(resolveAsset('http://api', null)).toBeNull();
        expect(resolveAsset('http://api', undefined)).toBeNull();
        expect(resolveAsset('http://api', '')).toBeNull();
    });

    test('absolute storage URLs keep only the path', () => {
        expect(resolveAsset('http://api', 'https://api.example.com/storage/uploads/a.png?x=1')).toBe(
            '/storage/uploads/a.png?x=1',
        );
        expect(resolveAsset('http://api', 'http://127.0.0.1:8099/storage/u/b.png')).toBe(
            '/storage/u/b.png',
        );
    });

    test('absolute non-storage URLs pass through', () => {
        expect(resolveAsset('http://api', 'https://cdn.example.com/img/a.png')).toBe(
            'https://cdn.example.com/img/a.png',
        );
    });

    test('an unparseable absolute-looking value passes through', () => {
        expect(resolveAsset('http://api', 'https://[invalid')).toBe('https://[invalid');
    });

    test('storage-prefixed paths are not double-prefixed', () => {
        expect(resolveAsset('http://api', '/storage/uploads/a.png')).toBe('/storage/uploads/a.png');
        expect(resolveAsset('http://api', 'storage/uploads/a.png')).toBe('/storage/uploads/a.png');
    });

    test('bare paths join onto the base', () => {
        expect(resolveAsset('http://api:8099', 'uploads/a.png')).toBe(
            'http://api:8099/storage/uploads/a.png',
        );
    });

    test('joining trims stray slashes', () => {
        expect(resolveAsset('http://api:8099///', 'uploads/a.png')).toBe(
            'http://api:8099/storage/uploads/a.png',
        );
        expect(resolveAsset('http://api:8099', '///uploads/a.png')).toBe(
            'http://api:8099/storage/uploads/a.png',
        );
    });
});

describe('assetUrl', () => {
    test('proxies bare paths to same-origin storage', () => {
        expect(assetUrl('uploads/a.png')).toBe('/storage/uploads/a.png');
    });

    test('passes storage paths and empty values through', () => {
        expect(assetUrl('/storage/uploads/a.png')).toBe('/storage/uploads/a.png');
        expect(assetUrl(null)).toBeNull();
    });
});
