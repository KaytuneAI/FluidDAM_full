import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Production: /bannergen/, Development: /
  base: command === 'build' ? '/bannergen/' : '/',
  server: {
    port: 5174,
    host: true,
  },
}))

