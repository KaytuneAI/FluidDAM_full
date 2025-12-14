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

# 即梦 AI 图生图（I2I）req_key（可选，默认为 jimeng_i2i_v30）
# 注意：req_key 体系是存量接口，新功能建议使用 ModelArk 体系
# JIMENG_I2I_REQ_KEY=jimeng_i2i_v30

# ============================================
# ModelArk 体系配置（即梦 4.0，主推）
# ============================================
# ModelArk Access Token（用于即梦 4.0 i2i，推荐使用）
# 从火山引擎控制台获取 ModelArk 的 Access Token
# 注意：ModelArk 使用 Bearer Token 认证，与 req_key 体系不同
# MODELARK_ACCESS_TOKEN=your_modelark_token_here
# 或者使用：
# VOLC_MODELARK_TOKEN=your_modelark_token_here
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

### 方式 1：req_key 体系（存量接口）

如果你还没有火山引擎的 Access Key 和 Secret Key，请：

1. 登录火山引擎控制台：https://console.volcengine.com/
2. 进入「访问控制」→「密钥管理」
3. 创建新的 Access Key，获取 Access Key ID 和 Secret Access Key

### 方式 2：ModelArk 体系（即梦 4.0，推荐）

**ModelArk 使用 Bearer Token 认证，需要单独获取：**

#### 获取 ModelArk Access Token 的步骤：

1. **登录火山引擎控制台**
   - 访问：https://console.volcengine.com/
   - 使用你的账号登录

2. **进入 ModelArk 或即梦 AI 页面**
   - 在控制台搜索「ModelArk」或「即梦 AI」
   - 或直接访问：https://console.volcengine.com/modelark（如果可用）

3. **查找 API 密钥/Token 管理**
   - 在 ModelArk 页面中找到「API 密钥」、「Access Token」或「密钥管理」相关入口
   - 通常位于「设置」、「API 管理」或「开发者工具」等菜单下

4. **创建或查看 Access Token**
   - 如果是首次使用，点击「创建 Token」或「生成 Token」
   - 如果已有 Token，直接复制即可
   - **注意：Token 通常只显示一次，请妥善保存**

5. **配置到 .env 文件**
   ```env
   # ModelArk Access Token（用于即梦 4.0）
   MODELARK_ACCESS_TOKEN=你的token_here
   # 或者使用：
   VOLC_MODELARK_TOKEN=你的token_here
   ```

#### 如果找不到 ModelArk Token：

**备选方案 1：使用 Access Key ID 作为临时方案**
- 代码中已支持：如果没有配置 `MODELARK_ACCESS_TOKEN`，会尝试使用 `VOLC_ACCESSKEY`
- 但这可能不是正确的认证方式，建议联系火山引擎技术支持确认

**备选方案 2：联系火山引擎技术支持**
- 确认 ModelArk 的 Access Token 获取方式
- 确认你的账号是否已开通 ModelArk 服务
- 确认是否需要单独申请 ModelArk 权限

**备选方案 3：查看火山引擎文档**
- 访问：https://www.volcengine.com/docs/
- 搜索「ModelArk」或「即梦 AI 4.0」
- 查看官方文档中的认证方式说明

#### 注意事项：

- ModelArk 体系是即梦 4.0 的主推接口
- 支持 i2i 4.0 和局部编辑（mask）
- 参数更简单，使用 `image` 字段（string，不是数组）
- 推荐新功能使用 ModelArk 体系
- **如果暂时无法获取 ModelArk Token，可以继续使用 req_key 体系（`/api/jimeng-ai/generate`）**

## 🔄 两种体系对比

| 特性 | req_key 体系 | ModelArk 体系 |
|------|-------------|--------------|
| 状态 | 存量接口 | 主推接口 |
| i2i 4.0 | ⚠️ 支持但不稳定 | ✅ 官方推荐 |
| 参数复杂度 | ❌ 高（binary_data_base64[]） | ✅ 低（image string） |
| 局部编辑 | ⚠️ 能但复杂 | ✅ 原生支持（mask） |
| 认证方式 | HMAC 签名 | Bearer Token |
| 推荐场景 | 现有功能保持 | 新功能开发 |
