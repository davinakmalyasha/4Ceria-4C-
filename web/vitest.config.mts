import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors tsconfig `paths: { "@/*": ["./*"] }` without the
    // vite-tsconfig-paths dependency (whose nested tsconfck carries an
    // optional typescript peer that breaks `npm ci` on npm 10).
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['__tests__/**/*.test.{ts,tsx}'],
  },
})
