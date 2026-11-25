import { describe, expect, test } from 'vitest';
import { formatIDR, titleCase } from '@/lib/format';

describe('formatIDR', () => {
    test('renders integers with dot grouping', () => {
        expect(formatIDR(0)).toBe('Rp 0');
        expect(formatIDR(500)).toBe('Rp 500');
        expect(formatIDR(1000)).toBe('Rp 1.000');
        expect(formatIDR(1000000)).toBe('Rp 1.000.000');
        expect(formatIDR(10000000)).toBe('Rp 10.000.000');
    });

    test('renders numeric strings', () => {
        expect(formatIDR('1000')).toBe('Rp 1.000');
        expect(formatIDR('  2000  ')).toBe('Rp 2.000');
        expect(formatIDR('1_000_000')).toBe('Rp 1.000.000');
        expect(formatIDR('+2500')).toBe('Rp 2.500');
        expect(formatIDR('000123')).toBe('Rp 123');
    });

    test('renders decimal strings and drops sen', () => {
        expect(formatIDR('10000000.00')).toBe('Rp 10.000.000');
        expect(formatIDR('1234.99')).toBe('Rp 1.234');
        expect(formatIDR('2500.50')).toBe('Rp 2.500');
    });

    test('truncates fractional numbers without sen', () => {
        expect(formatIDR(123.9)).toBe('Rp 123');
    });

    test('null, undefined and empty render Rp 0', () => {
        expect(formatIDR(null)).toBe('Rp 0');
        expect(formatIDR(undefined)).toBe('Rp 0');
        expect(formatIDR('')).toBe('Rp 0');
        expect(formatIDR('   ')).toBe('Rp 0');
    });

    test('non-finite numbers render Rp 0', () => {
        expect(formatIDR(NaN)).toBe('Rp 0');
        expect(formatIDR(Infinity)).toBe('Rp 0');
        expect(formatIDR(-Infinity)).toBe('Rp 0');
    });

    test('negatives render with a leading minus', () => {
        expect(formatIDR(-4567)).toBe('-Rp 4.567');
        expect(formatIDR('-2500')).toBe('-Rp 2.500');
        expect(formatIDR('-10000000.00')).toBe('-Rp 10.000.000');
    });

    test('garbage renders Rp 0', () => {
        expect(formatIDR('abc')).toBe('Rp 0');
        expect(formatIDR('12abc')).toBe('Rp 0');
        expect(formatIDR('1,000')).toBe('Rp 0');
        expect(formatIDR('-')).toBe('Rp 0');
        expect(formatIDR('.99')).toBe('Rp 0');
    });
});

describe('titleCase', () => {
    test('null, undefined and empty return an empty string', () => {
        expect(titleCase(null)).toBe('');
        expect(titleCase(undefined)).toBe('');
        expect(titleCase('')).toBe('');
    });

    test('underscores and dashes become spaces', () => {
        expect(titleCase('hello_world')).toBe('Hello World');
        expect(titleCase('in-progress')).toBe('In Progress');
        expect(titleCase('project_manager-name')).toBe('Project Manager Name');
    });

    test('capitalizes each word', () => {
        expect(titleCase('payment failed')).toBe('Payment Failed');
        expect(titleCase('escrow')).toBe('Escrow');
    });
});
