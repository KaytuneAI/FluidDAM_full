# 🔧 Nginx 413错误修复指南

## 🚨 问题描述
分享画布时出现 `413 Request Entity Too Large` 错误，无论文件大小。

## 🎯 解决方案

### 1. 更新Nginx配置

在您的Nginx配置文件中添加或修改以下设置：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 全局设置
    client_max_body_size 100M;
    client_body_timeout 60s;
    client_header_timeout 60s;
    
    # API代理配置
    location /api/ {
        proxy_pass http://localhost:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # 关键设置 - 处理大文件上传
        client_max_body_size 100M;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_request_buffering off;  # 禁用请求缓冲
    }
    
    # 其他location配置...
}
```

### 2. 重启Nginx服务

```bash
# 测试配置
sudo nginx -t

# 重新加载配置
sudo nginx -s reload

# 或者重启服务
sudo systemctl restart nginx
```

### 3. 验证修复

检查Nginx配置是否生效：

```bash
# 查看当前配置
nginx -T | grep client_max_body_size
```

## 🔍 调试步骤

### 1. 检查Nginx错误日志
```bash
sudo tail -f /var/log/nginx/error.log
```

### 2. 检查应用日志
```bash
# 查看服务器日志
tail -f logs/server-$(date +%Y-%m-%d).log
```

### 3. 测试上传大小
```bash
# 测试API端点
curl -X POST http://your-domain.com/api/save-canvas \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}' \
  -v
```

## 📋 常见问题

### Q: 修改后仍然报413错误？
A: 检查是否有多个Nginx配置文件冲突，确保修改的是正确的配置文件。

### Q: 如何确定当前使用的配置文件？
A: 运行 `nginx -T` 查看完整配置，或检查 `/etc/nginx/nginx.conf` 中的 `include` 指令。

### Q: 生产环境需要重启整个服务器吗？
A: 不需要，只需 `nginx -s reload` 即可。

## ⚠️ 安全注意事项

- `client_max_body_size` 设置过大会增加DDoS攻击风险
- 建议根据实际需求设置合理的大小限制
- 考虑添加速率限制来防止滥用

## 🎯 推荐配置

```nginx
# 生产环境推荐配置
client_max_body_size 50M;  # 根据实际需求调整
client_body_timeout 30s;
client_header_timeout 30s;
proxy_read_timeout 60s;
proxy_send_timeout 60s;
```
