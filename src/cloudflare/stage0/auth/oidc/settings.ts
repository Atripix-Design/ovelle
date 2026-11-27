import type { D1Database } from '@cloudflare/workers-types'
import { Stage0Error } from '../../errors'
import type { OidcProvider, OidcSettings } from './protocol'

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value || value.length > maximum || value.trim() !== value || /\p{Cc}/u.test(value)) throw new Stage0Error('configuration')
  return value
}

/** Capture fixed server bindings, never request-selected secret names or provider
 * endpoints. No credentials are persisted, and no lookup creates a connection.
 * Each lookup rechecks D1; transaction/session final guards still own races that
 * happen after this preflight. This module does not enable public auth.
 */
export function createOidcSettingsResolver(db: D1Database, bindings: Record<string, unknown>): (provider: OidcProvider) => Promise<OidcSettings> {
  const configured = new Map<OidcProvider, Readonly<OidcSettings>>()
  try {
    if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) throw new Stage0Error('configuration')
    for (const provider of ['google', 'microsoft'] as const) {
      const prefix = provider === 'google' ? 'AUTH_GOOGLE_' : 'AUTH_MICROSOFT_'
      const values = ['CONNECTION_ID', 'CONNECTION_VERSION', 'CLIENT_ID', 'CLIENT_SECRET'].map(name => bindings[prefix + name])
      // All absent means unavailable. Partial configuration must fail startup
      // rather than quietly disabling one half of a reviewed release.
      if (values.every(value => value === undefined)) continue
      const connectionId = text(values[0], 128)
      const version = text(values[1], 16)
      const clientId = text(values[2], 1024)
      const clientSecret = text(values[3], 4096)
      if (!/^[A-Za-z0-9_-]+$/.test(connectionId) || !/^[1-9]\d*$/.test(version) || !Number.isSafeInteger(Number(version)) || /\s/u.test(clientId)) throw new Stage0Error('configuration')
      configured.set(provider, Object.freeze({ provider, connectionId, connectionVersion: Number(version), clientId, clientSecret }))
    }
  } catch { throw new Stage0Error('configuration') }

  return async provider => {
    try {
      const settings = configured.get(provider)
      if (!settings) throw new Stage0Error('configuration')
      const connection = await db.prepare(`SELECT issuer FROM identity_connections
        WHERE id=? AND protocol='oidc' AND provider=? AND organization_id IS NULL
          AND client_id=? AND version=? AND enabled=1`)
        .bind(settings.connectionId, settings.provider, settings.clientId, settings.connectionVersion).first<{ issuer: string }>()
      const issuer = connection?.issuer
      const validIssuer = provider === 'google' ? issuer === 'https://accounts.google.com'
        : typeof issuer === 'string' && (issuer === 'https://login.microsoftonline.com/{tenantid}/v2.0'
          || /^https:\/\/login\.microsoftonline\.com\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/v2\.0$/.test(issuer))
      if (!validIssuer) throw new Stage0Error('configuration')
      return settings
    } catch {
      // Missing schema, disabled profiles and DB/provider diagnostics must not
      // disclose connection details or credential material through HTTP errors.
      throw new Stage0Error('configuration')
    }
  }
}
