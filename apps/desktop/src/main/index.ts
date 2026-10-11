import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    webPreferences: {
      preload: join(currentDir, '../preload/index.cjs'),
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

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(currentDir, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  const trustedSender = (event: Electron.IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted download request');
    const expected = process.env.ELECTRON_RENDERER_URL || new URL('../renderer/index.html', import.meta.url).href;
    if (event.senderFrame.url.split(/[?#]/)[0] !== expected.split(/[?#]/)[0]) throw new Error('Untrusted download request');
  };
  ipcMain.handle('ovelle:releases', async event => {
    trustedSender(event);
    const response = await fetch('https://dev.ovelle.org/api/releases');
    if (!response.ok) throw new Error('Download catalog unavailable');
    return (await response.json()).releases;
  });
  ipcMain.handle('ovelle:download-email', async (event, email: unknown) => {
    trustedSender(event);
    if (typeof email !== 'string' || email.length > 254) throw new Error('Invalid email');
    const response = await fetch('https://dev.ovelle.org/api/download-email', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email}) });
    if (!response.ok || !(await response.json()).sent) throw new Error('Email delivery unavailable');
  });
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
