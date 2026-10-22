import type { D1Database } from '@cloudflare/workers-types'
import type { Stage0Config } from './config'
import { Stage0Error } from './errors'

const actions = [
  'organization.read', 'organization.update', 'program.read', 'program.manage',
  'location.read', 'location.manage', 'staff.read', 'staff.manage_coordinators',
  'staff.manage_admins', 'audit.read', 'ownership.transfer',
] as const
export type Action = typeof actions[number]
export function parseAction(value: unknown): Action {
  if (typeof value !== 'string' || !actions.includes(value as Action)) throw new Stage0Error('forbidden')
  return value as Action
}

export type Scope = { kind: 'organization' } | ({ kind: 'program_location' } & (
  { programId: string; locationId?: string } | { programId?: string; locationId: string }
))
export interface Grant { action: Action; scope: Scope }
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
// Federation assurance must be designed before introducing federated principals.
export interface Principal {
  accountId: string
  sessionId: string
  transport: 'browser' | 'desktop'
  assurance: 'enrollment' | 'password' | 'passkey'
  authenticatedAt: number
}
export interface CommandContext extends RequestContext {
  principal: Principal
  idempotencyKey: string
  requestDigest: string
}
export interface AuthorizedContext extends CommandContext {
  organizationId: string
  membershipId: string
  membershipVersion: number
  action: Action
  scope: Scope
}
export interface AccountSnapshot { id: string; displayName: string; email: string; verifiedAt: number | null }
export interface OrganizationSnapshot { id: string; name: string; timeZone: string; version: number }
