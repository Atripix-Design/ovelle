import type { D1Database } from '@cloudflare/workers-types'
import type { RequestContext, AuthEmail } from '../../../src/cloudflare/stage0/contracts'
import { loadStage0Config } from '../../../src/cloudflare/stage0/config'

export function fixtureContext(db: D1Database): RequestContext & { sent: AuthEmail[] } {
  let sequence = 0
  const sent: AuthEmail[] = []
  return {
    db, sent, clock: { now: () => 1_792_627_200_000 },
    ids: { next: () => `fixture-${++sequence}` }, requestId: 'fixture-request',
    config: loadStage0Config({ APP_ENV: 'local', AUTH_ORIGIN: 'http://localhost:4173', AUTH_RP_ID: 'localhost', AUTH_LOCAL_FIXTURES: 'true' }),
    mailer: { async send(input) { sent.push(input); return { status: 'accepted', providerId: `fixture-mail-${sent.length}` } } },
  }
}
