import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import { workflowChannels } from '../contracts/workflow.js'
import { desktopHandoff } from './handoff.js'
import { createWorkflowService } from './workflow-service.js'
import { createSessionVault } from './session-vault.js'

/** Only the packaged renderer's current main frame may invoke native workflows. */
export function registerWorkflowHandlers(rendererURL:string,origin:string):void {
  const service=createWorkflowService({origin,handoff:desktopHandoff,openApproval:url=>shell.openExternal(url),vault:createSessionVault(app.getPath('userData'),safeStorage,process.platform)})
  const trusted=(event:Electron.IpcMainInvokeEvent)=>{
    const window=BrowserWindow.fromWebContents(event.sender)
    if(!window || event.senderFrame!==event.sender.mainFrame || event.senderFrame.url.split(/[?#]/)[0]!==rendererURL.split(/[?#]/)[0])throw new Error('Untrusted workflow request')
  }
  ipcMain.handle(workflowChannels.signIn,async event=>{trusted(event);await service.signIn();return service.status()})
  ipcMain.handle(workflowChannels.signOut,async event=>{trusted(event);return service.signOut()})
  ipcMain.handle(workflowChannels.status,event=>{trusted(event);return service.status()})
  ipcMain.handle(workflowChannels.request,(event,input:unknown)=>{trusted(event);return service.request(input)})
}
