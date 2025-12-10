import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Production: /spotstudio/, Development: /
  base: command === 'build' ? '/spotstudio/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['liquora.cn'],
  },
  build: {
    chunkSizeWarningLimit: 2000, // 放宽限制
    sourcemap: true,             // 方便以后需要定位 bundle 位置
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('tldraw')) return 'tldraw'
            if (id.includes('exceljs')) return 'exceljs'
            if (id.includes('jszip')) return 'jszip'
            if (id.includes('fast-xml-parser')) return 'xml-parser'
            if (
              id.includes('react') ||
              id.includes('react-dom') ||
              id.includes('scheduler')
            ) {
              return 'react-vendor'
            }
            return 'vendor'
          }
        },
      },
    },
  },
  // ❌ 把下面几块都删除/注释掉（不要再手动干预 React）
  // resolve: {
  //   alias: {
  //     react: 'react',
  //     'react-dom': 'react-dom',
  //   },
  //   dedupe: ['react', 'react-dom'],
  // },
  // optimizeDeps: {
  //   include: ['react', 'react-dom', 'react/jsx-runtime'],
  // },
  // define: {
  //   'process.env.NODE_ENV': '"production"',
  // },
}))