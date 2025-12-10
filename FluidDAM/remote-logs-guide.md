# 远程查看服务器日志指南

## 🔐 方法1：SSH远程连接

### 基本SSH连接
```bash
# 连接到服务器
ssh username@your-server-ip

# 连接到服务器并直接查看日志
ssh username@your-server-ip "tail -f /path/to/fluiddam/logs/server-$(date +%Y-%m-%d).log"
```

### 实时查看日志
```bash
# 实时查看应用日志
ssh username@your-server-ip "tail -f /path/to/fluiddam/logs/server-*.log"

# 实时查看错误日志
ssh username@your-server-ip "tail -f /path/to/fluiddam/logs/error-*.log"

# 查看分享相关日志
ssh username@your-server-ip "grep -i '分享\|share' /path/to/fluiddam/logs/*.log"
```

### 下载日志到本地
```bash
# 下载今天的日志
scp username@your-server-ip:/path/to/fluiddam/logs/server-$(date +%Y-%m-%d).log ./

# 下载所有日志
scp -r username@your-server-ip:/path/to/fluiddam/logs/ ./
```

## 🌐 方法2：Web界面查看（推荐）

### 创建简单的Web日志查看器
```javascript
// 在server.js中添加日志查看API
app.get('/api/logs', (req, res) => {
  const logType = req.query.type || 'server';
  const lines = parseInt(req.query.lines) || 100;
  const date = req.query.date || new Date().toISOString().split('T')[0];
  
  try {
    const logFile = path.join(logsDir, `${logType}-${date}.log`);
    if (!fs.existsSync(logFile)) {
      return res.json({ success: false, message: '日志文件不存在' });
    }
    
    const content = fs.readFileSync(logFile, 'utf8');
    const logLines = content.split('\n').slice(-lines);
    
    res.json({
      success: true,
      logs: logLines,
      totalLines: content.split('\n').length,
      file: logFile
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
```

## 📱 方法3：使用日志聚合工具

### 使用rsyslog
```bash
# 安装rsyslog
sudo apt-get install rsyslog

# 配置rsyslog转发日志
echo "*.* @@your-log-server:514" | sudo tee -a /etc/rsyslog.conf
sudo systemctl restart rsyslog
```

### 使用Fluentd
```bash
# 安装Fluentd
curl -L https://toolbelt.treasuredata.com/sh/install-ubuntu-focal-td-agent4.sh | sh

# 配置Fluentd转发日志
sudo nano /etc/td-agent/td-agent.conf
```

## 🔧 方法4：使用云服务

### AWS CloudWatch
```bash
# 安装CloudWatch Agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb

# 配置日志收集
sudo nano /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
```

### 阿里云SLS
```bash
# 安装Logtail
wget https://logtail-release-cn-hangzhou.oss-cn-hangzhou.aliyuncs.com/linux64/logtail-linux64.tar.gz
tar -xzf logtail-linux64.tar.gz
sudo ./logtail-linux64/install.sh
```

## 🛠️ 方法5：自定义远程日志工具

### 创建远程日志查看脚本
```bash
#!/bin/bash
# remote-logs.sh - 远程日志查看工具

SERVER="your-server-ip"
USER="username"
LOG_PATH="/path/to/fluiddam/logs"

case "$1" in
    "live")
        ssh $USER@$SERVER "tail -f $LOG_PATH/server-*.log"
        ;;
    "errors")
        ssh $USER@$SERVER "tail -f $LOG_PATH/error-*.log"
        ;;
    "share")
        ssh $USER@$SERVER "grep -i '分享\|share' $LOG_PATH/*.log"
        ;;
    "download")
        scp -r $USER@$SERVER:$LOG_PATH/ ./logs/
        echo "日志已下载到本地 logs/ 目录"
        ;;
    "stats")
        ssh $USER@$SERVER "cd $LOG_PATH && echo '=== 日志统计 ===' && echo '总日志文件数:' \$(ls *.log | wc -l) && echo '今天的日志行数:' \$(wc -l < server-\$(date +%Y-%m-%d).log 2>/dev/null || echo 0) && echo '错误日志行数:' \$(wc -l < error-\$(date +%Y-%m-%d).log 2>/dev/null || echo 0)"
        ;;
    *)
        echo "用法: $0 [live|errors|share|download|stats]"
        echo "  live     - 实时查看日志"
        echo "  errors   - 查看错误日志"
        echo "  share    - 查看分享相关日志"
        echo "  download - 下载日志到本地"
        echo "  stats    - 查看日志统计"
        ;;
esac
```

## 🔍 方法6：使用日志分析工具

### 使用ELK Stack
```bash
# 安装Elasticsearch
wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-8.11.0-linux-x86_64.tar.gz
tar -xzf elasticsearch-8.11.0-linux-x86_64.tar.gz

# 安装Logstash
wget https://artifacts.elastic.co/downloads/logstash/logstash-8.11.0-linux-x86_64.tar.gz
tar -xzf logstash-8.11.0-linux-x86_64.tar.gz

# 安装Kibana
wget https://artifacts.elastic.co/downloads/kibana/kibana-8.11.0-linux-x86_64.tar.gz
tar -xzf kibana-8.11.0-linux-x86_64.tar.gz
```

### 使用Grafana + Loki
```bash
# 安装Loki
wget https://github.com/grafana/loki/releases/download/v2.9.0/loki-linux-amd64.zip
unzip loki-linux-amd64.zip

# 安装Promtail
wget https://github.com/grafana/loki/releases/download/v2.9.0/promtail-linux-amd64.zip
unzip promtail-linux-amd64.zip
```

## 📊 方法7：实时监控和告警

### 设置日志监控脚本
```bash
#!/bin/bash
# monitor-logs.sh - 日志监控脚本

SERVER="your-server-ip"
USER="username"
LOG_PATH="/path/to/fluiddam/logs"
WEBHOOK_URL="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"

# 检查错误数量
ERROR_COUNT=$(ssh $USER@$SERVER "grep -c 'ERROR' $LOG_PATH/error-\$(date +%Y-%m-%d).log 2>/dev/null || echo 0")

if [ $ERROR_COUNT -gt 10 ]; then
    # 发送告警到Slack
    curl -X POST -H 'Content-type: application/json' \
        --data "{\"text\":\"🚨 FluidDAM服务器错误数量过多: $ERROR_COUNT\"}" \
        $WEBHOOK_URL
fi
```

## 🔐 安全考虑

### SSH密钥认证
```bash
# 生成SSH密钥对
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"

# 复制公钥到服务器
ssh-copy-id username@your-server-ip

# 配置SSH客户端
echo "Host fluiddam-server
    HostName your-server-ip
    User username
    Port 22
    IdentityFile ~/.ssh/id_rsa" >> ~/.ssh/config
```

### 日志访问控制
```bash
# 设置日志文件权限
chmod 640 /path/to/fluiddam/logs/*.log
chown root:fluiddam /path/to/fluiddam/logs/*.log

# 创建只读用户
sudo useradd -r -s /bin/false logviewer
sudo usermod -a -G fluiddam logviewer
```

## 📱 移动端查看

### 使用Termux (Android)
```bash
# 安装Termux
# 从Google Play或F-Droid安装

# 安装SSH客户端
pkg install openssh

# 连接服务器
ssh username@your-server-ip

# 查看日志
tail -f /path/to/fluiddam/logs/server-*.log
```

### 使用iSSH (iOS)
```bash
# 从App Store安装iSSH
# 配置SSH连接
# 使用内置终端查看日志
```

## 🎯 推荐方案

1. **简单场景**: SSH + 脚本
2. **中等规模**: Web界面 + API
3. **大规模**: ELK Stack 或 Grafana + Loki
4. **移动端**: Termux (Android) 或 iSSH (iOS)

选择适合您需求的方案！
