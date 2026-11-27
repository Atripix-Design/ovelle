import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

const migrations = await readD1Migrations('./migrations')

// Ephemeral test bindings use repository migrations without accessing deployed
// databases or credentials. Migration content is shared; database state is not.
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
