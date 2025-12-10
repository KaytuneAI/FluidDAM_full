# 远程服务器部署指南

## 🚀 **部署步骤**

### 1. **在远程服务器上拉取最新代码**
```bash
# SSH连接到远程服务器
ssh user@your-server-ip

# 进入项目目录
cd /path/to/fluiddam

# 拉取最新代码
git pull origin main
```

### 2. **安装依赖（如果需要）**
```bash
# 安装Node.js依赖
npm install

# 如果使用PM2
npm install -g pm2
```

### 3. **启动服务器**
```bash
# 方法1：直接启动
node server.js

# 方法2：使用PM2（推荐生产环境）
pm2 start server.js --name fluiddam-api
pm2 save
pm2 startup
```

### 4. **配置Nginx（可选）**
```bash
# 复制Nginx配置
sudo cp nginx.conf.example /etc/nginx/sites-available/fluiddam

# 编辑配置，修改域名和路径
sudo nano /etc/nginx/sites-available/fluiddam

# 启用站点
sudo ln -s /etc/nginx/sites-available/fluiddam /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 🔍 **测试部署**

### 1. **检查服务器状态**
```bash
# 检查端口是否监听
netstat -tlnp | grep :3001

# 检查PM2状态（如果使用PM2）
pm2 status
pm2 logs fluiddam-api
```

### 2. **测试日志查看器**
```bash
# 访问业务日志查看器
curl http://your-server-ip:3001/business-log-viewer.html

# 测试API
curl http://your-server-ip:3001/api/logs/stats
```

### 3. **浏览器访问**
```
# 业务日志查看器（推荐）
http://your-server-ip:3001/business-log-viewer.html

# 基础日志查看器
http://your-server-ip:3001/log-viewer.html
```

## 🛠️ **故障排除**

### 1. **端口冲突**
```bash
# 检查端口占用
sudo lsof -i :3001

# 杀死占用进程
sudo kill -9 <PID>
```

### 2. **权限问题**
```bash
# 确保日志目录权限
sudo chown -R user:user /path/to/fluiddam/logs
sudo chmod -R 755 /path/to/fluiddam/logs
```

### 3. **防火墙设置**
```bash
# 开放3001端口
sudo ufw allow 3001
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

## 📊 **监控和维护**

### 1. **查看日志**
```bash
# 实时查看服务器日志
tail -f logs/server-$(date +%Y-%m-%d).log

# 查看错误日志
tail -f logs/error-$(date +%Y-%m-%d).log
```

### 2. **重启服务**
```bash
# 如果使用PM2
pm2 restart fluiddam-api

# 如果直接运行
# 先杀死进程，再重新启动
```

### 3. **备份日志**
```bash
# 备份今天的日志
cp logs/server-$(date +%Y-%m-%d).log /backup/
```

## 🎯 **生产环境建议**

1. **使用PM2管理进程**
2. **配置Nginx反向代理**
3. **设置日志轮转**
4. **配置监控告警**
5. **定期备份日志文件**

## ✅ **部署完成检查清单**

- [ ] 代码已拉取到最新版本
- [ ] 服务器成功启动
- [ ] 端口3001可访问
- [ ] 业务日志查看器可访问
- [ ] API接口正常响应
- [ ] 日志文件正常生成
- [ ] 防火墙端口已开放
- [ ] 进程管理已配置（PM2）

**部署完成后，您就可以远程监控FluidDAM的业务操作了！** 🎉
