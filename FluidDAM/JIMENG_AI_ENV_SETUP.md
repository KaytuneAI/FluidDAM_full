# 即梦 AI 环境变量配置指南

## 📍 .env 文件位置

**`.env` 文件必须放在 `FluidDAM/` 目录下**（与 `server.js` 同级目录）

```
FluidDAM/
├── server.js          ← 服务器主文件
├── .env               ← 环境变量文件（需要创建）
├── package.json
└── ...
```

## 🔑 配置步骤

### 1. 创建 .env 文件

在 `FluidDAM/` 目录下创建 `.env` 文件，内容如下：

```env
# 火山引擎 OpenAPI 配置（用于即梦 AI 图片生成）

# 火山引擎 Access Key ID（必填）
VOLC_ACCESSKEY=your_access_key_here

# 火山引擎 Secret Access Key（必填）
VOLC_SECRETKEY=your_secret_key_here

# 火山引擎区域（可选，默认为 cn-north-1）
VOLC_REGION=cn-north-1

# 即梦 AI API 基础 URL（可选，默认为 https://visual.volcengineapi.com）
# JIMENG_AI_BASE_URL=https://visual.volcengineapi.com

# 即梦 AI 图生图（I2I）req_key（可选，默认为 jimeng_i2i_v40）
# 如果控制台显示的 I2I req_key 不同，请修改此值
# JIMENG_I2I_REQ_KEY=jimeng_i2i_v40
```

### 2. 填入你的密钥

将 `your_access_key_here` 和 `your_secret_key_here` 替换为你在火山引擎控制台获取的实际密钥。

### 3. 重启服务器

配置完成后，需要重启服务器才能生效：

- 如果使用 `start-all.bat`：先运行 `stop-all.bat`，再运行 `start-all.bat`
- 如果使用 `start-production.bat`：先运行 `stop-production.bat`，再运行 `start-production.bat`

## ⚠️ 注意事项

1. **不要将 .env 文件提交到 Git**：`.env` 文件已包含在 `.gitignore` 中，不会被提交
2. **密钥安全**：确保 `.env` 文件只包含你的密钥，不要分享给他人
3. **文件位置**：`.env` 文件必须在 `FluidDAM/` 目录下，否则服务器无法读取

## 🔍 验证配置

配置完成后，可以通过以下方式验证：

1. 检查服务器启动日志，确认没有 "API Key 或 Secret 未配置" 的错误
2. 在前端尝试生成图片，如果配置正确，应该能够成功调用即梦 AI API

## 📝 获取火山引擎密钥

如果你还没有火山引擎的 Access Key 和 Secret Key，请：

1. 登录火山引擎控制台：https://console.volcengine.com/
2. 进入「访问控制」→「密钥管理」
3. 创建新的 Access Key，获取 Access Key ID 和 Secret Access Key
