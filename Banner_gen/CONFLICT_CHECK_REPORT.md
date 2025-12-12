# TemplateGen 和 BannerGen 冲突检查报告

## ✅ 已修复的冲突

### 1. CSS 类名冲突
- **状态**: ✅ 已修复
- **问题**: 两个模块使用了相同的 CSS 类名（如 `.control-section`, `.preview` 等）
- **解决方案**: TemplateGen 的所有 CSS 类名已添加 `template-gen-` 前缀
- **文件**: 
  - `TemplateGenPage.css` - 所有类名已重命名
  - `TemplateGenPage.tsx` - 所有 `className` 引用已更新

### 2. 全局 DOM 元素 ID 冲突
- **状态**: ✅ 已隔离
- **问题**: 两个模块都向 `document.head` 注入 `<style>` 标签用于字体
- **解决方案**: 使用了不同的 ID
  - BannerGen: `"banner-template-font-style"`
  - TemplateGen: `"template-gen-font-style"`
- **文件**:
  - `BannerBatchPage.tsx` (line 184)
  - `TemplateGenPage.tsx` (line 254)

## ✅ 无冲突的共享资源

### 1. localStorage
- **状态**: ✅ 无冲突
- **原因**: 
  - BannerGen 使用 `bannergen.persistedData.v1` 作为存储 key
  - TemplateGen **不使用** localStorage
- **文件**: `utils/persistence.ts`

### 2. 共享工具函数
- **状态**: ✅ 无冲突
- **原因**: 所有共享函数都是**纯函数**，无副作用
- **共享函数**:
  - `htmlUtils.ts` - `buildSrcDoc`, `extractCssFromHtml`, `replaceHtmlImgSrcWithBase64`, `replaceCssUrlWithBase64`
  - `zipHandler.ts` - `processZipFile`
  - `fileHandlers.ts` - `handleHtmlUpload`, `handleCssUpload`
  - `dataApplier.ts` - `applyJsonDataToIframe`, `updatePriceFields`
- **文件**: `TemplateGenPage.tsx` (lines 4-7)

### 3. 共享 React 组件
- **状态**: ✅ 无冲突
- **原因**: 每个组件实例都有独立的状态
- **共享组件**:
  - `AssetSidebar` - 使用 props 传递数据，无全局状态
  - `ResizableSidebar` - 使用 props 传递状态，临时修改 `document.body.style` 但会在卸载时恢复
- **文件**: 
  - `components/AssetSidebar.tsx`
  - `components/ResizableSidebar.tsx`

### 4. iframe 内部 CSS 类
- **状态**: ✅ 无冲突
- **原因**: `.field-highlight` 类只在各自的 iframe 内部使用，不会互相影响
- **文件**: `htmlUtils.ts` (定义在 iframe 的 `<style>` 标签中)

## ⚠️ 潜在风险点（需注意）

### 1. sessionStorage 共享 Key
- **状态**: ⚠️ 设计上的限制（非冲突）
- **问题**: 两个页面都使用 `SessionBusKeys.LINK_TO_BANNERGEN` 读取来自 Link 的素材
- **影响**: 
  - `readSessionPayload` 函数在读取后会**立即删除**数据（`sessionStorage.removeItem(key)`）
  - 如果用户同时打开两个页面，第一个读取的页面会删除数据，第二个页面就读不到了
  - 这是**设计上的限制**，不是冲突问题
- **建议**: 
  - 如果需要在两个页面间共享素材，考虑使用不同的 key 或改进读取逻辑
  - 当前行为：先打开的页面会读取到数据，后打开的页面读取不到（数据已被删除）
- **文件**: 
  - `src/shared/utils/sessionBus.ts` (line 45)
  - `BannerBatchPage.tsx` (line 170)
  - `TemplateGenPage.tsx` (line 240)

### 2. ResizableSidebar 的全局 DOM 操作
- **状态**: ⚠️ 低风险（已处理）
- **问题**: `ResizableSidebar` 在拖拽时会修改 `document.body.style`
- **影响**: 
  - 如果两个页面同时使用 `ResizableSidebar` 并同时拖拽，可能会互相覆盖样式
  - 但组件卸载时会恢复样式（`useEffect` cleanup）
- **建议**: 
  - 当前实现已经处理了 cleanup，风险较低
  - 如果出现样式问题，可以考虑使用更细粒度的样式管理
- **文件**: `components/ResizableSidebar.tsx` (lines 45-54)

## 📋 检查清单

- [x] CSS 类名冲突检查
- [x] 全局 DOM 元素 ID 冲突检查
- [x] localStorage/sessionStorage key 冲突检查
- [x] 共享工具函数的副作用检查
- [x] 共享组件的状态隔离检查
- [x] iframe 内部资源隔离检查

## 🎯 结论

**总体评估**: ✅ **两个模块已良好隔离，无严重冲突**

主要冲突点（CSS 类名）已经修复。其他共享资源都是安全的：
- 工具函数是纯函数
- 组件状态是隔离的
- localStorage 使用不同的 key
- 全局 DOM 操作都有适当的 cleanup

唯一需要注意的是 `sessionStorage` 的读取行为（读取后删除），但这更多是设计上的限制，不是冲突问题。



