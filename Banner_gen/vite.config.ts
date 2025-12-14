import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

// 获取当前文件所在目录
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // 自定义插件：处理 /spotstudio 路径，返回 FluidDAM 的 HTML 并重写资源路径
    {
      name: 'spotstudio-html-plugin',
      configureServer(server) {
        // 在 Vite 的内置中间件之前运行，处理路径重写
        return () => {
          server.middlewares.use((req, res, next) => {
            const url = req.url?.split('?')[0] || '' // 移除查询参数
            const query = req.url?.includes('?') ? '?' + req.url.split('?')[1] : ''
            
            // 如果请求 /spotstudio 或 /spotstudio/，返回 FluidDAM 的 index.html
            if (url === '/spotstudio' || url === '/spotstudio/') {
              const fluidDAMHtmlPath = path.resolve(__dirname, '../FluidDAM/index.html')
              if (fs.existsSync(fluidDAMHtmlPath)) {
                let html = fs.readFileSync(fluidDAMHtmlPath, 'utf-8')
                // 重写 HTML 中的资源路径：/src/ -> /FluidDAM/src/
                html = html.replace(/src="\/src\//g, 'src="/FluidDAM/src/')
                html = html.replace(/href="\/src\//g, 'href="/FluidDAM/src/')
                html = html.replace(/src='\/src\//g, "src='/FluidDAM/src/")
                res.setHeader('Content-Type', 'text/html')
                res.end(html)
                return
              }
            }
            
            // 如果请求 /spotstudio/ 下的资源，重写路径到 /FluidDAM/
            if (url.startsWith('/spotstudio/')) {
              req.url = url.replace(/^\/spotstudio/, '/FluidDAM') + query
            }
            
            next()
          })
        }
      },
      // 处理模块解析，将 /FluidDAM/src/ 路径映射到实际文件
      resolveId(id) {
        if (id.startsWith('/FluidDAM/src/') || id.startsWith('/FluidDAM/')) {
          // 将 /FluidDAM/src/main.jsx 转换为实际文件路径
          const relativePath = id.replace(/^\/FluidDAM/, '')
          const actualPath = path.resolve(__dirname, '..', 'FluidDAM', relativePath.substring(1))
          if (fs.existsSync(actualPath)) {
            return actualPath
          }
        }
        return null
      },
      // 处理文件加载
      load(id) {
        // 如果 id 是 FluidDAM 的实际文件路径，加载它
        if (id.includes('FluidDAM') && fs.existsSync(id) && fs.statSync(id).isFile()) {
          return fs.readFileSync(id, 'utf-8')
        }
        return null
      },
    },
  ],
  // Production: /bannergen/, Development: /
  base: command === 'build' ? '/bannergen/' : '/',
  server: {
    port: 5174,
    host: true,
    fs: {
      // 允许访问父目录的文件（FluidDAM）
      allow: ['..'],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../src/shared'),
      // 添加 FluidDAM 的别名，方便引用
      '@fluiddam': path.resolve(__dirname, '../FluidDAM/src'),
    },
  },
  build: {
    rollupOptions: {
      // 多页面应用配置
      input: {
        main: path.resolve(__dirname, 'index.html'),
        spotstudio: path.resolve(__dirname, '../FluidDAM/index.html'),
      },
    },
  },
}))

