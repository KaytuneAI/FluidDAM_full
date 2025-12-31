# ai.kaytune.com 生产环境部署指南

## 📋 部署概览

- **域名**: ai.kaytune.com
- **服务器**: Ubuntu
- **部署方式**: 构建静态文件 + Nginx + PM2

## 🚀 部署步骤

### 1. 服务器准备

#### 1.1 SSH 连接到服务器
```bash
ssh user@ai.kaytune.com
# 或使用 IP 地址
ssh user@your-server-ip
```

#### 1.2 安装必要软件
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js (如果未安装)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 Nginx
sudo apt install nginx -y

# 安装 PM2 (进程管理)
sudo npm install -g pm2

# 安装 Git (如果未安装)
sudo apt install git -y
```

### 2. 代码部署

#### 2.1 克隆或拉取代码
```bash
# 如果代码已存在，进入项目目录
cd /usr/local/FluidDAM_Full

# 拉取最新代码
git pull origin master

# 如果首次部署，克隆代码
# git clone <your-repo-url> /usr/local/FluidDAM_Full
# cd /usr/local/FluidDAM_Full
```

#### 2.2 安装依赖
```bash
# 根目录依赖
npm install

# Banner_gen 依赖
cd Banner_gen
npm install
cd ..

# FluidDAM 依赖
cd FluidDAM
npm install
cd ..
```

### 3. 构建应用

#### 3.1 使用构建脚本（推荐）
```bash
# 进入项目根目录（如果不在）
cd /usr/local/FluidDAM_Full

# 确保脚本有执行权限
chmod +x build-all.sh

# 执行构建脚本（会自动构建所有应用）
./build-all.sh
```

**构建脚本会自动执行以下操作：**
1. 构建根入口（Home）→ 输出到 `./dist/`
2. 构建 Banner_gen → 输出到 `./Banner_gen/dist/`
3. 构建 FluidDAM (SpotStudio) → 输出到 `./FluidDAM/dist/`

**注意**: 确保在步骤2中已经安装了所有依赖，否则构建会失败。

#### 3.2 手动构建（如果脚本失败）
```bash
# 进入项目根目录
cd /usr/local/FluidDAM_Full

# 1. 构建根入口（Home）
npm run build
# 输出: ./dist/

# 2. 构建 Banner_gen
cd Banner_gen
npm run build
# 输出: ./dist/ (base: /bannergen/)
cd ..

# 3. 构建 FluidDAM
cd FluidDAM
npm run build
# 输出: ./dist/ (base: /spotstudio/)
cd ..
```

### 4. 复制构建文件到网站目录

#### 4.1 创建网站目录结构
```bash
# 创建必要的目录
sudo mkdir -p /var/www/html/bannergen
sudo mkdir -p /var/www/html/spotstudio
sudo mkdir -p /var/www/html/shares

# 设置目录权限（根据您的用户调整）
sudo chown -R $USER:www-data /var/www/html
sudo chmod -R 755 /var/www/html
```

#### 4.2 复制构建文件
```bash
# 复制 Home 页面
sudo cp -r /usr/local/FluidDAM_Full/dist/* /var/www/html/

# 复制 BannerGen
sudo cp -r /usr/local/FluidDAM_Full/Banner_gen/dist/* /var/www/html/bannergen/

# 复制 SpotStudio (FluidDAM)
sudo cp -r /usr/local/FluidDAM_Full/FluidDAM/dist/* /var/www/html/spotstudio/

# 复制分享文件和图片数据库（如果存在）
sudo cp -r /usr/local/FluidDAM_Full/FluidDAM/public/shares/* /var/www/html/shares/ 2>/dev/null || true
sudo cp /usr/local/FluidDAM_Full/FluidDAM/public/images-database.json /var/www/html/ 2>/dev/null || true
```

### 5. 配置 Nginx

#### 4.1 Nginx 目录结构说明

在 Ubuntu 服务器上，Nginx 的标准目录结构：

```bash
# 主配置文件
/etc/nginx/nginx.conf

# 站点配置文件目录
/etc/nginx/sites-available/    # 可用的站点配置（所有配置）
/etc/nginx/sites-enabled/      # 启用的站点配置（符号链接）

# 日志文件目录
/var/log/nginx/access.log      # 访问日志
/var/log/nginx/error.log       # 错误日志

# 默认网站根目录
/var/www/html/                 # 默认网站目录（我们将使用此目录）
```

**目录规划：**

我们将构建后的文件复制到 `/var/www/html/` 的标准目录结构：
- `/var/www/html/` - Home 页面
- `/var/www/html/bannergen/` - BannerGen 应用
- `/var/www/html/spotstudio/` - SpotStudio (FluidDAM) 应用
- `/var/www/html/shares/` - 分享文件目录
```

#### 5.1 创建 Nginx 配置文件
```bash
sudo nano /etc/nginx/sites-available/ai.kaytune.com
```

#### 5.2 Nginx 配置内容
```nginx
# HTTP 配置（可选，用于重定向到 HTTPS）
server {
    listen 80;
    server_name ai.kaytune.com;
    
    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS 配置
server {
    listen 443 ssl http2;
    server_name ai.kaytune.com;
    
    # SSL 证书配置（使用 Let's Encrypt 或您的证书）
    ssl_certificate /etc/letsencrypt/live/ai.kaytune.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ai.kaytune.com/privkey.pem;
    
    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # 请求体大小限制（用于文件上传）
    client_max_body_size 100M;
    
    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # 静态资源缓存
    location ^~ /assets/ {
        root /var/www/html;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }
    
    # API 代理到后端服务器
    location /api/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置（处理大文件上传）
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }
    
    # BannerGen 静态文件
    location /bannergen {
        alias /var/www/html/bannergen;
        try_files $uri $uri/ /bannergen/index.html;
        
        # 静态资源缓存
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # SpotStudio (FluidDAM) 静态文件
    location /spotstudio {
        alias /var/www/html/spotstudio;
        try_files $uri $uri/ /spotstudio/index.html;
        
        # 静态资源缓存
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Link 页面
    location /link {
        alias /var/www/html/bannergen;
        try_files $uri $uri/ /bannergen/index.html;
    }
    
    # 分享文件访问
    location /shares/ {
        alias /var/www/html/shares/;
        expires 1h;
        add_header Cache-Control "public";
    }
    
    # 图片数据库文件
    location /images-database.json {
        alias /var/www/html/images-database.json;
        expires 1h;
        add_header Cache-Control "public";
    }
    
    # 主入口（Home）
    root /var/www/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

**注意**: 网站文件已复制到 `/var/www/html/` 标准目录

#### 5.3 启用站点
```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/ai.kaytune.com /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 如果测试通过，重载 Nginx
sudo systemctl reload nginx
```

### 6. 配置 SSL 证书（如果使用 Let's Encrypt）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx -y

# 获取证书
sudo certbot --nginx -d ai.kaytune.com

# 自动续期测试
sudo certbot renew --dry-run
```

### 7. 启动后端 API 服务器

#### 7.1 使用启动脚本（推荐）
```bash
# 进入项目根目录
cd /usr/local/FluidDAM_Full

# 确保脚本有执行权限
chmod +x start-all.sh

# 运行启动脚本（会自动使用 PM2 启动 API 服务器）
./start-all.sh
```

**启动脚本会自动：**
- 检查 Node.js、npm、PM2 是否安装
- 检查并安装依赖（如果需要）
- 使用 PM2 启动 API 服务器（端口 3001）
- 保存 PM2 配置

#### 7.2 手动使用 PM2 启动（如果脚本失败）
```bash
cd /usr/local/FluidDAM_Full/FluidDAM

# 启动 API 服务器
pm2 start server.js --name fluiddam-api

# 保存 PM2 配置
pm2 save

# 设置开机自启
pm2 startup
# 执行输出的命令（通常是 sudo env PATH=... pm2 startup systemd -u user --hp /home/user）
```

#### 7.2 检查服务状态
```bash
# 查看 PM2 状态
pm2 status

# 查看日志
pm2 logs fluiddam-api

# 查看实时日志
pm2 logs fluiddam-api --lines 50
```

### 8. 防火墙配置

```bash
# 如果使用 UFW
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3001/tcp  # API 服务器（仅本地访问，可选）
sudo ufw enable

# 检查状态
sudo ufw status
```

### 9. 验证部署

#### 9.1 检查服务状态
```bash
# 检查 Nginx
sudo systemctl status nginx

# 检查 PM2
pm2 status

# 检查端口监听
sudo netstat -tlnp | grep -E ':(80|443|3001)'
```

#### 9.2 测试访问
```bash
# 测试 API
curl https://ai.kaytune.com/api/get-image-data

# 测试各个路径
curl -I https://ai.kaytune.com/
curl -I https://ai.kaytune.com/link
curl -I https://ai.kaytune.com/bannergen
curl -I https://ai.kaytune.com/spotstudio
```

#### 9.3 浏览器测试
访问以下 URL 确认功能正常：
- `https://ai.kaytune.com/` - 主页
- `https://ai.kaytune.com/link` - Link 页面
- `https://ai.kaytune.com/bannergen` - BannerGen
- `https://ai.kaytune.com/spotstudio` - SpotStudio (FluidDAM)

## 🔄 更新部署

当有新代码需要部署时：

```bash
# 1. 拉取最新代码
cd /usr/local/FluidDAM_Full
git pull origin master

# 2. 重新安装依赖（如果有新依赖）
npm install
cd Banner_gen && npm install && cd ..
cd FluidDAM && npm install && cd ..

# 3. 重新构建
./build-all.sh

# 4. 复制新的构建文件到网站目录
sudo cp -r /usr/local/FluidDAM_Full/dist/* /var/www/html/
sudo cp -r /usr/local/FluidDAM_Full/Banner_gen/dist/* /var/www/html/bannergen/
sudo cp -r /usr/local/FluidDAM_Full/FluidDAM/dist/* /var/www/html/spotstudio/
sudo cp -r /usr/local/FluidDAM_Full/FluidDAM/public/shares/* /var/www/html/shares/ 2>/dev/null || true
sudo cp /usr/local/FluidDAM_Full/FluidDAM/public/images-database.json /var/www/html/ 2>/dev/null || true

# 5. 重启 API 服务器（如果后端有更新）
cd /usr/local/FluidDAM_Full
./start-all.sh
# 或者手动重启
# cd FluidDAM && pm2 restart fluiddam-api

# 6. 清除浏览器缓存或等待 CDN 缓存过期
```

## 🛠️ 故障排除

### 问题1: Nginx 502 Bad Gateway
**原因**: API 服务器未启动或端口错误
**解决**:
```bash
# 检查 PM2 状态
pm2 status

# 检查 API 服务器日志
pm2 logs fluiddam-api

# 重启 API 服务器
pm2 restart fluiddam-api
```

### 问题2: 静态文件 404
**原因**: 路径配置错误或文件不存在
**解决**:
```bash
# 检查文件是否存在
ls -la /var/www/html/
ls -la /var/www/html/bannergen/
ls -la /var/www/html/spotstudio/

# 检查 Nginx 配置路径
sudo nginx -t
```

### 问题3: API 请求失败
**原因**: Nginx 代理配置错误
**解决**:
```bash
# 检查 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 测试 API 服务器本地访问
curl http://localhost:3001/api/get-image-data
```

### 问题4: SSL 证书问题
**原因**: 证书过期或配置错误
**解决**:
```bash
# 检查证书状态
sudo certbot certificates

# 手动续期
sudo certbot renew

# 检查证书路径
ls -la /etc/letsencrypt/live/ai.kaytune.com/
```

## 📊 监控和维护

### 查看日志
```bash
# Nginx 访问日志
sudo tail -f /var/log/nginx/access.log

# Nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# PM2 日志
pm2 logs fluiddam-api

# FluidDAM 应用日志
tail -f /usr/local/FluidDAM_Full/FluidDAM/logs/server-$(date +%Y-%m-%d).log
```

### 性能监控
```bash
# PM2 监控
pm2 monit

# 系统资源
htop
# 或
top
```

## ✅ 部署检查清单

- [ ] Node.js 已安装（版本 >= 18）
- [ ] Nginx 已安装并运行
- [ ] PM2 已安装
- [ ] 代码已拉取到最新版本
- [ ] 所有依赖已安装
- [ ] 所有应用已构建成功
- [ ] 构建文件已复制到 `/var/www/html/`
- [ ] 网站目录权限已设置正确
- [ ] Nginx 配置已创建并启用
- [ ] SSL 证书已配置（如果使用 HTTPS）
- [ ] API 服务器已启动（PM2）
- [ ] 防火墙端口已开放
- [ ] 所有路径可以正常访问
- [ ] API 接口正常响应

## 📝 重要路径说明

### 项目目录
- **项目根目录**: `/usr/local/FluidDAM_Full`
- **Home 构建输出**: `/usr/local/FluidDAM_Full/dist/`
- **BannerGen 构建输出**: `/usr/local/FluidDAM_Full/Banner_gen/dist/`
- **SpotStudio 构建输出**: `/usr/local/FluidDAM_Full/FluidDAM/dist/`
- **API 服务器**: `/usr/local/FluidDAM_Full/FluidDAM/server.js`

### 网站目录（Nginx 服务目录）
- **网站根目录**: `/var/www/html/`
- **Home 页面**: `/var/www/html/`
- **BannerGen**: `/var/www/html/bannergen/`
- **SpotStudio**: `/var/www/html/spotstudio/`
- **分享文件**: `/var/www/html/shares/`

### Nginx 配置
- **Nginx 配置**: `/etc/nginx/sites-available/ai.kaytune.com`
- **SSL 证书**: `/etc/letsencrypt/live/ai.kaytune.com/`
- **Nginx 日志**: `/var/log/nginx/`

---

**部署完成后，您的应用将在 https://ai.kaytune.com 上运行！** 🎉

