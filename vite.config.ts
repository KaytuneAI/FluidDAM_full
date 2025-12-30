import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Production: /, Development: /
  base: command === 'build' ? '/' : '/',
  server: {
    port: 3000,
    host: true,
    proxy: {
      // 代理 BannerGen 应用
      '/bannergen': {
        target: 'http://localhost:5173',
        changeOrigin: true,
        rewrite: (path) => {
          // 去掉 /bannergen 前缀，保留后续路径
          const newPath = path.replace(/^\/bannergen/, '') || '/';
          console.log('[Vite Proxy] BannerGen rewrite:', path, '->', newPath);
          return newPath;
        },
        ws: true, // 支持 WebSocket
      },
      // 代理 SpotStudio 应用
      '/spotstudio': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        rewrite: (path) => {
          // 去掉 /spotstudio 前缀，保留后续路径
          const newPath = path.replace(/^\/spotstudio/, '') || '/';
          console.log('[Vite Proxy] SpotStudio rewrite:', path, '->', newPath);
          return newPath;
        },
        ws: true,
      },
      // 代理 API 请求到统一后端
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // 不重写路径，直接转发 /api/xxx
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
}))









