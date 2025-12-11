import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import cors from 'cors'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = 3002 // 使用不同的端口避免与FluidDAM冲突

// 中间件
app.use(cors())
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))

// 创建shares目录
const sharesDir = path.join(__dirname, 'public', 'shares')
if (!fs.existsSync(sharesDir)) {
  fs.mkdirSync(sharesDir, { recursive: true })
}

// 分享配置
const SHARE_CONFIG = {
  maxFiles: 100,           // 最多100个分享文件
  maxStorageMB: 500,       // 最多500MB存储（zip文件可能较大）
  expireHours: 24,         // 24小时过期
  cleanupInterval: 2 * 60 * 60 * 1000 // 每2小时清理一次
}

// 配置multer用于文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, sharesDir)
  },
  filename: (req, file, cb) => {
    const shareId = `banner-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    // 将shareId存储到req对象中
    req.shareId = shareId
    cb(null, `${shareId}.zip`)
  }
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB限制
  }
})

// 自动清理过期分享文件
function cleanupExpiredShares() {
  try {
    console.log(`[${new Date().toISOString()}] 开始清理Banner分享文件...`)
    
    const files = fs.readdirSync(sharesDir)
    const now = Date.now()
    const expireTime = SHARE_CONFIG.expireHours * 60 * 60 * 1000
    
    let totalSize = 0
    let fileCount = 0
    let deletedCount = 0
    
    files.forEach(file => {
      if (file.endsWith('.zip')) {
        const filePath = path.join(sharesDir, file)
        const stats = fs.statSync(filePath)
        const fileAge = now - stats.mtime.getTime()
        
        // 检查是否过期
        if (fileAge > expireTime) {
          fs.unlinkSync(filePath)
          deletedCount++
          console.log(`删除过期分享文件: ${file} (创建于 ${new Date(stats.mtime).toISOString()})`)
          return
        }
        
        totalSize += stats.size
        fileCount++
      }
    })
    
    // 如果超过限制，删除最旧的文件
    if (fileCount > SHARE_CONFIG.maxFiles || totalSize > SHARE_CONFIG.maxStorageMB * 1024 * 1024) {
      console.log(`超过限制，开始删除旧文件 (文件数: ${fileCount}/${SHARE_CONFIG.maxFiles}, 大小: ${(totalSize / 1024 / 1024).toFixed(2)}MB/${SHARE_CONFIG.maxStorageMB}MB)`)
      
      const sortedFiles = files
        .filter(file => file.endsWith('.zip'))
        .map(file => ({
          name: file,
          path: path.join(sharesDir, file),
          mtime: fs.statSync(path.join(sharesDir, file)).mtime
        }))
        .sort((a, b) => a.mtime - b.mtime)
      
      // 删除最旧的文件直到满足限制
      for (const file of sortedFiles) {
        if (fileCount <= SHARE_CONFIG.maxFiles && totalSize <= SHARE_CONFIG.maxStorageMB * 1024 * 1024) {
          break
        }
        
        const stats = fs.statSync(file.path)
        fs.unlinkSync(file.path)
        totalSize -= stats.size
        fileCount--
        deletedCount++
        console.log(`删除旧分享文件: ${file.name} (创建于 ${new Date(stats.mtime).toISOString()})`)
      }
    }
    
    console.log(`Banner分享文件清理完成: 删除了${deletedCount}个文件, 剩余${fileCount}个文件, ${(totalSize / 1024 / 1024).toFixed(2)}MB`)
  } catch (error) {
    console.error('清理分享文件时出错:', error)
  }
}

// 启动时清理一次，然后定期清理
cleanupExpiredShares()
setInterval(cleanupExpiredShares, SHARE_CONFIG.cleanupInterval)

// 上传zip文件并生成分享链接
app.post('/api/share-banner-zip', upload.single('zipFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '未上传文件' })
    }
    
    const shareId = req.shareId || (req.file ? req.file.filename.replace('.zip', '') : null)
    
    if (!shareId) {
      return res.status(400).json({ success: false, message: '无法生成分享ID' })
    }
    
    // 生成分享链接 - 支持Nginx反向代理
    const protocol = req.protocol
    const host = req.get('host')
    
    // 检查是否通过Nginx反向代理访问
    const xForwardedHost = req.get('x-forwarded-host')
    const xForwardedProto = req.get('x-forwarded-proto')
    
    let shareUrl
    if (xForwardedHost && xForwardedProto) {
      // 使用Nginx反向代理的地址
      shareUrl = `${xForwardedProto}://${xForwardedHost}/bannergen/api/get-share/${shareId}`
    } else {
      // 直接访问，使用当前主机
      const frontendHost = host.replace(':3002', ':5174') // Banner_gen可能使用5174端口
      shareUrl = `${protocol}://${frontendHost}/api/get-share/${shareId}`
    }
    
    console.log(`Banner ZIP分享成功: ${shareId}, 文件大小: ${(req.file.size / 1024 / 1024).toFixed(2)}MB`)
    
    res.json({
      success: true,
      shareId: shareId,
      shareUrl: shareUrl,
      downloadUrl: shareUrl, // 下载链接和分享链接相同
      message: '分享成功',
      expiresAt: new Date(Date.now() + SHARE_CONFIG.expireHours * 60 * 60 * 1000).toISOString()
    })
  } catch (error) {
    console.error('分享Banner ZIP时出错:', error)
    res.status(500).json({ success: false, message: '分享失败', error: error.message })
  }
})

// 获取分享的zip文件
app.get('/api/get-share/:shareId', (req, res) => {
  try {
    const shareId = req.params.shareId
    const fileName = `${shareId}.zip`
    const filePath = path.join(sharesDir, fileName)
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '分享不存在或已过期' })
    }
    
    // 检查是否过期
    const stats = fs.statSync(filePath)
    const now = Date.now()
    const expireTime = SHARE_CONFIG.expireHours * 60 * 60 * 1000
    
    if (now - stats.mtime.getTime() > expireTime) {
      // 删除过期文件
      fs.unlinkSync(filePath)
      return res.status(404).json({ success: false, message: '分享已过期' })
    }
    
    // 设置响应头，让浏览器下载文件
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${shareId}.zip"`)
    
    // 发送文件
    res.sendFile(filePath)
  } catch (error) {
    console.error('获取分享文件时出错:', error)
    res.status(500).json({ success: false, message: '获取分享失败', error: error.message })
  }
})

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Banner_gen API is running' })
})

// 启动服务器
app.listen(PORT, () => {
  console.log(`Banner_gen API服务器运行在端口 ${PORT}`)
  console.log(`分享文件目录: ${sharesDir}`)
})

