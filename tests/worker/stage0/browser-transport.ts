/** Only the authenticated test TLS bridge may restore actual observed metadata.
 * Missing headers remain missing; never infer values from a desired scenario. */
export function browserTransport(request: Request, control: string): Request | null {
  if (request.headers.get('X-Fixture-Transport') !== control) return null
  const observed = JSON.parse(request.headers.get('X-Fixture-Observed') ?? '{}') as Record<string, string | null>
  const headers = new Headers(request.headers)
  for (const name of ['Sec-Fetch-Mode', 'Sec-Fetch-Dest', 'Sec-Fetch-Site']) {
    headers.delete(name)
    if (observed[name] !== null && observed[name] !== undefined) headers.set(name, observed[name])
  }
  headers.delete('X-Fixture-Transport'); headers.delete('X-Fixture-Observed')
  return new Request(request, { headers })
}
