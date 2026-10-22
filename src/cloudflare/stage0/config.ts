import { Stage0Error } from './errors'

export interface Stage0Config {
  environment: 'local' | 'development' | 'production'
  origin: string
  rpId: string
  emailFrom: string
  enabled: false
  passwordDecision: 'pending'
}

/** Validate only when Stage 0 is composed; existing public routes do not load this. */
export function loadStage0Config(env: Record<string, unknown>): Stage0Config {
  const fail = (): never => { throw new Stage0Error('configuration') }
  const environment = env.APP_ENV
  if (environment !== 'local' && environment !== 'development' && environment !== 'production') return fail()
  const origin = env.AUTH_ORIGIN
  const rpId = env.AUTH_RP_ID
  if (typeof origin !== 'string' || typeof rpId !== 'string') return fail()
  let url: URL
  try { url = new URL(origin) } catch { return fail() }
  if (url.origin !== origin || url.hostname !== rpId) return fail()
  const local = environment === 'local'
  if (local) {
    if (origin !== 'http://localhost:4173' || env.AUTH_LOCAL_FIXTURES !== 'true') return fail()
  } else {
    const expected = environment === 'production' ? 'https://ovelle.org' : 'https://dev.ovelle.org'
    if (origin !== expected || env.AUTH_LOCAL_FIXTURES !== undefined) return fail()
    for (const name of ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']) {
      if (typeof env[name] !== 'string' || !env[name].trim()) return fail()
    }
  }
  const emailFrom = local ? 'fixture@example.test' : env.AUTH_EMAIL_FROM
  if (typeof emailFrom !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(emailFrom)) return fail()
  // An environment flag cannot substitute for the evidence/review gate.
  if (env.STAGE0_AUTH_ENABLED !== undefined && env.STAGE0_AUTH_ENABLED !== 'false') return fail()
  return { environment, origin, rpId, emailFrom, enabled: false, passwordDecision: 'pending' }
}
