import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
    {
        ignores: ['node_modules/**', 'public/**', 'vendor/**', 'resources/js/scratch/**', 'mobile/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{ts,tsx}'],
        plugins: {
            'react-hooks': reactHooks,
        },
        settings: {
            react: { version: 'detect' },
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            // Incremental rollout: warn (not fail) on the legacy backlog.
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            // Legacy patterns flagged by react-hooks v7's new checks; these are
            // intentional persistence/telemetry effects. Triage over time.
            'react-hooks/set-state-in-effect': 'warn',
            'react-hooks/refs': 'warn',
        },
    },
);
