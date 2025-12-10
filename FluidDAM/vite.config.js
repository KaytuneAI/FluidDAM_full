import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({


  // 保持这个路径判断不变

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

    sourcemap: true, // 保持开启，万一报错方便看具体是哪个库
    outDir: 'dist',
    
    // ❌❌❌ 重点：删除了 rollupOptions 的手动分包代码 ❌❌❌
    // 不要手动拆分 react 和 vendor，让 Vite 自动处理引用顺序

  },
}))