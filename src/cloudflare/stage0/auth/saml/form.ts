import { Stage0Error } from '../../errors'

export async function readSamlCallbackForm(request: Request): Promise<{ relayState: string; response: string }> {
  // Bound bytes before decoding: the maximal base64 XML may be percent-escaped.
  // URLSearchParams alone tolerates broken escapes and duplicate field names.
  const content = request.headers.get('Content-Type')?.toLowerCase()
  if (!content || !/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?\s*$/.test(content) || !request.body) throw new Stage0Error('invalid_input')
  const reader = request.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > 270_000) throw new Stage0Error('invalid_input')
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
    const fields = new Map<string, string>()
    for (const pair of text.split('&')) {
      const i = pair.indexOf('=')
      if (i < 1) throw new Stage0Error('invalid_input')
      const key = decodeURIComponent(pair.slice(0, i).replaceAll('+', ' ')), value = decodeURIComponent(pair.slice(i + 1).replaceAll('+', ' '))
      if (!['SAMLResponse', 'RelayState'].includes(key) || fields.has(key)) throw new Stage0Error('invalid_input')
      fields.set(key, value)
    }
    if (fields.size !== 2) throw new Stage0Error('invalid_input')
    return { relayState: fields.get('RelayState')!, response: fields.get('SAMLResponse')! }
  } finally { await reader.cancel() }
}
