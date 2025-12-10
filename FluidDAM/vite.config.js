import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: '/', 
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['liquora.cn']
  },
  build: {
    chunkSizeWarningLimit: 2000, // 放宽限制
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // 将 node_modules 中的大依赖包单独打包
          if (id.includes('node_modules')) {
            // tldraw 单独打包（最大的依赖）
            if (id.includes('tldraw')) {
              return 'tldraw';
            }
            // ExcelJS 相关库单独打包
            if (id.includes('exceljs')) {
              return 'exceljs';
            }
            // JSZip 单独打包
            if (id.includes('jszip')) {
              return 'jszip';
            }
            // XML解析器单独打包
            if (id.includes('fast-xml-parser')) {
              return 'xml-parser';
            }
            // React 相关库单独打包
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'react-vendor';
            }
            // 其他 node_modules 中的库
            return 'vendor';
          }
        }
      },
    },
  },
  resolve: {
    alias: {
      'react': 'react',
      'react-dom': 'react-dom'
    },
    dedupe: ['react', 'react-dom']
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime']
  },
  define: {
    'process.env.NODE_ENV': '"production"'
  },
})
