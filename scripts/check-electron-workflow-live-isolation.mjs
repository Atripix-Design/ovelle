import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
const require=createRequire(import.meta.url)
const app=await _electron.launch({executablePath:require('electron'),args:['--disable-gpu',fileURLToPath(new URL('../apps/desktop/out/main/index.js',import.meta.url))]})
try {
 const page=await app.firstWindow()
 await page.waitForLoadState('domcontentloaded')
 assert.equal(new URL(page.url()).protocol,'https:')
 assert.equal(await page.evaluate(()=>typeof window.ovelleWorkflow),'undefined')
 const prefs=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences())
 assert.equal(prefs.preload,undefined);assert.equal(prefs.sandbox,true);assert.equal(prefs.contextIsolation,true);assert.equal(prefs.nodeIntegration,false)
 console.log('Electron live renderer has no workflow preload or native bridge.')
} finally {await app.close()}
