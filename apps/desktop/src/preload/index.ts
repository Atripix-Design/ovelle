import { contextBridge, ipcRenderer } from 'electron';
import { downloadChannels } from '../contracts/downloads.js';
import { workflowChannels } from '../contracts/workflow.js';
import { macFullScreenChanged } from '../contracts/window-chrome.js';

if (process.platform === 'darwin') {
  let fullScreen = false;
  const listeners = new Set<(active: boolean) => void>();
  ipcRenderer.on(macFullScreenChanged, (_event, active: boolean) => {
    fullScreen = active;
    for (const listener of listeners) listener(active);
  });
  contextBridge.exposeInMainWorld('ovelleWindowChrome', {
    onFullScreenChange: (listener: (active: boolean) => void) => {
      listeners.add(listener);
      listener(fullScreen);
      return () => { listeners.delete(listener); };
    },
  });
}
contextBridge.exposeInMainWorld('ovelleDownloads', {
  loadReleases: () => ipcRenderer.invoke(downloadChannels.releases),
  emailLink: (email: string) => ipcRenderer.invoke(downloadChannels.email, email),
});
contextBridge.exposeInMainWorld('ovelleWorkflow', {
  signIn: () => ipcRenderer.invoke(workflowChannels.signIn),
  signOut: () => ipcRenderer.invoke(workflowChannels.signOut),
  status: () => ipcRenderer.invoke(workflowChannels.status),
  request: (input: unknown) => ipcRenderer.invoke(workflowChannels.request, input),
});
