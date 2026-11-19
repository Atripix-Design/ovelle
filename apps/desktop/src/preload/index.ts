import { contextBridge, ipcRenderer } from 'electron';
import { downloadChannels } from '../contracts/downloads.js';
import { workflowChannels } from '../contracts/workflow.js';
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
