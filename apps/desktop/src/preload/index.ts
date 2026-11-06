import { contextBridge, ipcRenderer } from 'electron';
import { downloadChannels } from '../contracts/downloads.js';
contextBridge.exposeInMainWorld('ovelleDownloads', {
  loadReleases: () => ipcRenderer.invoke(downloadChannels.releases),
  emailLink: (email: string) => ipcRenderer.invoke(downloadChannels.email, email),
});
