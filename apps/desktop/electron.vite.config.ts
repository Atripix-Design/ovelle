import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { build: { rollupOptions: { output: { format: "cjs", entryFileNames: "index.cjs" } } } },
  renderer: { plugins: [react(), tailwindcss()], server: { host: '0.0.0.0', port:5175, strictPort:true, proxy:{'/api':'http://127.0.0.1:8790'} } },
})
