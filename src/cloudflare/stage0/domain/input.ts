import { Stage0Error } from '../errors'

/** Reject unknown enumerable fields; optionally require every named own field.
 * This checks shape only. Callers still validate each field's domain meaning.
 * No coercion, defaults or copying: command digests retain the caller's values.
 */
export function exactObject(value: unknown, fields: string[], requireAll = false): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !fields.includes(key))
    || (requireAll && fields.some(key => !Object.hasOwn(value, key)))) {
    throw new Stage0Error('invalid_input')
  }
  return value as Record<string, unknown>
}
