import { app, BrowserWindow, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerDownloadHandlers } from './downloads.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
declare const __OVELLE_LIVE_URL__: string
const liveURL = __OVELLE_LIVE_URL__

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    // Keep the native macOS window controls and fullscreen behavior while
    // letting the renderer provide the area used to move the window.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const } : {}),
    webPreferences: {
      // The remote development renderer does not receive native capabilities.
      preload: liveURL ? undefined : join(currentDir, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'https://github.com/Atripix-Design/ovelle' || /^https:\/\/cdn\.dev\.ovelle\.org\/releases\/desktop\/Ovelle-[\w.-]+\.(?:zip|exe)(?:\?v=[\w.-]+)?$/.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (liveURL) {
    void window.loadURL(liveURL)
  } else if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(currentDir, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  if (!liveURL) registerDownloadHandlers(process.env.ELECTRON_RENDERER_URL || new URL('../renderer/index.html', import.meta.url).href)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
