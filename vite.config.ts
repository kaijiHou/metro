import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {sharedFootprintPlugin} from './server/footprint-server.mjs'

export default defineConfig({ plugins: [react(),sharedFootprintPlugin()], optimizeDeps: { include: ['dexie', 'jszip'] }, server: {fs: {deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local-recovery/**', '**/data/*.sqlite*', '**/validation/shared-storage/**']}} })
