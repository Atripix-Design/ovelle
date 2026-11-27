import type { D1Database } from '@cloudflare/workers-types'
import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test'
import { fixtureContext } from './helpers'

export async function databaseFixture(migrationLimit?: number) {
  const bindings = env as unknown as { DB: D1Database; TEST_MIGRATIONS: D1Migration[] }
  const db = bindings.DB
  // This plugin/runtime shares D1 state between tests in a file. Reset only the
  // local test binding; deferred FKs allow dropping the circular ownership schema.
  const objects = await db.prepare("SELECT type,name FROM sqlite_master WHERE type IN ('trigger','view','table') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY CASE type WHEN 'trigger' THEN 0 WHEN 'view' THEN 1 ELSE 2 END").all<{ type: string; name: string }>()
  if (objects.results.length) await db.batch([
    db.prepare('PRAGMA defer_foreign_keys = ON'),
    ...objects.results.map(row => db.prepare(`DROP ${row.type.toUpperCase()} "${row.name.replaceAll('"', '""')}"`)),
  ])
  await applyD1Migrations(db, bindings.TEST_MIGRATIONS.slice(0, migrationLimit))
  const ctx = fixtureContext(db)
  let now = ctx.clock.now()
  ctx.clock.now = () => now
  const execute = (sql: string, ...values: (string | number | null)[]) => db.prepare(sql).bind(...values)
  await db.batch(['a', 'b', 'c', 'd'].map(id => execute(
    'INSERT INTO accounts (id,email,display_name,email_verified_at,created_at) VALUES (?,?,?,?,?)', id, `${id}@example.test`, id.toUpperCase(), now, now,
  )))
  await db.batch([
    execute("INSERT INTO organizations(id,name,owner_account_id,created_by_account_id,created_at) VALUES('org-a','A','a','a',?)", now),
    execute("INSERT INTO organizations(id,name,owner_account_id,created_by_account_id,created_at) VALUES('org-b','B','b','b',?)", now),
    execute("INSERT INTO organization_memberships(id,organization_id,account_id,preset) VALUES('mc-a','org-a','c','admin')"),
    execute("INSERT INTO organization_memberships(id,organization_id,account_id,preset) VALUES('mc-b','org-b','c','coordinator')"),
    execute("INSERT INTO organization_memberships(id,organization_id,account_id,preset) VALUES('md-a','org-a','d','coordinator')"),
    ...['a1', 'a2', 'b1'].map(id => execute('INSERT INTO programs(id,organization_id,name) VALUES(?,?,?)', id, `org-${id[0]}`, id.toUpperCase())),
    ...['ax', 'ay', 'bx'].map(id => execute('INSERT INTO locations(id,organization_id,name) VALUES(?,?,?)', id, `org-${id[0]}`, id.toUpperCase())),
  ])
  return { db, ctx, execute, advance: (ms: number) => { now += ms } }
}
