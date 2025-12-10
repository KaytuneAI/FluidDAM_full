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
    const existing = loadBannerGenData();
    const merged: BannerGenPersistedData = {
      ...existing,
      ...data,
      savedAt: Date.now(),
    };
    
    // 检查数据大小，如果太大则只保存关键数据
    const jsonStr = JSON.stringify(merged);
    const sizeInMB = new Blob([jsonStr]).size / (1024 * 1024);
    
    if (sizeInMB > 5) {
      // 如果超过 5MB，只保存基本信息，不保存大的 base64 数据
      console.warn('[persistence] 数据过大，仅保存基本信息');
      const trimmed: BannerGenPersistedData = {
        ...merged,
        // 移除大的 base64 数据，但保留 URL
        linkedAssets: merged.linkedAssets?.map(asset => ({
          ...asset,
          dataUrl: asset.dataUrl && asset.dataUrl.length > 10000 ? undefined : asset.dataUrl,
        })) || [],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(STORAGE_KEY, jsonStr);
    }
  } catch (err) {
    console.error('[persistence] 保存数据失败:', err);
    // 如果存储空间不足，尝试清理旧数据
    if (err instanceof DOMException && err.code === 22) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        console.warn('[persistence] 存储空间不足，已清除旧数据');
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

