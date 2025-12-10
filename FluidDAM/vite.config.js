import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/spotstudio/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['liquora.cn'],
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
  resolve: {
    // 这一条反而是有利于防止 “两个 React 副本” 的
    dedupe: ['react', 'react-dom'],
  },
}))