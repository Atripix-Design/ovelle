import { Stage0Error } from '../errors'

/** Shared bounded JSON decoding for incoming requests and provider responses. */
export async function boundedJsonBody(source: { body: ReadableStream<Uint8Array> | null; headers: Headers }, limit: number): Promise<unknown> {
  if (source.headers.get('Content-Type')?.toLowerCase().split(';')[0].trim() !== 'application/json' || !source.body) throw new Stage0Error('invalid_input')
  const reader = source.body.getReader()
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > limit) throw new Stage0Error('invalid_input')
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)) }
    catch { throw new Stage0Error('invalid_input') }
  } finally { await reader.cancel() }
}
