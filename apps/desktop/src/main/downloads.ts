import { BrowserWindow, ipcMain } from 'electron'
import { downloadChannels } from '../contracts/downloads.js'

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
    if (!response.ok) throw new Error('Download catalog unavailable')
    return (await response.json()).releases
  })

  ipcMain.handle(downloadChannels.email, async (event, email: unknown) => {
    trustedSender(event)
    if (typeof email !== 'string' || email.length > 254) throw new Error('Invalid email')
    const response = await fetch('https://dev.ovelle.org/api/download-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!response.ok || !(await response.json()).sent) throw new Error('Email delivery unavailable')
  })
}
