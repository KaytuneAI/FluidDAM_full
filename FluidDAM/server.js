import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { Signer } from '@volcengine/openapi'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 加载 .env 文件（用于即梦 AI API Key）
// 明确指定 .env 文件路径，确保无论从哪里运行都能找到
const envPath = path.join(__dirname, '.env')
const envResult = dotenv.config({ path: envPath })
if (envResult.error) {
  console.warn('[WARN] 无法加载 .env 文件:', envPath, envResult.error.message)
} else {
  console.log('[INFO] .env 文件加载成功:', envPath)
  // 调试：检查关键环境变量是否加载（不打印实际值）
  const hasAccessKey = !!process.env.VOLC_ACCESSKEY
  const hasSecretKey = !!process.env.VOLC_SECRETKEY
  console.log('[INFO] 环境变量检查: VOLC_ACCESSKEY=' + (hasAccessKey ? '已设置' : '未设置'), 'VOLC_SECRETKEY=' + (hasSecretKey ? '已设置' : '未设置'))
}

const app = express()
const PORT = 3001

// 创建日志目录
const logsDir = path.join(__dirname, 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// 日志配置
const logFile = path.join(logsDir, `server-${new Date().toISOString().split('T')[0]}.log`)
const errorLogFile = path.join(logsDir, `error-${new Date().toISOString().split('T')[0]}.log`)

// 日志函数 - 友好格式
function log(level, message, data = null) {
  const timestamp = new Date().toISOString()
  const time = new Date().toLocaleString('zh-CN')
  
  // 创建友好的日志格式
  let friendlyEntry = `[${time}] [${level}] ${message}`
  
  if (data) {
    // 格式化数据为更友好的格式
    if (typeof data === 'object') {
      const friendlyData = formatLogData(data)
      if (friendlyData) {
        friendlyEntry += `\n    ${friendlyData}`
      }
    } else {
      friendlyEntry += `\n    数据: ${data}`
    }
  }
  
  friendlyEntry += '\n'
  
  // 输出到控制台
  console.log(friendlyEntry.trim())
  
  // 写入日志文件
  fs.appendFileSync(logFile, friendlyEntry)
  
  // 错误级别写入错误日志
  if (level === 'ERROR') {
    fs.appendFileSync(errorLogFile, friendlyEntry)
  }
}

// 格式化日志数据为友好格式
function formatLogData(data) {
  const lines = []
  
  if (data.port) {
    lines.push(`端口: ${data.port}`)
  }
  if (data.logsDir) {
    lines.push(`日志目录: ${data.logsDir}`)
  }
  if (data.fileName) {
    lines.push(`文件名: ${data.fileName}`)
  }
  if (data.totalImages !== undefined) {
    lines.push(`图片总数: ${data.totalImages}`)
  }
  if (data.shareId) {
    lines.push(`分享ID: ${data.shareId}`)
  }
  if (data.shareUrl) {
    lines.push(`分享链接: ${data.shareUrl}`)
  }
  if (data.dataSize) {
    lines.push(`数据大小: ${formatBytes(data.dataSize)}`)
  }
  if (data.duration) {
    lines.push(`处理时间: ${data.duration}`)
  }
  if (data.status) {
    lines.push(`状态码: ${data.status}`)
  }
  if (data.ip) {
    lines.push(`IP地址: ${data.ip}`)
  }
  if (data.userAgent) {
    lines.push(`浏览器: ${data.userAgent.split(' ')[0]}`)
  }
  if (data.error) {
    lines.push(`错误信息: ${data.error}`)
  }
  if (data.stack) {
    lines.push(`错误堆栈: ${data.stack.split('\n')[0]}`)
  }
  
  return lines.length > 0 ? lines.join(' | ') : null
}

// 格式化字节大小
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now()
  
  // 记录请求 - 改进IP地址获取
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
                   (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                   req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown'
  
  log('INFO', `Request: ${req.method} ${req.url}`, {
    ip: clientIP,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer')
  })
  
  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - start
    const status = res.statusCode
    
    if (status >= 400) {
      log('ERROR', `Response: ${req.method} ${req.url} - ${status}`, {
        duration: `${duration}ms`,
        status: status
      })
    } else {
      log('INFO', `Response: ${req.method} ${req.url} - ${status}`, {
        duration: `${duration}ms`,
        status: status
      })
    }
  })
  
  next()
})

// CORS中间件
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
})

// 中间件
app.use(express.json({ limit: '100mb' })) // 增加JSON解析限制到100MB
app.use(express.urlencoded({ limit: '100mb', extended: true })) // 增加URL编码限制
app.use(express.static('public'))
app.use(express.static('.')) // 添加当前目录作为静态文件服务

// 错误处理中间件
app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    log('ERROR', '请求体过大', { 
      url: req.url, 
      method: req.method,
      contentLength: req.get('content-length'),
      error: error.message 
    })
    return res.status(413).json({ 
      success: false, 
      error: '请求体过大，请减少数据大小后重试',
      details: 'Request entity too large'
    })
  }
  next(error)
})

// 创建分享文件夹
const sharesDir = path.join(__dirname, 'public', 'shares')
if (!fs.existsSync(sharesDir)) {
  fs.mkdirSync(sharesDir, { recursive: true })
}

// 分享配置
const SHARE_CONFIG = {
  maxFiles: 100,           // 最多100个分享文件
  maxStorageMB: 200,       // 最多200MB存储
  expireHours: 24,         // 24小时过期
  cleanupInterval: 2 * 60 * 60 * 1000 // 每2小时清理一次
};

// 自动清理过期分享文件
function cleanupExpiredShares() {
  try {
    console.log(`[${new Date().toISOString()}] 开始清理分享文件...`);
    
    const files = fs.readdirSync(sharesDir);
    const now = Date.now();
    const expireTime = SHARE_CONFIG.expireHours * 60 * 60 * 1000;
    
    let totalSize = 0;
    let fileCount = 0;
    let deletedCount = 0;
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const filePath = path.join(sharesDir, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtime.getTime();
        
        // 检查是否过期
        if (fileAge > expireTime) {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`删除过期分享文件: ${file} (创建于 ${new Date(stats.mtime).toISOString()})`);
          return;
        }
        
        totalSize += stats.size;
        fileCount++;
      }
    });
    
    // 如果超过限制，删除最旧的文件
    if (fileCount > SHARE_CONFIG.maxFiles || totalSize > SHARE_CONFIG.maxStorageMB * 1024 * 1024) {
      console.log(`超过限制，开始删除旧文件 (文件数: ${fileCount}/${SHARE_CONFIG.maxFiles}, 大小: ${(totalSize / 1024 / 1024).toFixed(2)}MB/${SHARE_CONFIG.maxStorageMB}MB)`);
      
      const sortedFiles = files
        .filter(file => file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(sharesDir, file),
          mtime: fs.statSync(path.join(sharesDir, file)).mtime
        }))
        .sort((a, b) => a.mtime - b.mtime);
      
      // 删除最旧的文件直到满足限制
      for (const file of sortedFiles) {
        if (fileCount <= SHARE_CONFIG.maxFiles && totalSize <= SHARE_CONFIG.maxStorageMB * 1024 * 1024) {
          break;
        }
        
        const stats = fs.statSync(file.path);
        fs.unlinkSync(file.path);
        totalSize -= stats.size;
        fileCount--;
        deletedCount++;
        console.log(`删除旧分享文件: ${file.name} (创建于 ${new Date(stats.mtime).toISOString()})`);
      }
    }
    
    console.log(`分享文件清理完成: 删除了${deletedCount}个文件, 剩余${fileCount}个文件, ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
  } catch (error) {
    console.error('清理分享文件时出错:', error);
  }
}

// 启动时清理一次，然后每24小时清理一次
cleanupExpiredShares();
setInterval(cleanupExpiredShares, SHARE_CONFIG.cleanupInterval);

// 保存图片数据到JSON文件
app.post('/api/save-image-data', (req, res) => {
  try {
    const imageData = req.body
    const databasePath = path.join(__dirname, 'public', 'images-database.json')
    
    // 读取现有数据
    let database = { images: [], lastUpdated: "", totalImages: 0 }
    if (fs.existsSync(databasePath)) {
      const fileContent = fs.readFileSync(databasePath, 'utf8')
      database = JSON.parse(fileContent)
    }
    
    // 添加新图片数据
    database.images.push(imageData)
    database.lastUpdated = new Date().toISOString()
    database.totalImages = database.images.length
    
    // 保存到文件
    fs.writeFileSync(databasePath, JSON.stringify(database, null, 2))
    
    log('INFO', '图片数据已保存到文件', { fileName: imageData.fileName, totalImages: database.totalImages })
    res.json({ success: true, message: '数据保存成功', totalImages: database.totalImages })
  } catch (error) {
    log('ERROR', '保存数据时出错', { error: error.message, stack: error.stack })
    res.status(500).json({ success: false, message: '保存失败', error: error.message })
  }
})

// 获取所有图片数据
app.get('/api/get-image-data', (req, res) => {
  try {
    const databasePath = path.join(__dirname, 'public', 'images-database.json')
    
    if (fs.existsSync(databasePath)) {
      const fileContent = fs.readFileSync(databasePath, 'utf8').trim()
      
      // 检查文件是否为空
      if (!fileContent) {
        console.log('images-database.json 文件为空，返回默认数据')
        res.json({ images: [], lastUpdated: "", totalImages: 0 })
        return
      }
      
      const database = JSON.parse(fileContent)
      res.json(database)
    } else {
      console.log('images-database.json 文件不存在，返回默认数据')
      res.json({ images: [], lastUpdated: "", totalImages: 0 })
    }
  } catch (error) {
    console.error('读取数据时出错:', error)
    // 如果JSON解析失败，返回默认数据而不是错误
    res.json({ images: [], lastUpdated: "", totalImages: 0 })
  }
})

// 分享画布 - 上传画布数据并生成分享链接
app.post('/api/share-canvas', (req, res) => {
  try {
    const canvasData = req.body
    
    // 生成唯一ID
    const shareId = `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const fileName = `${shareId}.json`
    const filePath = path.join(sharesDir, fileName)
    
    // 添加分享元数据
    const shareData = {
      ...canvasData,
      shareId: shareId,
      sharedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SHARE_CONFIG.expireHours * 60 * 60 * 1000).toISOString()
    }
    
    // 保存分享文件
    fs.writeFileSync(filePath, JSON.stringify(shareData, null, 2))
    
    // 生成分享链接 - 支持Nginx反向代理
    const protocol = req.protocol;
    const host = req.get('host');
    
    // 检查是否通过Nginx反向代理访问
    const xForwardedHost = req.get('x-forwarded-host');
    const xForwardedProto = req.get('x-forwarded-proto');
    
    let shareUrl;
    if (xForwardedHost && xForwardedProto) {
      // 使用Nginx反向代理的地址
      shareUrl = `${xForwardedProto}://${xForwardedHost}/?share=${shareId}`;
    } else {
      // 直接访问，动态获取前端端口
      let frontendPort = '5173';
      const referer = req.get('referer');
      if (referer) {
        try {
          const refererUrl = new URL(referer);
          frontendPort = refererUrl.port || '5173';
        } catch (e) {
          // 如果解析失败，使用默认端口
        }
      }
      
      const frontendHost = host.replace(':3001', `:${frontendPort}`);
      shareUrl = `${protocol}://${frontendHost}/?share=${shareId}`;
    }
    
    log('INFO', '画布分享成功', { shareId, shareUrl, dataSize: JSON.stringify(canvasData).length })
    
    res.json({ 
      success: true, 
      shareId: shareId,
      shareUrl: shareUrl,
      message: '分享成功' 
    })
  } catch (error) {
    log('ERROR', '分享画布时出错', { error: error.message, stack: error.stack, canvasDataSize: JSON.stringify(canvasData).length })
    res.status(500).json({ success: false, message: '分享失败', error: error.message })
  }
})

// 获取分享的画布数据
app.get('/api/get-share/:shareId', (req, res) => {
  try {
    const shareId = req.params.shareId
    const fileName = `${shareId}.json`
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
    
    // 读取分享数据
    const fileContent = fs.readFileSync(filePath, 'utf8')
    const shareData = JSON.parse(fileContent)
    
    res.json({ success: true, data: shareData })
  } catch (error) {
    console.error('获取分享数据时出错:', error)
    res.status(500).json({ success: false, message: '获取分享失败', error: error.message })
  }
})

// 手动清理分享文件 (管理员接口)
app.post('/api/cleanup-shares', (req, res) => {
  try {
    console.log('手动触发分享文件清理...');
    cleanupExpiredShares();
    res.json({ success: true, message: '清理任务已执行' });
  } catch (error) {
    console.error('手动清理失败:', error);
    res.status(500).json({ success: false, message: '清理失败', error: error.message });
  }
});

// 获取分享文件统计信息
app.get('/api/shares-stats', (req, res) => {
  try {
    const files = fs.readdirSync(sharesDir);
    const now = Date.now();
    const expireTime = SHARE_CONFIG.expireHours * 60 * 60 * 1000;
    
    let totalSize = 0;
    let fileCount = 0;
    let expiredCount = 0;
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const filePath = path.join(sharesDir, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtime.getTime();
        
        if (fileAge > expireTime) {
          expiredCount++;
        } else {
          totalSize += stats.size;
          fileCount++;
        }
      }
    });
    
    res.json({
      success: true,
      stats: {
        totalFiles: fileCount + expiredCount,
        activeFiles: fileCount,
        expiredFiles: expiredCount,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        maxFiles: SHARE_CONFIG.maxFiles,
        maxSizeMB: SHARE_CONFIG.maxStorageMB,
        expireHours: SHARE_CONFIG.expireHours,
        cleanupIntervalHours: SHARE_CONFIG.cleanupInterval / (60 * 60 * 1000)
      }
    });
  } catch (error) {
    console.error('获取统计信息失败:', error);
    res.status(500).json({ success: false, message: '获取统计信息失败', error: error.message });
  }
});

// 远程日志查看API
app.get('/api/logs', (req, res) => {
  try {
    const logType = req.query.type || 'server';
    const lines = parseInt(req.query.lines) || 100;
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const search = req.query.search || '';
    const format = req.query.format || 'friendly'; // 新增格式参数
    
    const logFile = path.join(logsDir, `${logType}-${date}.log`);
    
    if (!fs.existsSync(logFile)) {
      return res.json({ 
        success: false, 
        message: `日志文件不存在: ${logType}-${date}.log`,
        availableFiles: fs.readdirSync(logsDir).filter(f => f.endsWith('.log'))
      });
    }
    
    let content = fs.readFileSync(logFile, 'utf8');
    let logLines = content.split('\n').filter(line => line.trim());
    
    // 如果指定了搜索条件
    if (search) {
      logLines = logLines.filter(line => 
        line.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    // 限制返回行数
    if (lines > 0) {
      logLines = logLines.slice(-lines);
    }
    
    // 如果请求友好格式，转换日志
    if (format === 'friendly') {
      logLines = logLines.map(line => convertLogLineToFriendly(line));
    }
    
    res.json({
      success: true,
      logs: logLines,
      totalLines: content.split('\n').length,
      filteredLines: logLines.length,
      file: path.basename(logFile),
      date: date,
      search: search,
      format: format
    });
  } catch (error) {
    log('ERROR', '获取日志时出错', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: error.message });
  }
});

// 转换日志行为友好格式
function convertLogLineToFriendly(line) {
  // 解析原始日志格式
  const timestampMatch = line.match(/\[([^\]]+)\]/);
  const levelMatch = line.match(/\[([A-Z]+)\]/);
  const messageMatch = line.match(/\]\s+(.+?)(?:\s+\|.*)?$/);
  
  if (!timestampMatch || !levelMatch || !messageMatch) {
    return line; // 如果无法解析，返回原行
  }
  
  const timestamp = timestampMatch[1];
  const level = levelMatch[1];
  const message = messageMatch[1];
  
  // 转换时间格式
  const friendlyTime = new Date(timestamp).toLocaleString('zh-CN');
  
  // 创建友好格式
  let friendlyLine = `[${friendlyTime}] [${level}] ${message}`;
  
  // 解析数据部分
  const dataMatch = line.match(/\|\s*Data:\s*(.+)$/);
  if (dataMatch) {
    try {
      const data = JSON.parse(dataMatch[1]);
      const friendlyData = formatLogData(data);
      if (friendlyData) {
        friendlyLine += `\n    ${friendlyData}`;
      }
    } catch (e) {
      // 如果JSON解析失败，保留原始数据
      friendlyLine += `\n    数据: ${dataMatch[1]}`;
    }
  }
  
  return friendlyLine;
}

// 获取日志统计信息
app.get('/api/logs/stats', (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const serverLogFile = path.join(logsDir, `server-${date}.log`);
    const errorLogFile = path.join(logsDir, `error-${date}.log`);
    
    let stats = {
      date: date,
      serverLog: {
        exists: fs.existsSync(serverLogFile),
        lines: 0,
        size: 0
      },
      errorLog: {
        exists: fs.existsSync(errorLogFile),
        lines: 0,
        size: 0
      },
      shareStats: {
        success: 0,
        failed: 0,
        successRate: 0
      }
    };
    
    // 统计服务器日志
    if (stats.serverLog.exists) {
      const content = fs.readFileSync(serverLogFile, 'utf8');
      stats.serverLog.lines = content.split('\n').length;
      stats.serverLog.size = fs.statSync(serverLogFile).size;
      
      // 统计分享相关数据
      const shareSuccess = (content.match(/画布分享成功/g) || []).length;
      const shareFailed = (content.match(/分享画布时出错/g) || []).length;
      
      stats.shareStats.success = shareSuccess;
      stats.shareStats.failed = shareFailed;
      stats.shareStats.successRate = shareSuccess + shareFailed > 0 
        ? Math.round((shareSuccess / (shareSuccess + shareFailed)) * 100) 
        : 0;
    }
    
    // 统计错误日志
    if (stats.errorLog.exists) {
      const content = fs.readFileSync(errorLogFile, 'utf8');
      stats.errorLog.lines = content.split('\n').length;
      stats.errorLog.size = fs.statSync(errorLogFile).size;
    }
    
    res.json({ success: true, stats });
  } catch (error) {
    log('ERROR', '获取日志统计时出错', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取可用的日志文件列表
app.get('/api/logs/files', (req, res) => {
  try {
    const files = fs.readdirSync(logsDir)
      .filter(file => file.endsWith('.log'))
      .map(file => {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime,
          type: file.startsWith('server-') ? 'server' : 
                file.startsWith('error-') ? 'error' : 'other'
        };
      })
      .sort((a, b) => b.modified - a.modified);
    
    res.json({ success: true, files });
  } catch (error) {
    log('ERROR', '获取日志文件列表时出错', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: error.message });
  }
});

// 注意：分享链接现在直接指向前端应用，不再需要重定向路由

// 即梦 AI 图片生成代理端点（解决 CORS 问题）
// 优先使用 ModelArk 体系（即梦 4.0），如果没有配置则回退到 req_key 体系
app.post('/api/jimeng-ai/generate', async (req, res) => {
  try {
    const { prompt, imageUrl, imageBase64, width, height, style, negativePrompt, mode } = req.body

    // 关键调试日志：检查后端接收到的原始参数
    // 使用 console.log 直接输出，确保能看到详细数据
    console.log('=== 后端接收到的原始请求参数 ===')
    console.log('hasPrompt:', !!prompt)
    console.log('promptLength:', prompt ? prompt.length : 0)
    console.log('hasImageUrl:', !!imageUrl)
    console.log('imageUrlType:', imageUrl ? typeof imageUrl : 'none')
    console.log('imageUrlValue:', imageUrl ? (imageUrl.substring(0, 100) + (imageUrl.length > 100 ? '...' : '')) : 'none')
    console.log('hasImageBase64:', !!imageBase64)
    console.log('imageBase64Type:', imageBase64 ? typeof imageBase64 : 'none')
    console.log('imageBase64Length:', imageBase64 ? imageBase64.length : 0)
    console.log('imageBase64Prefix:', imageBase64 ? (imageBase64.substring(0, 100) + '...') : 'none')
    console.log('mode:', mode)
    console.log('allBodyKeys:', Object.keys(req.body))
    console.log('req.body:', JSON.stringify({
      prompt: prompt ? prompt.substring(0, 50) + '...' : null,
      hasImageUrl: !!imageUrl,
      hasImageBase64: !!imageBase64,
      imageBase64Length: imageBase64 ? imageBase64.length : 0,
      mode: mode
    }, null, 2))
    log('INFO', '后端接收到的原始请求参数', {
      hasPrompt: !!prompt,
      promptLength: prompt ? prompt.length : 0,
      hasImageUrl: !!imageUrl,
      hasImageBase64: !!imageBase64,
      imageBase64Length: imageBase64 ? imageBase64.length : 0,
      mode: mode
    })

    if (!prompt) {
      return res.status(400).json({ success: false, error: '提示词不能为空' })
    }

    // ============================================
    // 使用 req_key 体系（即梦 4.0）
    // 根据客服确认：4.0 i2i 和 t2i 使用相同的 req_key = jimeng_t2i_v40
    // 区别仅在于是否有 image_base64 字段
    // ============================================

    // 从环境变量获取火山引擎配置（优先使用规范的环境变量名）
    // 注意：VITE_ 前缀的环境变量不应该在后端使用（它们是前端专用的），这里保留仅为向后兼容
    // 使用 trim() 避免 .env 文件末尾空格导致签名不一致
    const accessKeyId = (process.env.VOLC_ACCESSKEY || process.env.VOLCENGINE_ACCESS_KEY_ID || process.env.VITE_JIMENG_AI_API_KEY || '').trim()
    const secretKey = (process.env.VOLC_SECRETKEY || process.env.VOLCENGINE_SECRET_ACCESS_KEY || process.env.VITE_JIMENG_AI_API_SECRET || '').trim()
    const baseUrl = process.env.VITE_JIMENG_AI_BASE_URL || process.env.JIMENG_AI_BASE_URL || 'https://visual.volcengineapi.com'
    const region = process.env.VOLC_REGION || process.env.VOLCENGINE_REGION || 'cn-north-1' // 默认使用华北1区
    // 调试信息：检查环境变量加载情况（仅在开发环境或调试时输出）
    if (process.env.NODE_ENV !== 'production') {
      const envCheck = {
        VOLC_ACCESSKEY: !!process.env.VOLC_ACCESSKEY,
        VOLCENGINE_ACCESS_KEY_ID: !!process.env.VOLCENGINE_ACCESS_KEY_ID,
        VITE_JIMENG_AI_API_KEY: !!process.env.VITE_JIMENG_AI_API_KEY,
        VOLC_SECRETKEY: !!process.env.VOLC_SECRETKEY,
        VOLCENGINE_SECRET_ACCESS_KEY: !!process.env.VOLCENGINE_SECRET_ACCESS_KEY,
        VITE_JIMENG_AI_API_SECRET: !!process.env.VITE_JIMENG_AI_API_SECRET,
        envPath: path.join(__dirname, '.env'),
        resolvedAccessKey: !!accessKeyId,
        resolvedSecretKey: !!secretKey
      }
      console.log('[DEBUG] 环境变量检查:', JSON.stringify(envCheck, null, 2))
    }

    if (!accessKeyId || !secretKey) {
      log('ERROR', '火山引擎 API Key 或 Secret 未配置', {
        hasAccessKey: !!accessKeyId,
        hasSecretKey: !!secretKey,
        envPath: path.join(__dirname, '.env'),
        availableEnvKeys: Object.keys(process.env).filter(k => k.includes('VOLC') || k.includes('JIMENG'))
      })
      return res.status(500).json({ 
        success: false, 
        error: '火山引擎 API Key 或 Secret 未配置，请在 .env 文件中设置 VOLC_ACCESSKEY 和 VOLC_SECRETKEY',
        debug: {
          envPath: path.join(__dirname, '.env'),
          hasAccessKey: !!accessKeyId,
          hasSecretKey: !!secretKey,
          availableKeys: Object.keys(process.env).filter(k => k.includes('VOLC') || k.includes('JIMENG')),
          checkKeys: {
            VOLC_ACCESSKEY: !!process.env.VOLC_ACCESSKEY,
            VOLCENGINE_ACCESS_KEY_ID: !!process.env.VOLCENGINE_ACCESS_KEY_ID,
            VITE_JIMENG_AI_API_KEY: !!process.env.VITE_JIMENG_AI_API_KEY,
            VOLC_SECRETKEY: !!process.env.VOLC_SECRETKEY,
            VOLCENGINE_SECRET_ACCESS_KEY: !!process.env.VOLCENGINE_SECRET_ACCESS_KEY,
            VITE_JIMENG_AI_API_SECRET: !!process.env.VITE_JIMENG_AI_API_SECRET
          }
        }
      })
    }

    // 辅助函数：从 dataURL 中提取纯 base64（移除 data:image/...;base64, 前缀）
    const stripDataUrl = (b64) => {
      if (!b64 || typeof b64 !== 'string') return null
      // 使用正则表达式移除 data:image/jpeg;base64, 或 data:image/png;base64, 等前缀
      return b64.replace(/^data:image\/\w+;base64,/, '')
    }

    // 处理图片输入：支持两种方式
    // 1. imageBase64: 前端直接传入 base64 字符串（dataURL 或纯 base64）
    // 2. imageUrl: 后端下载 URL 并转换为 base64
    let finalImageBase64 = null
    
    // 调试日志：检查接收到的图片参数
    log('INFO', '即梦 AI 接收到的图片参数', {
      hasImageBase64: !!(imageBase64 && typeof imageBase64 === 'string' && imageBase64.length > 50),
      hasImageUrl: !!imageUrl,
      imageBase64Type: imageBase64 ? typeof imageBase64 : 'none',
      imageBase64Length: imageBase64 ? imageBase64.length : 0,
      imageUrlType: imageUrl ? typeof imageUrl : 'none',
      imageUrlPrefix: imageUrl ? (imageUrl.substring(0, 20) + '...') : 'none',
      mode: mode
    })
    
    if (imageBase64 && typeof imageBase64 === 'string' && imageBase64.length > 50) {
      // 前端直接传入的 base64
      finalImageBase64 = stripDataUrl(imageBase64)
      if (!finalImageBase64) {
        return res.status(400).json({ success: false, error: 'imageBase64 格式无效，无法提取纯 base64' })
      }
      log('INFO', '使用 imageBase64 参数', { 
        base64Length: finalImageBase64.length,
        hadPrefix: imageBase64.includes('data:image')
      })
    } else if (imageUrl) {
      // 如果是 base64 dataURL，直接使用
      if (imageUrl.startsWith('data:image')) {
        finalImageBase64 = stripDataUrl(imageUrl)
        if (!finalImageBase64) {
          return res.status(400).json({ success: false, error: 'imageUrl (data URL) 格式无效，无法提取纯 base64' })
        }
        log('INFO', 'imageUrl 是 data URL，已提取 base64', { base64Length: finalImageBase64.length })
      } else if (imageUrl.startsWith('blob:')) {
        // Blob URL：后端无法直接下载，应该由前端转换为 base64 再传递
        log('WARN', '收到 Blob URL，后端无法处理，请前端转换为 base64', { imageUrl: imageUrl.substring(0, 50) + '...' })
        return res.status(400).json({ 
          success: false, 
          error: 'Blob URL 无法在后端处理，请前端先将图片转换为 base64 再传递' 
        })
      } else {
        // 如果是普通 URL，需要先下载并转换为 base64
        try {
          log('INFO', '开始下载图片 URL', { url: imageUrl.substring(0, 100) + '...' })
          const imageResponse = await fetch(imageUrl)
          const imageBlob = await imageResponse.blob()
          const imageBuffer = Buffer.from(await imageBlob.arrayBuffer())
          // 转换为纯 base64（不带 data:image/...;base64, 前缀）
          finalImageBase64 = imageBuffer.toString('base64')
          log('INFO', '图片下载并转换为 base64 成功', { base64Length: finalImageBase64.length })
        } catch (error) {
          log('ERROR', '下载图片失败', { error: error.message, url: imageUrl.substring(0, 100) })
          return res.status(400).json({ success: false, error: '图片下载失败: ' + error.message })
        }
      }
    }
    
    // 判断模式：根据是否有图片和 mode 参数
    // 即梦 4.0：有图 → i2i，无图 → t2i，都使用 req_key = jimeng_t2i_v40
    const hasImage = finalImageBase64 && typeof finalImageBase64 === 'string' && finalImageBase64.length > 50
    const isI2I = hasImage
    
    // 关键调试日志：检查图片处理结果
    console.log('=== 图片处理结果检查 ===')
    console.log('hasImage:', hasImage)
    console.log('isI2I:', isI2I)
    console.log('finalImageBase64Type:', finalImageBase64 ? typeof finalImageBase64 : 'null')
    console.log('finalImageBase64Length:', finalImageBase64 ? finalImageBase64.length : 0)
    console.log('finalImageBase64Exists:', !!finalImageBase64)
    console.log('receivedMode:', mode)
    log('INFO', '图片处理结果检查', {
      hasImage: hasImage,
      isI2I: isI2I,
      finalImageBase64Type: finalImageBase64 ? typeof finalImageBase64 : 'null',
      finalImageBase64Length: finalImageBase64 ? finalImageBase64.length : 0,
      receivedMode: mode
    })
    
    // 构建请求体 - 火山引擎 API 格式（即梦 4.0）
    // 使用 req_key = jimeng_t2i_v40（i2i 和 t2i 共用）
    // 支持自定义 width/height
    const requestBody = {
      req_key: 'jimeng_t2i_v40', // 即梦 4.0，i2i 和 t2i 都用这个
      prompt: prompt,
      width: width && height ? Number(width) : 1024,  // 支持自定义，默认 1024
      height: width && height ? Number(height) : 1024, // 支持自定义，默认 1024
      seed: -1,     // 默认随机
    }

    // 如果有负面提示词
    if (negativePrompt) {
      requestBody.negative_prompt = negativePrompt
    }

    // 如果有风格
    if (style) {
      requestBody.style = style
    }

    // 图生图处理：如果有图片，使用 binary_data_base64 数组格式（与 3.0 一致）
    // 已验证：4.0 版本也支持 binary_data_base64 数组格式
    if (hasImage) {
      // 使用 binary_data_base64 数组格式（与 3.0 版本完全一致）
      requestBody.binary_data_base64 = [finalImageBase64]
      
      log('INFO', '即梦 AI 图生图模式（i2i 4.0）', { 
        mode: 'i2i',
        req_key: requestBody.req_key,
        hasImage: true,
        imageBase64Length: finalImageBase64.length,
        binaryDataBase64IsArray: Array.isArray(requestBody.binary_data_base64),
        note: '使用 jimeng_t2i_v40，binary_data_base64 字段（数组格式）作为参考图，与 3.0 版本一致'
      })
    } else {
      log('INFO', '即梦 AI 文生图模式（t2i 4.0）', { 
        mode: 't2i',
        req_key: requestBody.req_key
      })
    }
    
    // 调试日志：打印最终 payload（不包含敏感信息）
    log('INFO', '即梦 AI 最终 payload（发送给火山）', {
      mode: isI2I ? 'i2i' : 't2i',
      req_key: requestBody.req_key,
      width: requestBody.width,
      height: requestBody.height,
      hasBinaryDataBase64: !!requestBody.binary_data_base64,
      binaryDataBase64FieldExists: 'binary_data_base64' in requestBody,
      binaryDataBase64IsArray: requestBody.binary_data_base64 ? Array.isArray(requestBody.binary_data_base64) : false,
      binaryDataBase64ArrayLength: requestBody.binary_data_base64 && Array.isArray(requestBody.binary_data_base64) ? requestBody.binary_data_base64.length : 0,
      hasImageBase64: !!requestBody.image_base64,
      imageBase64FieldExists: 'image_base64' in requestBody,
      hasNegativePrompt: !!requestBody.negative_prompt,
      hasStyle: !!requestBody.style,
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 100) + '...'
    })
    
    // 额外检查：如果应该是 i2i 但没有图片字段，这是严重错误
    if (isI2I && !requestBody.binary_data_base64 && !requestBody.image_base64) {
      log('ERROR', '严重错误：i2i 模式下 requestBody 中没有图片字段！', {
        isI2I,
        hasImage,
        finalImageBase64Exists: !!finalImageBase64,
        requestBodyKeys: Object.keys(requestBody),
        hasBinaryDataBase64: !!requestBody.binary_data_base64,
        hasImageBase64: !!requestBody.image_base64
      })
    }
    
    // 调试：打印完整的请求体结构（不包含 base64 的内容，只显示是否存在）
    console.log('=== 发送给火山的请求体结构 ===')
    console.log('req_key:', requestBody.req_key)
    console.log('hasBinaryDataBase64:', !!requestBody.binary_data_base64)
    console.log('binaryDataBase64IsArray:', requestBody.binary_data_base64 ? Array.isArray(requestBody.binary_data_base64) : false)
    console.log('binaryDataBase64ArrayLength:', requestBody.binary_data_base64 && Array.isArray(requestBody.binary_data_base64) ? requestBody.binary_data_base64.length : 0)
    if (requestBody.binary_data_base64 && Array.isArray(requestBody.binary_data_base64) && requestBody.binary_data_base64.length > 0) {
      console.log('binaryDataBase64FirstItemLength:', requestBody.binary_data_base64[0].length)
      console.log('binaryDataBase64FirstItemPrefix:', requestBody.binary_data_base64[0].substring(0, 30) + '...')
    }
    console.log('hasImageBase64:', !!requestBody.image_base64)
    console.log('promptLength:', prompt.length)
    console.log('所有字段:', Object.keys(requestBody))

    // 构建火山引擎 API 请求配置
    // 使用 OpenAPI HMAC 签名认证
    const action = 'CVSync2AsyncSubmitTask'
    const version = '2022-08-31'
    
    // Service 名称必须是 'cv'
    const service = 'cv'

    // 解析 Host，用于签名头部
    const urlObj = new URL(baseUrl)
    const host = urlObj.host

    // 构建请求对象（Signer 需要的格式）
    const requestObj = {
      region: region,
      method: 'POST',
      pathname: '/',
      params: {
        Action: action,
        Version: version,
      },
      headers: {
        'Content-Type': 'application/json',
        'Host': host,
      },
      body: JSON.stringify(requestBody),
    }

    // 使用 Signer 生成 HMAC 签名
    const signer = new Signer(requestObj, service)

    // 添加认证头（使用 addAuthorization 方法生成 HMAC-SHA256 签名）
    const credentials = {
      accessKeyId: accessKeyId,
      secretKey: secretKey, // 必须是 secretKey，不是 secretAccessKey
    }
    signer.addAuthorization(credentials)

    // 获取签名后的请求头（包含 X-Date, X-Content-Sha256, Authorization）
    const signedHeaders = requestObj.headers

    // 构建完整的 API URL（查询参数在 URL 中）
    const queryParams = new URLSearchParams({
      Action: action,
      Version: version,
    })
    const apiEndpoint = `${baseUrl}?${queryParams.toString()}`
    
    log('INFO', '调用即梦 AI API - 提交任务', { 
      endpoint: apiEndpoint,
      baseUrl, 
      region,
      action,
      version,
      service,
      host,
      req_key: requestBody.req_key,
      width: requestBody.width,
      height: requestBody.height,
      hasImage: !!(requestBody.binary_data_base64 || requestBody.image_base64),
      promptLength: prompt.length,
      hasNegativePrompt: !!requestBody.negative_prompt
    })
    
    console.log('[Jimeng AI] Request URL:', apiEndpoint)
    console.log('[Jimeng AI] Request Headers:', { ...signedHeaders, Authorization: signedHeaders.Authorization ? '[HMAC-SHA256 Signature]' : 'MISSING' })
    console.log('[Jimeng AI] Action:', action)
    console.log('[Jimeng AI] Version:', version)
    console.log('[Jimeng AI] Service:', service)
    console.log('[Jimeng AI] Host:', host)
    console.log('[Jimeng AI] Credentials check:', { hasAccessKeyId: !!accessKeyId, hasSecretKey: !!secretKey, accessKeyIdLength: accessKeyId ? accessKeyId.length : 0, secretKeyLength: secretKey ? secretKey.length : 0 })
    // 打印最终 payload（不包含 base64 的完整内容，只显示是否存在）
    const logPayload = { ...requestBody }
    if (logPayload.binary_data_base64) {
      logPayload.binary_data_base64 = logPayload.binary_data_base64.map((item, idx) => 
        `[base64 image ${idx + 1}, length: ${item.length}]`
      )
    }
    if (logPayload.image_base64) {
      logPayload.image_base64 = `[base64 image, length: ${logPayload.image_base64.length}]`
    }
    console.log('[Jimeng AI] Request Body:', logPayload)

    // 发送请求到即梦 AI API - 提交任务
    const submitResponse = await fetch(apiEndpoint, {
      method: 'POST',
      headers: signedHeaders,
      body: requestObj.body,
    })

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || '请求失败' }
      }
      log('ERROR', '即梦 AI API 调用失败', { 
        status: submitResponse.status,
        error: errorData.Message || errorData.message || errorData.error || errorText,
        code: errorData.Code || errorData.code,
        requestId: errorData.RequestId || errorData.requestId,
        requestBody: { 
          ...requestBody, 
          binary_data_base64: requestBody.binary_data_base64 ? '[base64 image array]' : undefined,
          image_base64: requestBody.image_base64 ? '[base64 image]' : undefined 
        },
      })
      return res.status(submitResponse.status).json({
        success: false,
        error: errorData.Message || errorData.message || errorData.error || errorText || `HTTP error! status: ${submitResponse.status}`,
        code: errorData.Code || errorData.code,
        requestId: errorData.RequestId || errorData.requestId,
        details: errorData
      })
    }

    const submitData = await submitResponse.json()

    // 检查响应格式 - 火山引擎通常返回 ResponseMetadata 和 Result
    let taskId = null
    if (submitData.ResponseMetadata && submitData.ResponseMetadata.Error) {
      const error = submitData.ResponseMetadata.Error
      log('ERROR', '即梦 AI 提交任务失败', { 
        code: error.Code,
        message: error.Message,
        requestId: submitData.ResponseMetadata.RequestId
      })
      return res.status(400).json({
        success: false,
        error: error.Message || '提交任务失败',
        code: error.Code,
        requestId: submitData.ResponseMetadata.RequestId,
        details: submitData
      })
    }

    // 提取 task_id
    if (submitData.Result && submitData.Result.task_id) {
      taskId = submitData.Result.task_id
    } else if (submitData.task_id) {
      taskId = submitData.task_id
    } else if (submitData.data && submitData.data.task_id) {
      taskId = submitData.data.task_id
    }

    if (!taskId) {
      log('ERROR', '即梦 AI 响应中未找到 task_id', { response: submitData })
      return res.status(500).json({
        success: false,
        error: '提交任务成功但未返回 task_id',
        details: submitData
      })
    }

    log('INFO', '即梦 AI 任务提交成功', { taskId })

    // 轮询获取结果（改进版：区分排队和执行状态）
    const maxPollingAttempts = 60 // 最多 60 次
    const pollingInterval = 2000 // 2 秒间隔    
    // 区分排队和执行状态的超时
    let inQueueStartTime = null // 记录进入排队状态的时间
    let runningStartTime = null // 记录进入执行状态的时间
    const maxQueueWaitTime = 180000 // 排队最大等待时间：3 分钟（180 秒）
    const maxRunningTime = 120000 // 执行最大等待时间：2 分钟（120 秒）
    
    let lastStatus = 'unknown' // 记录上一次的状态
    for (let attempt = 1; attempt <= maxPollingAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollingInterval))

      // 构建查询结果的请求
      const getResultRequestObj = {
        region: region,
        method: 'POST',
        pathname: '/',
        params: {
          Action: 'CVSync2AsyncGetResult',
          Version: version,
        },
        headers: {
          'Content-Type': 'application/json',
          'Host': host,
        },
        body: JSON.stringify({
          req_key: requestBody.req_key, // 使用相同的 req_key
          task_id: taskId,
        }),
      }

      const resultSigner = new Signer(getResultRequestObj, service)
      resultSigner.addAuthorization(credentials)
      const resultSignedHeaders = getResultRequestObj.headers

      const resultQueryParams = new URLSearchParams({
        Action: 'CVSync2AsyncGetResult',
        Version: version,
      })
      const resultEndpoint = `${baseUrl}?${resultQueryParams.toString()}`

      try {
        const resultResponse = await fetch(resultEndpoint, {
          method: 'POST',
          headers: resultSignedHeaders,
          body: getResultRequestObj.body,
        })

        if (!resultResponse.ok) {
          const errorText = await resultResponse.text()
          log('WARN', `即梦 AI 查询结果失败 (尝试 ${attempt}/${maxPollingAttempts})`, { 
            status: resultResponse.status,
            error: errorText
          })
          continue
        }

        const resultData = await resultResponse.json()

        // 检查是否有错误
        if (resultData.ResponseMetadata && resultData.ResponseMetadata.Error) {
          const error = resultData.ResponseMetadata.Error
          // 如果错误是任务还在处理中，继续轮询
          if (error.Code === 'Processing' || error.Message?.includes('处理中') || error.Message?.includes('processing')) {
            log('INFO', `即梦 AI 任务处理中 (尝试 ${attempt}/${maxPollingAttempts})`, { taskId })
            continue
          }
          // 其他错误直接返回
          log('ERROR', '即梦 AI 查询结果失败', { 
            code: error.Code,
            message: error.Message,
            requestId: resultData.ResponseMetadata.RequestId
          })
          return res.status(400).json({
            success: false,
            error: error.Message || '查询结果失败',
            code: error.Code,
            requestId: resultData.ResponseMetadata.RequestId,
            taskId,
            details: resultData
          })
        }

        // 检查结果是否完成
        const data = resultData.data || resultData.Result || resultData.result || resultData
        const status = (data && data.status) || resultData.status || 'unknown'
        
        // 跟踪状态变化，分别计算超时
        const now = Date.now()
        if (status === 'in_queue') {
          if (lastStatus !== 'in_queue') {
            // 刚进入排队状态
            inQueueStartTime = now
            log('INFO', '即梦 AI 任务进入排队状态', { taskId, attempt })
          }
          // 检查排队超时
          if (inQueueStartTime && (now - inQueueStartTime) > maxQueueWaitTime) {
            log('WARN', '即梦 AI 任务排队超时', { 
              taskId, 
              queueWaitTime: now - inQueueStartTime,
              maxQueueWaitTime 
            })
            // 返回 pending 状态和 task_id，让前端继续查询
            return res.json({
              success: true,
              status: 'pending',
              taskId: taskId,
              message: '任务正在排队中，请稍后查询结果',
              queueTime: Math.floor((now - inQueueStartTime) / 1000) // 秒
            })
          }
        } else if (status === 'running' || status === 'processing') {
          if (lastStatus === 'in_queue' || lastStatus === 'unknown') {
            // 从排队进入执行状态
            runningStartTime = now
            log('INFO', '即梦 AI 任务进入执行状态', { taskId, attempt, queueTime: inQueueStartTime ? (now - inQueueStartTime) : 0 })
          }
          // 检查执行超时
          if (runningStartTime && (now - runningStartTime) > maxRunningTime) {
            log('WARN', '即梦 AI 任务执行超时', { 
              taskId, 
              runningTime: now - runningStartTime,
              maxRunningTime 
            })
            // 返回 pending 状态和 task_id，让前端继续查询
            return res.json({
              success: true,
              status: 'pending',
              taskId: taskId,
              message: '任务正在执行中，请稍后查询结果',
              runningTime: Math.floor((now - runningStartTime) / 1000) // 秒
            })
          }
        }
        lastStatus = status
        
        // done 状态：任务完成，立即解析返回 JSON，取图片结果
        if (status === 'done') {
          // 打印整个 data 结构一次（脱敏），用于调试
          log('INFO', '即梦 AI 任务完成 (done)', {
            taskId,
            attempt,
            dataKeys: Object.keys(data),
            hasImageBase64: !!data.image_base64,
            hasBinaryDataBase64: !!(data.binary_data_base64 && Array.isArray(data.binary_data_base64) && data.binary_data_base64.length > 0),
            hasImages: !!(data.images && Array.isArray(data.images) && data.images.length > 0),
            hasImage: !!data.image,
            hasImageUrl: !!data.image_url || !!(data.image_urls && Array.isArray(data.image_urls) && data.image_urls.length > 0)
          })
          
          // 提取图片：兼容多种可能的字段名
          const extractImage = (dataObj) => {
            // 优先线 1: data.image_base64 (即梦 4.0 标准字段)
            if (dataObj.image_base64 && typeof dataObj.image_base64 === 'string') {
              return { imageBase64: dataObj.image_base64, imageUrl: null }
            }
            
            // 优先线 2: data.binary_data_base64[0] (兼容旧格式)
            if (dataObj.binary_data_base64 && Array.isArray(dataObj.binary_data_base64) && dataObj.binary_data_base64.length > 0) {
              const firstImage = dataObj.binary_data_base64[0]
              if (typeof firstImage === 'string') {
                return { imageBase64: firstImage, imageUrl: null }
              }
            }
            
            // 优先线 3: data.images[0] (备用字段)
            if (dataObj.images && Array.isArray(dataObj.images) && dataObj.images.length > 0) {
              const firstImage = dataObj.images[0]
              if (typeof firstImage === 'string') {
                return { imageBase64: firstImage, imageUrl: null }
              }
              // 如果是对象，尝试提取字段
              return { 
                imageBase64: firstImage.image_base64 || firstImage.image, 
                imageUrl: firstImage.image_url || firstImage.url 
              }
            }
            
            // 优先线 4: data.image_urls[0] (URL 数组)
            if (dataObj.image_urls && Array.isArray(dataObj.image_urls) && dataObj.image_urls.length > 0) {
              return { imageBase64: null, imageUrl: dataObj.image_urls[0] }
            }
            
            // 优先线 5: 单个字段
            if (dataObj.image) return { imageBase64: dataObj.image, imageUrl: null }
            if (dataObj.image_url) return { imageBase64: null, imageUrl: dataObj.image_url }
            if (dataObj.url) return { imageBase64: null, imageUrl: dataObj.url }
            
            return null
          }
          
          const imageData = extractImage(data)
          if (imageData && imageData.imageBase64) {
            log('INFO', '即梦 AI 生成成功', { 
              taskId,
              attempt,
              hasImageUrl: !!imageData.imageUrl,
              hasImageBase64: !!imageData.imageBase64,
              imageBase64Length: imageData.imageBase64 ? imageData.imageBase64.length : 0
            })

            return res.json({
              success: true,
              mode: isI2I ? 'i2i' : 't2i',
              imageUrl: imageData.imageUrl,
              imageBase64: imageData.imageBase64,
              taskId: taskId,
            })
          } else if (imageData && imageData.imageUrl) {
            // 只有 URL 没有 base64
            log('INFO', '即梦 AI 生成成功（仅 URL）', { 
              taskId,
              attempt,
              imageUrl: imageData.imageUrl
            })

            return res.json({
              success: true,
              imageUrl: imageData.imageUrl,
              imageBase64: null,
              taskId: taskId,
            })
          } else {
            // done 但没有找到图片字段
            log('WARN', '即梦 AI 任务完成但未找到图片字段', { 
              taskId,
              dataKeys: Object.keys(data),
              fullData: JSON.stringify(data, null, 2).substring(0, 500) // 只打印前 500 字符用于调试
            })
            return res.json({
              success: false,
              error: '任务完成但未找到图片结果',
              taskId: taskId,
              details: data
            })
          }
        }
        
        // failed/error 状态：任务失败
        if (status === 'failed' || status === 'error') {
          log('ERROR', '即梦 AI 任务执行失败', { 
            taskId,
            status,
            error: data.error || data.message
          })
          return res.json({
            success: false,
            error: data.error || data.message || '任务执行失败',
            taskId: taskId,
            details: data
          })
        }
        
        // in_queue/running/processing 状态：继续轮询
        if (['in_queue', 'running', 'processing'].includes(status)) {
          const statusInfo = {
            taskId,
            status,
            attempt,
            totalAttempts: maxPollingAttempts
          }
          if (status === 'in_queue' && inQueueStartTime) {
            statusInfo.queueTime = Math.floor((Date.now() - inQueueStartTime) / 1000)
          }
          if ((status === 'running' || status === 'processing') && runningStartTime) {
            statusInfo.runningTime = Math.floor((Date.now() - runningStartTime) / 1000)
          }
          log('INFO', `即梦 AI 任务处理中 (尝试 ${attempt}/${maxPollingAttempts})`, statusInfo)
          // 继续下一次轮询
        } else {
          // 未知状态，记录日志但继续轮询
          log('WARN', `即梦 AI 未知状态 (尝试 ${attempt}/${maxPollingAttempts})`, { 
            taskId,
            status,
            resultKeys: Object.keys(data || {})
          })
        }
      } catch (pollError) {
        log('WARN', `即梦 AI 轮询请求异常 (尝试 ${attempt}/${maxPollingAttempts})`, { 
          error: pollError.message
        })
        // 继续下一次轮询
      }
    }

    // 轮询超时（达到最大尝试次数）
    // 返回 pending 状态和 task_id，让前端继续查询
    log('WARN', '即梦 AI 任务轮询达到最大尝试次数', { 
      taskId, 
      attempts: maxPollingAttempts,
      lastStatus: lastStatus,
      totalTime: Math.floor((maxPollingAttempts * pollingInterval) / 1000) // 秒
    })
    return res.json({
      success: true,
      status: 'pending',
      taskId: taskId,
      message: '任务处理时间较长，请稍后查询结果',
      attempts: maxPollingAttempts,
      lastStatus: lastStatus
    })

  } catch (error) {
    log('ERROR', '即梦 AI API 调用失败', { 
      error: error.message,
      stack: error.stack
    })
    return res.status(500).json({
      success: false,
      error: error.message || '即梦 AI API 调用失败',
    })
  }
})

app.listen(PORT, () => {
  log('INFO', `服务器启动`, { port: PORT, logsDir: logsDir });
  console.log(`服务器运行在 http://localhost:${PORT}`)
  console.log(`业务日志查看器: http://localhost:${PORT}/business-log-viewer.html`)
  console.log(`基础日志查看器: http://localhost:${PORT}/log-viewer.html`)
})
