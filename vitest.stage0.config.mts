import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

const migrations = await readD1Migrations('./migrations')

// Deliberately independent of deployed bindings, credentials and migrations.
export default defineConfig({
  plugins: [cloudflareTest({
    miniflare: {
      compatibilityDate: '2026-10-06',
      d1Databases: ['DB'],
      bindings: { TEST_MIGRATIONS: migrations },
    },
  })],
  test: { include: ['tests/worker/stage0/**/*.test.ts'], testTimeout: 30_000 },
})
