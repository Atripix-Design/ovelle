import type { Grant } from '../domain/access'
import { exactObject } from '../domain/input'
import { Stage0Error } from '../errors'

export { exactObject } from '../domain/input'

/** Decode a single path segment without accepting hidden separators or controls. */
export function segment(value: string): string {
  let decoded: string
  try { decoded = decodeURIComponent(value) } catch { throw new Stage0Error('invalid_input') }
  if (!decoded || decoded.length > 256 || /[\p{Cc}/?#]/u.test(decoded)) throw new Stage0Error('invalid_input')
  return decoded
}

export function grants(value: unknown): Grant[] {
  if (!Array.isArray(value) || value.length > 32) throw new Stage0Error('invalid_input')
  for (const grant of value) {
    const parsed = exactObject(grant, ['action', 'scope'], true)
    exactObject(parsed.scope, ['kind', 'programId', 'locationId'])
  }
  // Domain validation owns the closed action vocabulary and dimensional rules.
  return value as Grant[]
}
