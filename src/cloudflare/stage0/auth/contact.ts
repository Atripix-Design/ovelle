import { Stage0Error } from '../errors'

/** Shared contact rules; email is a nominated delivery address, never identity
 * linking authority. Reject controls before trimming hidden mail separators. */
export function normalizedEmail(input: unknown): string {
  // eslint-disable-next-line no-control-regex
  if (typeof input !== 'string' || /[\u0000-\u001f\u007f]/.test(input)) throw new Stage0Error('invalid_input')
  const email = input.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Stage0Error('invalid_input')
  return email
}
export function normalizedContactName(input: unknown): string {
  if (typeof input !== 'string' || input.trim().length < 1 || input.trim().length > 120) throw new Stage0Error('invalid_input')
  return input.trim()
}
