# FluidDAM 服务器日志查看指南

## 📋 日志类型和位置

### 1. **应用日志**
- **位置**: `logs/server-YYYY-MM-DD.log`
- **内容**: 所有应用活动、请求、响应
- **格式**: `[时间戳] [级别] 消息 | 数据`

### 2. **错误日志**
- **位置**: `logs/error-YYYY-MM-DD.log`
- **内容**: 仅错误和异常
- **格式**: `[时间戳] [ERROR] 错误消息 | 错误详情`

### 3. **系统日志**
- **位置**: 系统日志目录
- **内容**: 系统级错误和警告

## 🔍 查看日志的方法

### 方法1：实时查看日志
```bash
# 查看实时应用日志
tail -f logs/server-$(date +%Y-%m-%d).log

# 查看实时错误日志
tail -f logs/error-$(date +%Y-%m-%d).log

# 查看所有日志（包括历史）
tail -f logs/server-*.log
```

### 方法2：搜索特定内容
```bash
# 搜索分享相关的日志
grep -i "分享" logs/server-*.log

# 搜索错误日志
grep -i "error" logs/server-*.log

# 搜索特定API请求
grep "POST /api/share-canvas" logs/server-*.log

# 搜索特定时间段的日志
grep "2024-01-15" logs/server-*.log
```

### 方法3：使用PM2查看日志（如果使用PM2）
```bash
# 查看PM2应用日志
pm2 logs fluiddam-api

# 查看特定应用的日志
pm2 logs fluiddam-api --lines 100

# 清空PM2日志
pm2 flush
```

### 方法4：使用journalctl（系统服务）
```bash
# 查看系统服务日志
sudo journalctl -u your-service-name -f

# 查看最近的日志
sudo journalctl -u your-service-name --since "1 hour ago"
```

## 📊 日志分析技巧

### 1. **分享功能问题诊断**
```bash
# 查看分享请求
grep "分享画布" logs/server-*.log

# 查看分享成功记录
grep "画布分享成功" logs/server-*.log

# 查看分享错误
grep "分享画布时出错" logs/error-*.log
```

### 2. **API请求分析**
```bash
# 查看所有API请求
grep "Request:" logs/server-*.log

# 查看失败的请求（状态码400+）
grep "Response.*[4-5][0-9][0-9]" logs/server-*.log

# 查看慢请求（超过1秒）
grep "duration.*[1-9][0-9][0-9][0-9]ms" logs/server-*.log
```

### 3. **性能分析**
```bash
# 查看请求响应时间
grep "duration" logs/server-*.log | sort -k5 -nr

# 查看大文件上传
grep "dataSize.*[5-9][0-9][0-9][0-9][0-9]" logs/server-*.log
```

## 🛠️ 常用日志命令

### 实时监控
```bash
# 监控所有日志
tail -f logs/server-*.log logs/error-*.log

# 监控错误日志
tail -f logs/error-*.log

# 监控特定功能
tail -f logs/server-*.log | grep -E "(分享|share)"
```

### 历史分析
```bash
# 查看今天的日志
cat logs/server-$(date +%Y-%m-%d).log

# 查看昨天的日志
cat logs/server-$(date -d yesterday +%Y-%m-%d).log

# 查看最近1小时的日志
grep "$(date -d '1 hour ago' '+%Y-%m-%dT%H')" logs/server-*.log
```

### 统计信息
```bash
# 统计错误数量
grep -c "ERROR" logs/error-*.log

# 统计API请求数量
grep -c "Request:" logs/server-*.log

# 统计分享成功数量
grep -c "画布分享成功" logs/server-*.log
```

## 🚨 常见问题诊断

### 问题1：分享功能失败
```bash
# 查看分享相关错误
grep -A 5 -B 5 "分享画布时出错" logs/error-*.log

# 检查分享请求
grep "POST /api/share-canvas" logs/server-*.log
```

### 问题2：API连接问题
```bash
# 查看API请求失败
grep "Response.*[4-5][0-9][0-9]" logs/server-*.log

# 查看CORS问题
grep -i "cors" logs/server-*.log
```

### 问题3：文件上传问题
```bash
# 查看大文件上传
grep "dataSize" logs/server-*.log | sort -k5 -nr

# 查看上传错误
grep -i "upload\|file" logs/error-*.log
```

## 📈 日志轮转和清理

### 自动日志轮转
```bash
# 创建logrotate配置
sudo nano /etc/logrotate.d/fluiddam

# 配置内容：
/path/to/your/fluiddam/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 user user
}
```

### 手动清理日志
```bash
# 删除7天前的日志
find logs/ -name "*.log" -mtime +7 -delete

# 压缩旧日志
gzip logs/server-*.log
gzip logs/error-*.log
```

## 🔧 日志配置优化

### 环境变量配置
```bash
# 设置日志级别
export LOG_LEVEL=INFO

# 设置日志目录
export LOG_DIR=/var/log/fluiddam

# 设置日志格式
export LOG_FORMAT=json
```

### 生产环境建议
1. **使用结构化日志** - 便于分析和搜索
2. **设置日志轮转** - 避免日志文件过大
3. **监控关键指标** - 错误率、响应时间等
4. **设置告警** - 错误数量超过阈值时通知

## 📱 日志监控工具

### 简单监控脚本
```bash
#!/bin/bash
# 创建监控脚本 monitor.sh

LOG_DIR="/path/to/your/fluiddam/logs"
ERROR_THRESHOLD=10

# 检查错误数量
ERROR_COUNT=$(grep -c "ERROR" $LOG_DIR/error-$(date +%Y-%m-%d).log)

if [ $ERROR_COUNT -gt $ERROR_THRESHOLD ]; then
    echo "警告：错误数量超过阈值 ($ERROR_COUNT > $ERROR_THRESHOLD)"
    # 发送通知（邮件、Slack等）
fi
```

### 使用logwatch
```bash
# 安装logwatch
sudo apt-get install logwatch

# 配置logwatch
sudo nano /etc/logwatch/conf/logwatch.conf
```

## 🎯 分享功能专用日志分析

### 分享成功率统计
```bash
# 计算分享成功率
TOTAL_SHARES=$(grep -c "画布分享成功" logs/server-*.log)
FAILED_SHARES=$(grep -c "分享画布时出错" logs/error-*.log)
SUCCESS_RATE=$(( (TOTAL_SHARES * 100) / (TOTAL_SHARES + FAILED_SHARES) ))
echo "分享成功率: $SUCCESS_RATE%"
```

### 分享链接访问分析
```bash
# 查看分享链接生成
grep "画布分享成功" logs/server-*.log | grep -o "shareUrl.*" | cut -d'"' -f4

# 查看分享数据大小分布
grep "dataSize" logs/server-*.log | awk '{print $NF}' | sort -n
```

这个指南应该能帮助您全面监控和分析FluidDAM应用的运行状态！
