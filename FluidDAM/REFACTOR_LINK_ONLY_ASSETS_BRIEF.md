# Brief：舍弃 5174 本机素材库，统一以 5173 的 Link 作为唯一素材入口（SpotStudio + BannerGen 共用）

## 目标

1. **删除/停用所有 5174 本机素材库相关逻辑**（服务、proxy、fetch、toggle、端口依赖）
2. SpotStudio 右侧素材区只展示两类来源：
   * **Link 导入的素材**（本地文件夹 / Zip / 外部 DAM URL 都归 Link）
   * （可选）Project 内部素材（SpotStudio 自己生成/保存的）
3. BannerGen 的素材也只从 Link 来：Link → BannerGen（通过 sessionStorage 或统一 store/接口）

---

## Part A：移除 5174 相关内容（必须一刀切）

### A1. 前端代码清理

**需要删除/替换的文件和代码：**

1. **`FluidDAM/src/components/LocalAssetToggleButton.jsx`**
   - 删除整个文件（不再需要本机素材扫描）
   - 或重构为 `LinkAssetToggleButton.jsx`（只做 UI 过滤，不扫描）

2. **`FluidDAM/src/MainCanvas.jsx`**
   - 删除 `loadLocalAssets()` 函数（第 943-982 行）
   - 删除所有调用 `loadLocalAssets()` 的地方
   - 删除 `import { localAssetManager } from '@shared/utils/localAssetManager'`（如果不再需要）

3. **`FluidDAM/src/components/IntegratedAssetSidebar.jsx`**
   - 删除 `<LocalAssetToggleButton editor={editor} />`（第 297 行）
   - 删除 `import LocalAssetToggleButton from './LocalAssetToggleButton.jsx'`（第 11 行）

4. **`FluidDAM/vite.config.js`**
   - 删除 `/local-lib` proxy 配置（如果存在）

5. **`FluidDAM/LOCAL_ASSET_LIBRARY_BRIEF.md`**
   - 删除或标记为废弃

6. **全局搜索并替换：**
   - `5174` → 检查是否与端口相关，如果是本机素材库相关则删除
   - `/local-lib` → 删除所有相关代码
   - `localAssetManager.loadAssets()` → 删除（不再从 IndexedDB 加载本机素材）

### A2. 后端代码清理

**`FluidDAM/server.js`：**
- 删除 `/api/local-lib/*` 相关路由（如果已添加）
- 保留 `/api/link-to-spot-assets` 端点（这是跨端口传递用的，不是本机素材库）

### A3. 启动脚本/README 清理

**`start-all.bat` / `stop-all.bat`：**
- 检查是否有 5174 启动项，如果有则删除或注释掉
- 更新文档说明，删除 5174 相关描述

---

## Part B：把"本机素材"能力并入 Link（5173 内）

> 重点：用户要的"Load/Unload"其实不是端口问题，而是"是否把素材源展示到侧边栏"。这完全可以由 Link 的"已导入素材清单"控制。

### B1. Link 作为唯一素材入口

**Link 页面/模块提供：**

* 导入方式：
  1. 选择本机文件夹（如果浏览器能力限制，就用 zip 导入/多文件导入）
  2. zip 导入（你们现成的链路应该已经很强）
  3. 外部 DAM URL（未来 API）

* 导入后生成标准化资产结构（使用现有的 `TempAsset` 类型）：

```ts
// 使用现有的 TempAsset 类型（src/shared/types/assets.ts）
type TempAsset = {
  id: string
  name: string
  type: 'image' | 'video' | 'psd' | 'other'
  dataUrl: string        // base64 或 blob URL
  mimeType?: string
  width?: number
  height?: number
  source: 'link' | 'template-gen' | 'banner-gen'
  // ... 其他字段
}
```

### B2. "Load/Unload"在 SpotStudio 侧的行为定义（不再触发扫描）

**新的行为：**
* **Load** = "把 Link 当前已导入的素材，展示到 SpotStudio 右侧素材区"
* **Unload** = "SpotStudio 不显示 Link 素材（但 Link 本身的素材数据仍存在）"
* 也就是说：Load/Unload 只影响 UI 过滤，不再"从本机扫描"。

**实现方案：**

1. **重构 `LocalAssetToggleButton.jsx` → `LinkAssetToggleButton.jsx`**

```jsx
// FluidDAM/src/components/LinkAssetToggleButton.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { getIconPath } from '../utils/iconPath.js';
import { readSessionPayload, SessionBusKeys } from '@shared/utils/sessionBus';

export default function LinkAssetToggleButton({ editor, onLinkAssetsChange }) {
  const [showLinkAssets, setShowLinkAssets] = useState(false);
  const [linkAssets, setLinkAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // 从 sessionStorage 读取 Link 素材（不删除，可重复读取）
  const loadLinkAssets = useCallback(() => {
    try {
      // 读取但不删除（使用 getItem 而不是 readSessionPayload）
      const key = SessionBusKeys.LINK_TO_SPOT;
      const raw = sessionStorage.getItem(key);
      
      if (raw) {
        const payload = JSON.parse(raw);
        if (payload && payload.assets && Array.isArray(payload.assets)) {
          setLinkAssets(payload.assets);
          setShowLinkAssets(true);
          if (onLinkAssetsChange) {
            onLinkAssetsChange(payload.assets, true);
          }
          console.log(`[LinkAssetToggleButton] 加载了 ${payload.assets.length} 个 Link 素材`);
          return true;
        }
      }
      
      // 也检查 BannerGen 的素材（如果 Link 跳转到 BannerGen 再跳转到 SpotStudio）
      const bannerGenKey = SessionBusKeys.LINK_TO_BANNERGEN;
      const bannerGenRaw = sessionStorage.getItem(bannerGenKey);
      if (bannerGenRaw) {
        const bannerGenPayload = JSON.parse(bannerGenRaw);
        if (bannerGenPayload && bannerGenPayload.assets) {
          setLinkAssets(bannerGenPayload.assets);
          setShowLinkAssets(true);
          if (onLinkAssetsChange) {
            onLinkAssetsChange(bannerGenPayload.assets, true);
          }
          console.log(`[LinkAssetToggleButton] 从 BannerGen 加载了 ${bannerGenPayload.assets.length} 个 Link 素材`);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('[LinkAssetToggleButton] 读取 Link 素材失败:', error);
      return false;
    }
  }, [onLinkAssetsChange]);

  // 初始化时检查是否有 Link 素材
  useEffect(() => {
    const hasLinkAssets = loadLinkAssets();
    if (!hasLinkAssets) {
      console.log('[LinkAssetToggleButton] 未找到 Link 素材');
    }
  }, [loadLinkAssets]);

  // Load: 显示 Link 素材
  const handleLoad = () => {
    setIsLoading(true);
    try {
      const hasLinkAssets = loadLinkAssets();
      if (!hasLinkAssets) {
        alert('未找到 Link 导入的素材。请先在 Link 页面导入素材，然后跳转到 SpotStudio。');
      }
    } catch (error) {
      console.error('[LinkAssetToggleButton] Load 失败:', error);
      alert('加载 Link 素材失败，请查看控制台');
    } finally {
      setIsLoading(false);
    }
  };

  // Unload: 隐藏 Link 素材（不删除数据，只隐藏 UI）
  const handleUnload = () => {
    setShowLinkAssets(false);
    setLinkAssets([]);
    if (onLinkAssetsChange) {
      onLinkAssetsChange([], false);
    }
    console.log('[LinkAssetToggleButton] 已隐藏 Link 素材');
  };

  const iconPath = showLinkAssets 
    ? 'icons/unload_local_assets.png' // Unload 图标（带X的文件夹）
    : 'icons/load_local_assets.png'; // Load 图标（带勾的文件夹）

  const buttonText = showLinkAssets ? 'Unload Link素材' : 'Load Link素材';
  const buttonTitle = showLinkAssets 
    ? `隐藏 Link 素材（当前已显示 ${linkAssets.length} 个）`
    : '显示 Link 导入的素材';

  return (
    <button
      onClick={showLinkAssets ? handleUnload : handleLoad}
      disabled={isLoading}
      style={{
        fontSize: 12,
        padding: "2px",
        border: `0.5px solid ${showLinkAssets ? "#f44336" : "#4caf50"}`,
        borderRadius: 2,
        background: showLinkAssets ? "#ffebee" : "#e8f5e9",
        color: "white",
        cursor: isLoading ? "wait" : "pointer",
        fontWeight: "bold",
        whiteSpace: "nowrap",
        width: 40,
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        position: "relative"
      }}
      title={isLoading ? (showLinkAssets ? '正在隐藏...' : '正在加载...') : buttonTitle}
    >
      {isLoading ? (
        <div style={{
          width: 20,
          height: 20,
          border: "2px solid #ccc",
          borderTop: "2px solid #007bff",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }} />
      ) : (
        <img 
          src={getIconPath(iconPath)} 
          alt={buttonText} 
          style={{
            width: 32, 
            height: 32,
            objectFit: "contain"
          }} 
        />
      )}
    </button>
  );
}
```

2. **修改 `IntegratedAssetSidebar.jsx` 显示 Link 素材分组**

```jsx
// FluidDAM/src/components/IntegratedAssetSidebar.jsx
import LinkAssetToggleButton from './LinkAssetToggleButton.jsx';

export default function IntegratedAssetSidebar({ 
  editor, 
  selectedFrame, 
  setIsLoading, 
  platform = "TM", 
  width, 
  onReset, 
  collapsed, 
  onToggleCollapse, 
  onScrollToAsset
}) {
  const [linkAssets, setLinkAssets] = useState([]);
  const [showLinkAssets, setShowLinkAssets] = useState(false);

  // 处理 Link 素材变化
  const handleLinkAssetsChange = useCallback((assets, isVisible) => {
    setLinkAssets(assets);
    setShowLinkAssets(isVisible);
  }, []);

  // 处理选中 Link 素材
  const handleSelectLinkAsset = useCallback((asset) => {
    if (selectedFrame && editor) {
      placeAssetIntoSelectedFrame(editor, selectedFrame, asset.dataUrl, asset.name);
    } else {
      console.log('[IntegratedAssetSidebar] 选中 Link 素材:', asset);
    }
  }, [editor, selectedFrame]);

  return (
    <div>
      {/* ... 其他按钮 ... */}
      <LinkAssetToggleButton 
        editor={editor} 
        onLinkAssetsChange={handleLinkAssetsChange}
      />
      
      {/* Link 素材分组 */}
      {showLinkAssets && linkAssets.length > 0 && (
        <div className="asset-group" style={{ marginTop: '16px' }}>
          <div className="asset-group-header" style={{ 
            padding: '8px', 
            backgroundColor: '#f5f5f5', 
            fontWeight: 'bold',
            borderBottom: '1px solid #ddd'
          }}>
            <span>Link 导入素材 ({linkAssets.length})</span>
          </div>
          <div className="asset-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
            gap: '8px',
            padding: '8px'
          }}>
            {linkAssets.map((asset) => (
              <div
                key={asset.id}
                className="asset-item"
                onClick={() => handleSelectLinkAsset(asset)}
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
                  src={asset.dataUrl}
                  alt={asset.name}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '80px',
                    objectFit: 'cover'
                  }}
                  onError={(e) => {
                    console.error('[IntegratedAssetSidebar] Link 素材加载失败:', asset.name);
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
      
      {/* ... 其他素材分组 ... */}
    </div>
  );
}
```

### B3. 修改 MainCanvas.jsx 移除本机素材自动加载

**删除 `loadLocalAssets()` 函数和所有调用：**

```jsx
// FluidDAM/src/MainCanvas.jsx

// ❌ 删除这个函数
// const loadLocalAssets = async (skipIfHasAssets = false) => { ... }

// ✅ 修改导入逻辑，只从 Link 导入，不再自动加载本机素材
const timer = setTimeout(async () => {
  console.log('延迟执行导入素材检查...');
  try {
    const hasImportedFromLink = await importAssetsFromLink();
    if (hasImportedFromLink) {
      console.log('[SpotStudio] ✅ 已从 Link 导入素材');
    } else {
      console.log('[SpotStudio] 未从 Link 导入素材，用户可以通过 Load Link素材 按钮手动加载');
    }
  } catch (error) {
    console.error('[SpotStudio] 从 Link 导入素材时出错:', error);
  }
  // ❌ 删除 loadLocalAssets() 调用
}, 2000);
```

---

## Part C：统一 Link → SpotStudio / BannerGen 的数据通道（使用现有的 sessionStorage payload）

**现有的 payload 结构：**

```ts
// src/shared/utils/sessionBus.ts
export const SessionBusKeys = {
  LINK_TO_BANNERGEN: 'fluiddam.linkToBannerGen.v1',
  BANNERGEN_TO_SPOT: 'fluiddam.bannerGenToSpot.v1',
  LINK_TO_SPOT: 'fluiddam.linkToSpot.v1',
};

export type LinkToSpotPayload = {
  from: 'link';
  createdAt: number;
  assets: TempAsset[];  // TempAsset 包含 id, name, dataUrl, mimeType, width, height, source 等
};

export type LinkToBannerGenPayload = {
  from: 'link';
  createdAt: number;
  assets: TempAsset[];
};
```

**统一读取函数（新增到 `sessionBus.ts`）：**

```ts
// src/shared/utils/sessionBus.ts

/**
 * 读取 Link 素材数据（不删除，可重复读取）
 * 用于 SpotStudio 的 Load/Unload toggle
 */
export function readLinkAssetsPayload(): LinkToSpotPayload | LinkToBannerGenPayload | null {
  // 优先读取 LINK_TO_SPOT
  const spotKey = SessionBusKeys.LINK_TO_SPOT;
  const spotRaw = sessionStorage.getItem(spotKey);
  if (spotRaw) {
    try {
      return JSON.parse(spotRaw) as LinkToSpotPayload;
    } catch (err) {
      console.error('[sessionBus] 解析 LINK_TO_SPOT 失败', err);
    }
  }
  
  // 回退到 LINK_TO_BANNERGEN
  const bannerGenKey = SessionBusKeys.LINK_TO_BANNERGEN;
  const bannerGenRaw = sessionStorage.getItem(bannerGenKey);
  if (bannerGenRaw) {
    try {
      return JSON.parse(bannerGenRaw) as LinkToBannerGenPayload;
    } catch (err) {
      console.error('[sessionBus] 解析 LINK_TO_BANNERGEN 失败', err);
    }
  }
  
  return null;
}

/**
 * 检查是否有 Link 素材数据（不读取，只检查）
 */
export function hasLinkAssetsPayload(): boolean {
  const spotKey = SessionBusKeys.LINK_TO_SPOT;
  const bannerGenKey = SessionBusKeys.LINK_TO_BANNERGEN;
  return !!(sessionStorage.getItem(spotKey) || sessionStorage.getItem(bannerGenKey));
}
```

**使用方式：**

```jsx
// 在 LinkAssetToggleButton 或 IntegratedAssetSidebar 中
import { readLinkAssetsPayload, hasLinkAssetsPayload } from '@shared/utils/sessionBus';

const payload = readLinkAssetsPayload();
if (payload && payload.assets) {
  // 使用 payload.assets
}
```

---

## Part D：验收标准

1. ✅ 项目运行不再需要 5174（不启动也完全正常）
2. ✅ SpotStudio 的素材区能显示 Link 导入的素材（Load 打开时）
3. ✅ SpotStudio Unload 后，Link 素材分组消失/不展示
4. ✅ BannerGen 仍可从 Link 获取素材（且不依赖 5174）
5. ✅ repo 内不再出现 `/local-lib`、`5174` 相关逻辑（grep 为空，除了端口配置）
6. ✅ `LocalAssetToggleButton` 已删除或重构为 `LinkAssetToggleButton`
7. ✅ `loadLocalAssets()` 函数已删除

---

## Cursor 实施顺序（防返工）

1. **先删 5174 依赖**（搜索清理 + 启动脚本）
   - 全局搜索 `5174`、`/local-lib`、`localAssetManager.loadAssets`
   - 删除 `LocalAssetToggleButton.jsx` 或重构为 `LinkAssetToggleButton.jsx`
   - 删除 `MainCanvas.jsx` 中的 `loadLocalAssets()` 函数

2. **再统一 Link 输出资产结构**（使用现有的 `TempAsset` 类型）
   - 确认 Link 导出的 payload 结构符合 `LinkToSpotPayload` / `LinkToBannerGenPayload`
   - 在 `sessionBus.ts` 中添加 `readLinkAssetsPayload()` 和 `hasLinkAssetsPayload()` 函数

3. **最后 SpotStudio 接入 Link payload + Load/Unload UI 过滤**
   - 创建 `LinkAssetToggleButton.jsx`（只做 UI 过滤，不扫描）
   - 修改 `IntegratedAssetSidebar.jsx` 显示 Link 素材分组
   - 修改 `MainCanvas.jsx` 移除本机素材自动加载

---

## 注意事项

1. **sessionStorage 读取策略**：
   - `readSessionPayload()` 会删除数据（用完即删）
   - `readLinkAssetsPayload()` 不删除数据（可重复读取，用于 toggle）
   - 确保两种读取方式不冲突

2. **跨端口传递**：
   - 如果 Link (5173) → SpotStudio (5174) 跨端口，仍然使用 API 服务器临时存储（`/api/link-to-spot-assets`）
   - 如果通过统一入口 (3000)，使用 sessionStorage

3. **BannerGen 兼容性**：
   - BannerGen 已经使用 `LINK_TO_BANNERGEN` key，保持不变
   - SpotStudio 优先读取 `LINK_TO_SPOT`，回退到 `LINK_TO_BANNERGEN`
