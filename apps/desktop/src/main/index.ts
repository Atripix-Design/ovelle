import { app, BrowserWindow, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerDownloadHandlers } from './downloads.js'
import { registerWorkflowHandlers } from './workflow-ipc.js'
import { macFullScreenChanged } from '../contracts/window-chrome.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
declare const __OVELLE_LIVE_URL__: string
declare const __OVELLE_STAGE0_ORIGIN__: string
const liveURL = __OVELLE_LIVE_URL__
const workflowEnabled=!liveURL && !!__OVELLE_STAGE0_ORIGIN__ && !process.env.ELECTRON_RENDERER_URL
const primaryInstance=!workflowEnabled || app.requestSingleInstanceLock()

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    // Preserve native window controls while letting the app header occupy their title bar.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    ...(process.platform === 'win32' ? { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#ffffff', symbolColor: '#20394b', height: 58 } } : {}),
    webPreferences: {
      // The remote development renderer does not receive native capabilities.
      preload: liveURL ? undefined : join(currentDir, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (process.platform === 'darwin' && !liveURL) {
    // A zoomed window still has traffic lights. Only native full screen frees their inset.
    const publishFullScreen = () => window.webContents.send(macFullScreenChanged, window.isFullScreen())
    window.on('enter-full-screen', publishFullScreen)
    window.on('leave-full-screen', publishFullScreen)
    window.webContents.on('did-finish-load', publishFullScreen)
  }

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

if (!primaryInstance) app.quit()
else void app.whenReady().then(() => {
  if (!liveURL) {
    const rendererURL=process.env.ELECTRON_RENDERER_URL || new URL('../renderer/index.html', import.meta.url).href
    registerDownloadHandlers(rendererURL)
    // Native workflow authority belongs only to the bundled file renderer.
    if (workflowEnabled) registerWorkflowHandlers(rendererURL,__OVELLE_STAGE0_ORIGIN__)
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  app.on('second-instance',()=>{
    const window=BrowserWindow.getAllWindows()[0]
    if(window){if(window.isMinimized())window.restore();window.focus()}
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
