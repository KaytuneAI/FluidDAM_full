# 服务器端配置检查清单

## 当前端口配置

### 开发环境端口
- **主入口（Home）**: `3000`
- **Banner_gen**: `5174`
- **FluidDAM (SpotStudio)**: `5173`
- **API 服务器**: `3001`

### 生产环境路径
- **Home**: `/`
- **Link**: `/link`
- **BannerGen**: `/bannergen`
- **FluidDAM (SpotStudio)**: `/spotstudio`
- **API**: `/api`

## 服务器端需要配置的内容

### 1. Nginx 配置更新

当前你的 `nginx.conf` 只配置了：
- ✅ `/api/` -> `http://127.0.0.1:3001/`
- ✅ `/` -> 静态文件 `C:/www/liquora.cn/dist`

**需要添加以下配置**：

```nginx
# 在 server 块中添加以下 location 配置

# Link 页面
location /link {
    proxy_pass http://localhost:5174;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    rewrite ^/link(/.*)$ $1 break;
}

# BannerGen
location /bannergen {
    proxy_pass http://localhost:5174;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    rewrite ^/bannergen(/.*)$ $1 break;
}

# FluidDAM (SpotStudio)
location /spotstudio {
    proxy_pass http://localhost:5173;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    rewrite ^/spotstudio(/.*)$ $1 break;
}
```

### 2. 生产环境部署方式选择

#### 方式 A：使用开发服务器（当前方式）
- 优点：热更新，开发方便
- 缺点：性能较低，不适合高并发
- **需要确保以下服务在服务器上运行**：
  ```bash
  # 主入口（Home）
  cd /path/to/FluidDAM_Full
  npm run dev  # 运行在 3000 端口

  # Banner_gen
  cd Banner_gen
  npm run dev  # 运行在 5174 端口

  # FluidDAM
  cd FluidDAM
  npm run dev  # 运行在 5173 端口

  # API 服务器
  cd FluidDAM
  npm run server  # 运行在 3001 端口
  ```

#### 方式 B：使用构建后的静态文件（推荐生产环境）
- 优点：性能好，资源占用少
- 缺点：需要重新构建才能看到更新

**构建步骤**：

**方式 1：使用构建脚本（推荐）**
```bash
# Windows
build-all.bat

# Linux/Mac
chmod +x build-all.sh
./build-all.sh
```

**方式 2：手动构建**
```bash
# 1. 构建主入口（Home）
cd /path/to/FluidDAM_Full
npm run build
# 输出到 dist/ 目录

# 2. 构建 Banner_gen
cd Banner_gen
npm run build
# 输出到 dist/ 目录，base 路径为 /bannergen/

# 3. 构建 FluidDAM
cd FluidDAM
npm run build
# 输出到 dist/ 目录，base 路径为 /spotstudio/
```

**注意**：确保在构建前已安装所有依赖：
```bash
# 根目录
npm install

# Banner_gen
cd Banner_gen
npm install

# FluidDAM
cd FluidDAM
npm install
```

**Nginx 配置（静态文件方式）**：
```nginx
server {
    listen 443 ssl;
    server_name liquora.cn;

    ssl_certificate     C:/nginx-1.28.0/cert/fullchain.pem;
    ssl_certificate_key C:/nginx-1.28.0/cert/privkey.pem;

    client_max_body_size 100M;

    # 静态资源缓存
    location ^~ /assets/ {
        root C:/www/liquora.cn/dist;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }

    # BannerGen 静态文件
    location /bannergen {
        alias C:/www/liquora.cn/bannergen-dist;
        try_files $uri $uri/ /bannergen/index.html;
    }

    # SpotStudio 静态文件
    location /spotstudio {
        alias C:/www/liquora.cn/spotstudio-dist;
        try_files $uri $uri/ /spotstudio/index.html;
    }

    # Link 页面（如果 Banner_gen 包含 link 功能）
    location /link {
        alias C:/www/liquora.cn/bannergen-dist;
        try_files $uri $uri/ /bannergen/index.html;
    }

    # 主入口（Home）
    root C:/www/liquora.cn/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 3. 进程管理（推荐使用 PM2）

如果使用开发服务器方式，建议使用 PM2 管理进程：

```bash
# 安装 PM2
npm install -g pm2

# 启动所有服务
pm2 start npm --name "home" -- run dev --cwd /path/to/FluidDAM_Full
pm2 start npm --name "bannergen" -- run dev --cwd /path/to/Banner_gen
pm2 start npm --name "spotstudio" -- run dev --cwd /path/to/FluidDAM
pm2 start npm --name "api" -- run server --cwd /path/to/FluidDAM

# 保存配置
pm2 save

# 设置开机自启
pm2 startup
```

### 4. 防火墙端口检查

确保以下端口在服务器上开放：
- `3000` - 主入口（如果使用开发服务器）
- `5174` - Banner_gen（如果使用开发服务器）
- `5173` - FluidDAM（如果使用开发服务器）
- `3001` - API 服务器
- `80` - HTTP（Nginx）
- `443` - HTTPS（Nginx）

### 5. 环境变量（可选）

如果需要，可以在服务器上设置环境变量：

```bash
# 在 .env 文件或系统环境变量中设置
VITE_BANNER_GEN_URL=/bannergen
VITE_FLUIDDAM_URL=/spotstudio
VITE_HOME_URL=/
```

## 检查清单

- [ ] Nginx 配置已更新，包含所有路径（/link, /bannergen, /spotstudio）
- [ ] 所有服务正在运行（或已构建静态文件）
- [ ] 防火墙端口已开放
- [ ] SSL 证书配置正确
- [ ] API 服务器可以正常访问
- [ ] 测试所有路径是否可以正常访问：
  - [ ] `https://liquora.cn/` (Home)
  - [ ] `https://liquora.cn/link` (Link)
  - [ ] `https://liquora.cn/bannergen` (BannerGen)
  - [ ] `https://liquora.cn/spotstudio` (SpotStudio)
  - [ ] `https://liquora.cn/api/...` (API)

## 快速测试命令

```bash
# 测试 API
curl https://liquora.cn/api/get-image-data

# 测试各个路径
curl -I https://liquora.cn/
curl -I https://liquora.cn/link
curl -I https://liquora.cn/bannergen
curl -I https://liquora.cn/spotstudio
```

