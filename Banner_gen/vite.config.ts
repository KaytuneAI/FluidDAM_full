import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Production: /bannergen/, Development: /
  base: mode === 'production' ? '/bannergen/' : '/',
  server: {
    port: 5174,
    host: true,
  },
}))

