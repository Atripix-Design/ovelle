import { Stage0Error } from '../errors'

/** Select one cookie without interpreting its secret. Ordering is not authority:
 * duplicates are rejected, and values are never URL-decoded or unquoted. Protocol
 * callers validate the selected value and retain their own cookie attributes.
 */
export function readUniqueCookie(request: Request, name: string): string {
  const values = (request.headers.get('Cookie') ?? '').split(';').flatMap(part => {
    const separator = part.indexOf('=')
    return separator !== -1 && part.slice(0, separator).trim() === name ? [part.slice(separator + 1).trim()] : []
  })
  if (values.length !== 1) throw new Stage0Error('unauthenticated')
  return values[0]
}
