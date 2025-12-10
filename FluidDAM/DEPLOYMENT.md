# FluidDAM 日志系统部署指南

## 📦 标准版功能部署

### 🎯 **核心文件（必需）**
```
server.js                    # 核心服务器
business-log-viewer.html     # 业务日志查看器（主要使用）
log-viewer.html             # 基础日志查看器（备用）
```

### 🚀 **快速启动**

#### 1. 启动服务器
```bash
node server.js
```

#### 2. 访问日志查看器
- **业务日志**: `http://localhost:3001/business-log-viewer.html`
- **基础日志**: `http://localhost:3001/log-viewer.html`

### 📊 **功能对比**

| 功能 | 业务日志查看器 | 基础日志查看器 |
|------|----------------|----------------|
| 显示格式 | 表格形式，紧凑 | 原始格式，详细 |
| 业务信息 | ✅ 时间、IP、操作类型 | ❌ 技术细节较多 |
| 用户友好 | ✅ 颜色编码，易读 | ⚠️ 需要技术背景 |
| 推荐使用 | 🎯 **主要使用** | 🔧 技术调试时使用 |

### 🌐 **远程部署**

#### 1. 上传文件到服务器
```bash
# 上传核心文件
scp server.js user@server:/path/to/fluiddam/
scp business-log-viewer.html user@server:/path/to/fluiddam/
scp log-viewer.html user@server:/path/to/fluiddam/
```

#### 2. 启动服务器
```bash
# 在服务器上运行
node server.js
```

#### 3. 访问远程日志
```
http://your-server-ip:3001/business-log-viewer.html
```

### 🔧 **Nginx配置（可选）**

如果需要通过Nginx代理，使用 `nginx.conf.example` 配置文件。

### 📱 **移动端访问**

所有日志查看器都支持移动端访问，可以随时随地查看日志。

### 🎯 **推荐使用场景**

- **日常监控**: 使用业务日志查看器
- **技术调试**: 使用基础日志查看器
- **远程访问**: 通过浏览器访问对应URL

## ✅ **部署完成！**

现在您有了一个简洁、高效的日志系统，专注于业务价值！
