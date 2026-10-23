import { setTimeout as pause } from 'node:timers/promises'

const transportCodes = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT'])

/** Retry read-only network operations, including their response-body reads.
 * Integrity/metadata validation errors fail immediately. Callbacks must pass the
 * signal to every fetch and consume/cancel each body before returning.
 */
export async function verifyRemote(label, operation, { attempts = 3, timeoutMs = 15_000, delay = pause } = {}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new TypeError('Invalid network verification policy')
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const signal = AbortSignal.timeout(timeoutMs)
    try { return await operation(signal) }
    catch (error) {
      const timedOut = signal.aborted && (error?.name === 'TimeoutError' || error?.name === 'AbortError')
      const transport = transportCodes.has(error?.cause?.code) || transportCodes.has(error?.code)
      if (!timedOut && !transport) throw error
      // Keep signed URLs and raw transport diagnostics out of CI logs.
      if (attempt === attempts) throw new Error(`${label}: network verification failed after ${attempts} attempts`)
      await delay(attempt * 250)
    }
  }
}
