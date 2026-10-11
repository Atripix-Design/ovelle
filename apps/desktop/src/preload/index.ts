import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('ovelleDownloads', {
  loadReleases: () => ipcRenderer.invoke('ovelle:releases'),
  emailLink: (email: string) => ipcRenderer.invoke('ovelle:download-email', email),
});
