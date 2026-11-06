/** Closed IPC names shared by main and the sandboxed preload; no native imports. */
export const downloadChannels = Object.freeze({
  releases: 'ovelle:releases',
  email: 'ovelle:download-email',
})
