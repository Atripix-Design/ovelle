import { BrowserWindow, ipcMain } from 'electron'
import { downloadChannels } from '../contracts/downloads.js'

/** Decode the service envelope without exposing provider/parser errors over IPC.
 * Operation-specific fields are checked by the handler; this is not a release
 * item schema or a delivery acknowledgement by itself.
 */
async function serviceEnvelope(response: Response, failure: string): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error(failure)
  const body: unknown = await response.json().catch(() => { throw new Error(failure) })
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(failure)
  return body as Record<string, unknown>
}

/** Register once at application startup. Every invocation rechecks the current
 * sender frame and document; navigation cannot retain prior authorization.
 * This adapter owns the development download service transport. The service
 * remains responsible for email syntax, delivery and release catalog policy.
 */
export function registerDownloadHandlers(rendererURL: string): void {
  const trustedSender = (event: Electron.IpcMainInvokeEvent): void => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted download request')
    if (event.senderFrame.url.split(/[?#]/)[0] !== rendererURL.split(/[?#]/)[0]) throw new Error('Untrusted download request')
  }

  ipcMain.handle(downloadChannels.releases, async event => {
    trustedSender(event)
    const response = await fetch('https://dev.ovelle.org/api/releases')
    const body = await serviceEnvelope(response, 'Download catalog unavailable')
    if (!Array.isArray(body.releases)) throw new Error('Download catalog unavailable')
    return body.releases
  })

  ipcMain.handle(downloadChannels.email, async (event, email: unknown) => {
    trustedSender(event)
    if (typeof email !== 'string' || email.length > 254) throw new Error('Invalid email')
    const response = await fetch('https://dev.ovelle.org/api/download-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const body = await serviceEnvelope(response, 'Email delivery unavailable')
    if (body.sent !== true) throw new Error('Email delivery unavailable')
  })
}
