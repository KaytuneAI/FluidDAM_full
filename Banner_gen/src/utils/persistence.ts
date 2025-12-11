/**
 * BannerGen 页面数据持久化工具
 * 用于在页面重新加载时保存和恢复数据
 */

export interface BannerGenPersistedData {
  // ZIP 文件相关
  htmlContent: string;
  cssContent: string;
  htmlFileName: string;
  cssFileName: string;
  templateFields: Array<{ name: string; label?: string }>;
  
  // JSON 数据
  jsonData: any[];
  currentIndex: number;
  
  // 编辑的值
  editedValues: Record<number, Record<string, string>>;
  
  // 来自 Link 的素材
  linkedAssets: Array<{
    id: string;
    name: string;
    url?: string;
    dataUrl?: string;
    source: string;
    damId?: string;
    mimeType?: string;
    width?: number;
    height?: number;
  }>;
  
  // 时间戳
  savedAt: number;
}

const STORAGE_KEY = 'bannergen.persistedData.v1';

/**
 * 保存数据到 localStorage
 */
export function saveBannerGenData(data: Partial<BannerGenPersistedData>): void {
  try {
    // 只保存关键信息，完全不保存大的内容
    const minimal: Partial<BannerGenPersistedData> = {
      htmlFileName: data.htmlFileName,
      cssFileName: data.cssFileName,
      templateFields: data.templateFields,
      currentIndex: data.currentIndex ?? 0,
      savedAt: Date.now(),
      // 明确不保存以下大内容：
      // - htmlContent, cssContent (太大，用户需要重新上传)
      // - jsonData (太大，用户需要重新上传)
      // - editedValues (包含大量 transform 数据，切换记录时会丢失，但这是可接受的)
      // - linkedAssets (包含 base64 数据，太大)
    };
    
    const jsonStr = JSON.stringify(minimal);
    const sizeInBytes = new Blob([jsonStr]).size;
    const sizeInKB = sizeInBytes / 1024;
    
    // 如果超过 50KB，只保存最基本的信息
    if (sizeInKB > 50) {
      const ultraMinimal: Partial<BannerGenPersistedData> = {
        currentIndex: data.currentIndex ?? 0,
        savedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ultraMinimal));
      console.warn('[persistence] 数据过大，仅保存当前索引');
      return;
    }
    
    localStorage.setItem(STORAGE_KEY, jsonStr);
  } catch (err) {
    console.error('[persistence] 保存数据失败:', err);
    // 如果存储空间不足，尝试清理旧数据
    if (err instanceof DOMException && (err.code === 22 || err.name === 'QuotaExceededError')) {
      try {
        // 尝试清理所有相关的 localStorage 数据
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('bannergen.')) {
            localStorage.removeItem(key);
          }
        });
        console.warn('[persistence] 存储空间不足，已清除所有 BannerGen 相关数据');
        
        // 如果清理后还是失败，只保存最基本的数据
        try {
          const minimal: Partial<BannerGenPersistedData> = {
            currentIndex: data.currentIndex ?? 0,
            savedAt: Date.now(),
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
        } catch (minimalErr) {
          console.error('[persistence] 保存最小数据也失败:', minimalErr);
        }
      } catch (clearErr) {
        console.error('[persistence] 清除旧数据失败:', clearErr);
      }
    }
  }
}

/**
 * 从 localStorage 加载数据
 */
export function loadBannerGenData(): Partial<BannerGenPersistedData> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    
    const data = JSON.parse(raw) as BannerGenPersistedData;
    
    // 检查数据是否过期（7天）
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (data.savedAt && data.savedAt < sevenDaysAgo) {
      console.log('[persistence] 数据已过期，清除');
      clearBannerGenData();
      return null;
    }
    
    return data;
  } catch (err) {
    console.error('[persistence] 加载数据失败:', err);
    return null;
  }
}

/**
 * 清除保存的数据
 */
export function clearBannerGenData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('[persistence] 清除数据失败:', err);
  }
}

/**
 * 检查是否有保存的数据
 */
export function hasBannerGenData(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}



