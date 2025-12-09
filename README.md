# FluidDAM 统一入口

这是一个统一入口应用，整合了 Banner_gen 和 FluidDAM 两个应用。

## 项目结构

```
FluidDAM_Full/
├── Banner_gen/          # Banner 批量生成应用
├── FluidDAM/            # Fluid DAM 交互式画布应用
├── src/                 # 统一入口应用源码
├── index.html           # 统一入口 HTML
├── package.json         # 统一入口依赖
└── vite.config.ts       # 统一入口配置
```

## 快速开始

### 1. 安装依赖

在根目录安装统一入口的依赖：

```bash
npm install
```

### 2. 安装子应用依赖

分别进入两个子应用目录安装依赖：

```bash
# Banner_gen
cd Banner_gen
npm install
cd ..

# FluidDAM
cd FluidDAM
npm install
cd ..
```

### 3. 启动应用

**方式一：使用批处理文件一键启动（推荐，Windows）**

双击运行 `start-all.bat` 文件，它会自动：
- 检查并安装缺失的依赖
- 在三个独立的窗口中启动所有应用

启动后访问 `http://localhost:3000` 即可看到统一入口页面。

要停止所有应用，双击运行 `stop-all.bat` 文件。

**方式二：手动分别启动**

打开三个终端窗口：

```bash
# 终端 1: 启动统一入口（端口 3000）
npm run dev

# 终端 2: 启动 Banner_gen（端口 5174）
cd Banner_gen
npm run dev

# 终端 3: 启动 FluidDAM（端口 5173）
cd FluidDAM
npm run dev
```

然后访问 `http://localhost:3000` 即可看到统一入口页面。

**方式二：使用环境变量配置**

如果需要修改子应用的端口或 URL，可以创建 `.env` 文件：

```env
VITE_BANNER_GEN_URL=http://localhost:5174
VITE_FLUIDDAM_URL=http://localhost:5173
```

## 功能说明

统一入口页面提供了两个按钮：

1. **Banner 批量生成** - 跳转到 Banner_gen 应用
2. **Fluid DAM** - 跳转到 FluidDAM 应用

点击按钮后会跳转到对应的子应用。

## 构建部署

### 开发环境

按照上述步骤分别启动三个应用。

### 生产环境

如果需要构建生产版本：

```bash
# 构建统一入口
npm run build

# 构建 Banner_gen
cd Banner_gen
npm run build
cd ..

# 构建 FluidDAM
cd FluidDAM
npm run build
cd ..
```

然后配置 Web 服务器（如 Nginx）将不同路径代理到对应的应用。

## 注意事项

- 确保三个应用使用不同的端口，避免冲突
- 统一入口默认运行在 3000 端口
- Banner_gen 默认运行在 5174 端口（Vite 默认）
- FluidDAM 默认运行在 5173 端口（已配置）

## 端口配置

如果需要修改端口，可以：

1. **统一入口**: 修改 `vite.config.ts` 中的 `server.port`
2. **Banner_gen**: 修改 `Banner_gen/vite.config.ts` 中的 `server.port`
3. **FluidDAM**: 修改 `FluidDAM/vite.config.js` 中的 `server.port`

然后更新 `src/pages/HomePage.tsx` 中的默认 URL 或创建 `.env` 文件。

