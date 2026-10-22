import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Deliberately independent of deployed bindings, credentials and migrations.
export default defineConfig({
  plugins: [cloudflareTest({
    miniflare: {
      compatibilityDate: '2026-10-06',
      d1Databases: ['DB'],
    },
  })],
  test: { include: ['tests/worker/stage0/**/*.test.ts'], testTimeout: 30_000 },
})
