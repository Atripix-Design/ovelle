import type { D1Database } from '@cloudflare/workers-types'
import type { Stage0Config } from './config'

import type { Action, Scope } from './domain/access'
export { stage0Actions, parseAction } from './domain/access'
export type { Action, Scope, Grant } from './domain/access'

export interface Clock { now(): number }
export interface Ids { next(): string }
export interface AuthEmail {
  to: string
  kind: 'verification' | 'password_reset' | 'staff_invitation'
  url: string
}
export type DeliveryResult = { status: 'accepted'; providerId: string } | { status: 'failed'; retryable: boolean }
export interface AuthMailer { send(input: AuthEmail): Promise<DeliveryResult> }
export interface RequestContext {
  db: D1Database
  clock: Clock
  ids: Ids
  config: Stage0Config
  mailer: AuthMailer
  requestId: string
}
// These principals are produced by authentication, never deserialized from callers.
// Authentication provenance is independent of assurance; federation never implies passkey UV.
export interface Principal {
  accountId: string
  sessionId: string
  transport: 'browser' | 'desktop'
  method: 'password' | 'passkey' | 'oidc' | 'saml'
  connectionId: string | null
  connectionVersion: number | null
  assurance: 'enrollment' | 'authenticated' | 'passkey'
  authenticatedAt: number
  passkeyVerifiedAt: number | null
}
export interface CommandContext extends RequestContext {
  principal: Principal
  idempotencyKey: string
  requestDigest: string
}
export interface AuthorizedContext extends RequestContext {
  principal: Principal
  organizationId: string
  membershipId: string
  membershipVersion: number
  action: Action
  scope: Scope
}
export interface AccountSnapshot { id: string; displayName: string; email: string; verifiedAt: number | null }
export interface OrganizationSnapshot { id: string; name: string; timeZone: string; version: number; contactEmail: string | null }
