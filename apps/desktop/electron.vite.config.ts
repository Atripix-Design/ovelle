import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const liveHost = process.env.OVELLE_LIVE_HOST
if (liveHost && !/^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/.test(liveHost)) {
  throw new Error('OVELLE_LIVE_HOST must be a Tailscale MagicDNS hostname')
}
const liveUrl = liveHost ? `https://${liveHost}:18767/` : ''

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], define: { __OVELLE_LIVE_URL__: JSON.stringify(liveUrl) } },
  preload: { build: { rollupOptions: { output: { format: "cjs", entryFileNames: "index.cjs" } } } },
  renderer: { plugins: [react(), tailwindcss()], server: { host: liveHost ? '127.0.0.1' : '0.0.0.0', port:5175, strictPort:true, ...(liveHost ? { allowedHosts: [liveHost], hmr: { host: liveHost, protocol: 'wss', clientPort: 18767 } } : {}), proxy:{'/api':'http://127.0.0.1:8790'} } },
})
