# Brief（完整闭环）：SpotStudio 的 Local Library Load/Unload + 本机素材库服务实现

## 目标

在 SpotStudio 里增加 **Local Library（本机素材库）**能力：

* **Load**：从本机目录扫描素材 → 在右侧素材区展示缩略图列表 → 可拖拽/可插入画布（先做到"能选中拿到 URL"也行）
* **Unload**：右侧本机素材分组隐藏并清空
* dev 环境解决 5174 → 3001 跨端口（用 Vite proxy）；prod 环境 Nginx 单域名同路径反代

---

## Part A：实现"本机素材库服务"（集成到统一后端 3001）

> 这部分是你现在缺的：真正把本机目录素材"列出来 + 可访问"。

### A1. 在 `FluidDAM/server.js` 中新增本机素材库路由

**位置：** 集成到现有的 `FluidDAM/server.js`（统一后端 3001），新增路由组 `/api/local-lib/*`

#### 配置

在 `FluidDAM/.env` 添加：

```env
# 本机素材库根目录（Windows 路径）
LOCAL_ASSET_ROOT=C:\MyAssets\Images
# 或相对路径（相对于 FluidDAM 目录）
# LOCAL_ASSET_ROOT=./local-assets

# 缩略图缓存目录
LOCAL_ASSET_THUMB_CACHE=./.cache/thumbs

# 支持的图片扩展名（逗号分隔）
LOCAL_ASSET_IMAGE_EXTS=jpg,jpeg,png,webp,gif,bmp,svg

# 是否递归扫描子目录（默认 true）
LOCAL_ASSET_RECURSIVE=true

# 最大扫描深度（默认 10）
LOCAL_ASSET_MAX_DEPTH=10
```

#### API 1：列出素材

`GET /api/local-lib/assets?recursive=1&limit=500&ext=jpg,png,webp,gif&q=keyword`

**查询参数：**
- `recursive` (0/1): 是否递归扫描子目录，默认 1
- `limit` (number): 返回数量限制，默认 500
- `ext` (string): 文件扩展名过滤，逗号分隔，如 `jpg,png,webp`
- `q` (string): 文件名模糊搜索（可选）

**返回结构：**

```json
{
  "success": true,
  "data": [
    {
      "id": "hash-or-relative-path",
      "name": "holiday-banner.jpg",
      "relPath": "2025/holiday/holiday-banner.jpg",
      "type": "image",
      "mimeType": "image/jpeg",
      "size": 123456,
      "mtime": 1730000000000,
      "url": "/local-lib/api/assets/2025/holiday/holiday-banner.jpg",
      "thumbUrl": "/local-lib/api/thumbs/2025/holiday/holiday-banner.jpg",
      "width": 1920,
      "height": 1080
    }
  ],
  "total": 150,
  "count": 50
}
```

**实现要点：**
- 使用 `fs.readdir` 或 `fast-glob` 扫描目录
- 对每个文件计算相对路径 hash 作为 `id`（或直接用 `relPath`）
- 只返回图片文件（根据 `LOCAL_ASSET_IMAGE_EXTS`）
- 支持分页（`limit` + `offset`，可选）
- 使用 `sharp` 或 `jimp` 获取图片尺寸（如果文件支持）

#### API 2：静态访问原图

`GET /api/local-lib/assets/*` → 映射到 `LOCAL_ASSET_ROOT`

**实现要点：**
- 使用 `express.static` 或手动 `fs.readFile` + `res.sendFile`
- **必须防路径穿越**：验证请求路径在 `LOCAL_ASSET_ROOT` 下
- 设置正确的 `Content-Type`（根据文件扩展名）
- 支持 `Range` 请求（视频/大文件）

**路径穿越防护示例：**

```js
import path from 'path';
import fs from 'fs';

app.get('/api/local-lib/assets/*', (req, res) => {
  const requestedPath = req.params[0]; // 相对路径，如 "2025/holiday/banner.jpg"
  const assetRoot = process.env.LOCAL_ASSET_ROOT || './local-assets';
  const fullPath = path.join(assetRoot, requestedPath);
  const normalizedPath = path.normalize(fullPath);
  const resolvedRoot = path.resolve(assetRoot);
  
  // 防路径穿越：确保 normalizedPath 在 LOCAL_ASSET_ROOT 下
  if (!normalizedPath.startsWith(resolvedRoot)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  
  if (!fs.existsSync(normalizedPath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }
  
  // 设置正确的 Content-Type
  const ext = path.extname(normalizedPath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml'
  };
  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  
  res.sendFile(normalizedPath);
});
```

#### API 3：缩略图（强烈建议，不然列表会卡）

`GET /api/local-lib/thumbs/*`

**实现要点：**
- 如果缩略图已存在（`.cache/thumbs/...`），直接返回
- 如果不存在：使用 `sharp` 生成缩略图（256px 宽，保持比例）
- 缓存到 `LOCAL_ASSET_THUMB_CACHE` 目录
- 视频可先不做缩略图，或返回默认 icon

**sharp 生成缩略图示例：**

```js
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

app.get('/api/local-lib/thumbs/*', async (req, res) => {
  const requestedPath = req.params[0];
  const assetRoot = process.env.LOCAL_ASSET_ROOT || './local-assets';
  const thumbCache = process.env.LOCAL_ASSET_THUMB_CACHE || './.cache/thumbs';
  const fullPath = path.join(assetRoot, requestedPath);
  const thumbPath = path.join(thumbCache, requestedPath);
  
  // 防路径穿越（同上）
  if (!isPathSafe(fullPath, assetRoot)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  
  // 如果缩略图已存在，直接返回
  if (fs.existsSync(thumbPath)) {
    return res.sendFile(thumbPath);
  }
  
  // 确保缩略图目录存在
  const thumbDir = path.dirname(thumbPath);
  if (!fs.existsSync(thumbDir)) {
    fs.mkdirSync(thumbDir, { recursive: true });
  }
  
  // 生成缩略图
  try {
    await sharp(fullPath)
      .resize(256, null, { withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);
    
    res.sendFile(thumbPath);
  } catch (error) {
    console.error('[LocalAssetServer] 生成缩略图失败:', error);
    res.status(500).json({ success: false, message: 'Failed to generate thumbnail' });
  }
});
```

#### 性能/体验

* 列表默认只扫图片（jpg/png/webp），视频后续加
* 支持 `recursive=0` 只扫一层
* 支持 `q=` 模糊搜索（可选）
* 首次扫描可能较慢，考虑缓存文件列表（可选）

---

## Part B：SpotStudio（5174）里的 Load/Unload Toggle + 数据流

### B1. 修改 `LocalAssetToggleButton.jsx` 支持从服务端加载

**当前状态：** `LocalAssetToggleButton` 使用 `localAssetManager.loadAssets()` 从 IndexedDB 加载（这是从 Banner/Template 保存的素材）。

**新需求：** 从本机文件系统目录加载素材（通过 API）。

**实现方案：**

修改 `FluidDAM/src/components/LocalAssetToggleButton.jsx`：

1. **新增状态：**
   ```js
   const [localLibEnabled, setLocalLibEnabled] = useState(false);
   const [localLibAssets, setLocalLibAssets] = useState([]);
   const [localLibLoading, setLocalLibLoading] = useState(false);
   ```

2. **新增函数：`loadLocalLibAssets()`**
   ```js
   const loadLocalLibAssets = async () => {
     setLocalLibLoading(true);
     try {
       // 请求服务端 API（使用相对路径，由 Vite proxy 转发）
       const response = await fetch('/local-lib/api/assets?recursive=1&limit=500&ext=jpg,png,webp,gif');
       const result = await response.json();
       
       if (result.success && result.data) {
         setLocalLibAssets(result.data);
         setLocalLibEnabled(true);
         console.log(`[LocalAssetToggleButton] 加载了 ${result.data.length} 个本机素材`);
       } else {
         throw new Error(result.message || '加载失败');
       }
     } catch (error) {
       console.error('[LocalAssetToggleButton] 加载本机素材库失败:', error);
       alert('加载本机素材库失败，请查看控制台');
     } finally {
       setLocalLibLoading(false);
     }
   };
   ```

3. **修改 `handleLoad()`：**
   - 如果 `localLibEnabled === false`，调用 `loadLocalLibAssets()`
   - 如果 `localLibEnabled === true`，调用现有的 `handleUnload()`

4. **修改 `handleUnload()`：**
   - 清空 `localLibAssets`
   - 设置 `localLibEnabled = false`
   - 可选：同时卸载已添加到编辑器的本机素材（现有逻辑）

5. **将 `localLibAssets` 和 `localLibEnabled` 通过 props 或 context 传递给 `IntegratedAssetSidebar`**

### B2. SpotStudio 只请求同源路径（关键）

**SpotStudio 内永远 fetch：**

* `GET /local-lib/api/assets`（不是 `http://localhost:3001/api/local-lib/assets`）
* 图片地址用：`/local-lib/api/assets/...` 和 `/local-lib/api/thumbs/...`

**不要在前端写死 `http://localhost:5174` 或 `http://localhost:3001`**

### B3. 在 `IntegratedAssetSidebar.jsx` 中显示本机素材分组

**修改 `FluidDAM/src/components/IntegratedAssetSidebar.jsx`：**

1. **接收 `localLibAssets` 和 `localLibEnabled` 状态**（通过 props）

   ```js
   export default function IntegratedAssetSidebar({ 
     editor, 
     selectedFrame, 
     setIsLoading, 
     platform = "TM", 
     width, 
     onReset, 
     collapsed, 
     onToggleCollapse, 
     onScrollToAsset,
     localLibAssets = [],      // 新增
     localLibEnabled = false   // 新增
   }) {
   ```

2. **新增分组渲染：**
   ```jsx
   {localLibEnabled && localLibAssets.length > 0 && (
     <div className="asset-group" style={{ marginTop: '16px' }}>
       <div className="asset-group-header" style={{ 
         padding: '8px', 
         backgroundColor: '#f5f5f5', 
         fontWeight: 'bold',
         borderBottom: '1px solid #ddd'
       }}>
         <span>本机素材库 ({localLibAssets.length})</span>
       </div>
       <div className="asset-grid" style={{
         display: 'grid',
         gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
         gap: '8px',
         padding: '8px'
       }}>
         {localLibAssets.map((asset) => (
           <div
             key={asset.id}
             className="asset-item"
             onClick={() => handleSelectLocalLibAsset(asset)}
             title={asset.name}
             style={{
               cursor: 'pointer',
               border: '1px solid #ddd',
               borderRadius: '4px',
               overflow: 'hidden',
               position: 'relative'
             }}
           >
             <img
               src={asset.thumbUrl || asset.url}
               alt={asset.name}
               loading="lazy"
               style={{
                 width: '100%',
                 height: '80px',
                 objectFit: 'cover'
               }}
               onError={(e) => {
                 // 如果缩略图加载失败，使用原图
                 if (e.target.src !== asset.url) {
                   e.target.src = asset.url;
                 }
               }}
             />
             <div className="asset-name" style={{
               padding: '4px',
               fontSize: '11px',
               textOverflow: 'ellipsis',
               overflow: 'hidden',
               whiteSpace: 'nowrap'
             }}>
               {asset.name}
             </div>
           </div>
         ))}
       </div>
     </div>
   )}
   ```

3. **处理选中素材：**
   ```js
   const handleSelectLocalLibAsset = (asset) => {
     // 方案 1：直接插入到画布（如果已有插入逻辑）
     if (selectedFrame && editor) {
       placeAssetIntoSelectedFrame(editor, selectedFrame, asset.url, asset.name);
     } else {
       // 方案 2：先设置选中状态，用户点击"插入"按钮时再插入
       console.log('[IntegratedAssetSidebar] 选中本机素材:', asset);
       // 可以在这里设置一个 selectedLocalLibAsset 状态
     }
   };
   ```

4. **修改 `LocalAssetToggleButton` 的调用，传递状态：**
   ```jsx
   // 在 IntegratedAssetSidebar 中
   const [localLibAssets, setLocalLibAssets] = useState([]);
   const [localLibEnabled, setLocalLibEnabled] = useState(false);
   
   // 修改 LocalAssetToggleButton 的调用
   <LocalAssetToggleButton 
     editor={editor} 
     onLoadComplete={(assets) => {
       setLocalLibAssets(assets);
       setLocalLibEnabled(true);
     }}
     onUnloadComplete={() => {
       setLocalLibAssets([]);
       setLocalLibEnabled(false);
     }}
   />
   ```

### B4. 最小可用的"用起来"

先做到这三步就算 MVP：

1. ✅ 右侧列表能显示缩略图 + 文件名
2. ✅ 点击素材能把 `asset.url` 写进"当前选中素材"状态
3. ✅ 画布插入如果现在没通，就先 console.log / toast "selected url ready"

---

## Part C：解决 dev 环境 5174 → 3001（Vite Proxy）

**在 SpotStudio 的 `FluidDAM/vite.config.js` 加 proxy 配置：**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/spotstudio/' : '/',
  
  plugins: [react()],
  
  server: {
    port: 5174,
    host: true,
    allowedHosts: ['liquora.cn'],
    // 新增：代理本机素材库 API 到后端 3001
    proxy: {
      '/local-lib': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/local-lib/, '/api/local-lib'),
        // 可选：配置 WebSocket（如果需要）
        ws: false,
      },
    },
  },
  
  // ... 其他配置保持不变
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    sourcemap: true,
    outDir: 'dist',
    alias: {
      '@shared': path.resolve(__dirname, '../src/shared'),
    },
  },
}))
```

**说明：**
- `/local-lib/api/assets` → `http://localhost:3001/api/local-lib/assets`
- `/local-lib/api/assets/xxx.jpg` → `http://localhost:3001/api/local-lib/assets/xxx.jpg`
- `/local-lib/api/thumbs/xxx.jpg` → `http://localhost:3001/api/local-lib/thumbs/xxx.jpg`

这样 dev 环境不会有 CORS 问题。

---

## Part D：生产 Nginx 配置（同路径反代）

**在 Nginx 配置中增加：**

```nginx
# 本机素材库 API 代理
location /local-lib/ {
    proxy_pass http://localhost:3001/api/local-lib/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_cache_bypass $http_upgrade;
    
    # 大文件支持
    proxy_request_buffering off;
    client_max_body_size 100M;
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

**保持与 dev 一致的路径结构：** `/local-lib/...` → 后端 `/api/local-lib/...`

---

## 验收标准（一次性验收）

1. ✅ 本机素材库服务启动后，访问 `http://localhost:3001/api/local-lib/assets` 能返回素材列表
2. ✅ `http://localhost:3001/api/local-lib/assets/...` 能打开图片
3. ✅ `http://localhost:3001/api/local-lib/thumbs/...` 能返回缩略图
4. ✅ SpotStudio toggle ON 后能看到素材分组和缩略图
5. ✅ toggle OFF 后分组消失/清空
6. ✅ dev 环境 SpotStudio 不直接跨域请求 3001（只请求 `/local-lib/...`，由 Vite proxy 转发）
7. ✅ 生产环境 Nginx 能正确代理 `/local-lib/` 到后端

---

## 给 Cursor 的实现顺序建议

1. **先把 LocalAssetServer API 跑通**（在 `FluidDAM/server.js` 中新增路由）
   - `GET /api/local-lib/assets`（列表）
   - `GET /api/local-lib/assets/*`（原图）
   - `GET /api/local-lib/thumbs/*`（缩略图）
   - 测试：直接用浏览器访问这些 API

2. **再加 Vite proxy**
   - 修改 `FluidDAM/vite.config.js`
   - 测试：在 SpotStudio 中 fetch `/local-lib/api/assets` 能正常返回

3. **最后加 SpotStudio UI + toggle + 列表渲染**
   - 修改 `LocalAssetToggleButton.jsx`
   - 修改 `IntegratedAssetSidebar.jsx`
   - 测试：toggle ON/OFF 能正常显示/隐藏素材

---

## 依赖安装

如果需要使用 `sharp` 生成缩略图：

```bash
cd FluidDAM
npm install sharp
```

如果需要使用 `fast-glob` 快速扫描目录：

```bash
npm install fast-glob
```

---

## 注意事项

1. **路径穿越防护**：必须验证请求路径在 `LOCAL_ASSET_ROOT` 下
2. **性能优化**：首次扫描可能较慢，考虑缓存文件列表（可选）
3. **错误处理**：文件不存在、权限不足等情况要妥善处理
4. **跨平台路径**：Windows 和 Linux 路径处理要兼容
5. **环境变量**：确保 `.env` 文件被正确加载（使用 `dotenv`）

---

## 可选增强功能（后续）

1. **文件搜索**：支持按文件名、扩展名、修改时间过滤
2. **分页加载**：大量文件时支持分页
3. **视频支持**：扫描并显示视频文件，生成视频缩略图
4. **文件夹导航**：支持按文件夹浏览，而不是平铺所有文件
5. **缓存策略**：缓存文件列表和缩略图，减少重复扫描
6. **拖拽上传**：支持拖拽文件到本机素材库目录
