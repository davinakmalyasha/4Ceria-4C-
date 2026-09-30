import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    plugins: [react()],

    /**
     * SPA unit and component tests.
     *
     * WHY THIS EXISTS
     * ---------------
     * Four defects in this pass were the same shape: a guard that blocked the
     * feature and no test asserted the feature WORKED. The suite proved the bad
     * path was closed and said nothing about the good path, so a feature could
     * be entirely unreachable and the suite stayed green.
     *
     * The client half of that was worse, because there was no test runner at
     * all: `npm test` did not exist. Every SPA figure was therefore
     * unverified, which is how "Total Spent" came to mean something that had
     * nothing to do with money leaving escrow.
     *
     * DELIBERATELY NARROW SCOPE
     * ------------------------
     * Pure functions and small presentational components only. The money
     * figures are the target: anything that computes, sums, rounds or formats a
     * rupiah amount belongs here, because that is the code that can disagree
     * with `ProjectFinancialService`.
     *
     * NOT a replacement for the Pest suite. The server owns every money
     * calculation by design (see ProjectFinancialService::DISBURSEMENT_TYPES);
     * these tests pin the CLIENT's presentation of those numbers, not a second
     * implementation of them.
     */
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./resources/js/test/setup.ts'],
        include: [
            'resources/js/**/*.test.{ts,tsx}',
        ],
        exclude: [
            'node_modules/**',
            'dist/**',
            'public/**',
        ],
        // A money assertion that needs 30 seconds to run will not be written.
        testTimeout: 5000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            // Only the money-bearing code. Reporting 0% on the whole SPA would
            // be noise and would rot immediately.
            include: [
                'resources/js/lib/**',
                'resources/js/utils/**',
            ],
        },
    },

    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./resources/js', import.meta.url)),
        },
    },
});