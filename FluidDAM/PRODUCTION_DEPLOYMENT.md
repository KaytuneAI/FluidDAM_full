# FluidDAM 生产环境部署指南

## 问题诊断：Nginx环境下分享画布失败

### 常见问题
1. **API请求失败** - 前端无法连接到后端API
2. **分享链接错误** - 生成的分享链接无法访问
3. **CORS错误** - 跨域请求被阻止
4. **文件上传失败** - 大文件上传超时

## 解决方案

### 1. Nginx配置

使用提供的 `nginx.conf.example` 配置文件，确保：

```nginx
# API代理配置
location /api/ {
    proxy_pass http://localhost:3001/;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 50M;
}
```

### 2. 环境变量配置

在服务器上设置环境变量：

```bash
# 设置API地址（如果需要）
export FLUIDDAM_API_URL="https://your-domain.com/api"

# 或者在前端构建时设置
export REACT_APP_API_URL="https://your-domain.com/api"
```

### 3. 部署步骤

#### 步骤1：构建前端
```bash
npm run build
```

#### 步骤2：启动后端服务器
```bash
# 使用PM2（推荐）
npm install -g pm2
pm2 start server.js --name fluiddam-api

# 或者直接运行
node server.js
```

#### 步骤3：配置Nginx
1. 复制 `nginx.conf.example` 到 `/etc/nginx/sites-available/fluiddam`
2. 修改配置中的路径和域名
3. 启用站点：
```bash
sudo ln -s /etc/nginx/sites-available/fluiddam /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. 验证部署

#### 检查API连接
```bash
curl -X GET https://your-domain.com/api/get-image-data
```

#### 检查分享功能
1. 访问前端应用
2. 创建画布并添加内容
3. 点击分享按钮
4. 验证分享链接是否可访问

### 5. 故障排除

#### 问题1：API请求404
**原因**：Nginx路由配置错误
**解决**：检查 `/api/` location块配置

#### 问题2：分享链接无法访问
**原因**：分享链接生成错误
**解决**：检查服务器日志，确认X-Forwarded-*头设置

#### 问题3：大文件上传失败
**原因**：请求体大小限制
**解决**：增加 `client_max_body_size` 设置

#### 问题4：CORS错误
**原因**：跨域请求被阻止
**解决**：确保Nginx正确代理API请求

### 6. 监控和日志

#### 查看应用日志
```bash
# PM2日志
pm2 logs fluiddam-api

# Nginx日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

#### 检查分享文件
```bash
ls -la /path/to/your/fluiddam/public/shares/
```

### 7. 性能优化

#### 启用Gzip压缩
```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript;
```

#### 设置缓存
```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

#### 限制请求频率
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
location /api/ {
    limit_req zone=api burst=20 nodelay;
    # ... 其他配置
}
```

## 安全建议

1. **使用HTTPS** - 配置SSL证书
2. **限制文件上传** - 设置合理的文件大小限制
3. **定期清理** - 自动清理过期的分享文件
4. **访问控制** - 根据需要添加身份验证

## 备份和恢复

### 备份重要文件
```bash
# 备份分享文件
tar -czf shares-backup-$(date +%Y%m%d).tar.gz /path/to/your/fluiddam/public/shares/

# 备份图片数据库
cp /path/to/your/fluiddam/public/images-database.json /backup/
```

### 恢复数据
```bash
# 恢复分享文件
tar -xzf shares-backup-YYYYMMDD.tar.gz -C /path/to/your/fluiddam/public/

# 恢复图片数据库
cp /backup/images-database.json /path/to/your/fluiddam/public/
```
