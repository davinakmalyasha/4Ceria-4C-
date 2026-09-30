/**
 * Vitest setup.
 *
 * Deliberately minimal. Anything that stubs the network is a test that passes
 * without proving the money figure it claims to check, so there is no global
 * axios mock here — each test mocks exactly the endpoint it needs.
 */
import '@testing-library/jest-dom/vitest';

// jsdom has no matchMedia, and several components read it on mount.
if (typeof window !== 'undefined' && !window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        }),
    });
}