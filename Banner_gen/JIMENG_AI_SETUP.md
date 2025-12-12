# 即梦 AI 配置说明

## 环境变量配置

在 `Banner_gen` 目录下创建 `.env` 文件，添加以下配置：

```env
# 即梦 AI API 配置
# 从即梦 AI 控制台获取 API Key 和 Secret
VITE_JIMENG_AI_API_KEY=your_api_key_here
VITE_JIMENG_AI_API_SECRET=your_api_secret_here
VITE_JIMENG_AI_BASE_URL=https://visual.volcengineapi.com
```

**注意**：由于 CORS 限制，即梦 AI API 需要通过后端代理调用。环境变量会在后端服务器（`server.js`）中读取。

## 安装依赖

确保已安装必要的依赖：

```bash
cd Banner_gen
npm install express cors multer dotenv
```

## 启动后端服务器

即梦 AI 代理端点已合并到统一 API 服务器（FluidDAM/server.js，运行在 `3001` 端口）：

```bash
# 在 FluidDAM 目录下
npm run server
```

或者使用 `start-all.bat` 启动所有服务（包括统一 API 服务器）。

## 获取 API Key

1. 登录即梦 AI 控制台
2. 进入 API 管理页面
3. 创建新的 API Key 和 Secret
4. 将 Key 和 Secret 填入 `.env` 文件

## 工作原理

1. 前端调用 `/api/jimeng-ai/generate` 端点（统一 API 服务器，3001 端口）
2. 统一 API 服务器（FluidDAM/server.js）读取 `.env` 文件中的 API Key
3. 统一 API 服务器调用即梦 AI API（避免 CORS 问题）
4. 统一 API 服务器返回结果给前端

**注意**：`.env` 文件可以放在 `FluidDAM` 目录或项目根目录，统一 API 服务器会自动读取。

## 注意事项

- `.env` 文件已添加到 `.gitignore`，不会被提交到版本控制
- 请勿将 API Key 直接写在代码中
- 生产环境部署时，需要在服务器上配置相应的环境变量
- 确保统一 API 服务器（`FluidDAM/server.js`，3001 端口）正在运行，否则前端无法调用即梦 AI API
- 如果 FluidDAM/package.json 中没有 `dotenv` 依赖，需要安装：`cd FluidDAM && npm install dotenv`

## API 文档

即梦 AI 图片生成 4.0 接口文档：
https://www.volcengine.com/docs/85621/1817045?lang=zh

