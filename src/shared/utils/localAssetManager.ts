/**
 * 本机素材存储管理器
 * 使用 IndexedDB 存储图片数据，localStorage 存储元数据
 */

import type { TempAsset, AssetSource } from '../types/assets';

const DB_NAME = 'LocalAssetsDB';
const DB_VERSION = 1;
const STORE_NAME = 'assets';
const METADATA_KEY = 'localAssets.metadata.v1';

interface LocalAssetMetadata {
  id: string;
  name: string;
  source: AssetSource;
  mimeType?: string;
  width?: number;
  height?: number;
  savedAt: number;
  prompt?: string;
  generatedAt?: number;
  templateSize?: string;
}

interface LocalAssetData {
  id: string;
  dataUrl: string;
}

class LocalAssetManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  /**
   * 初始化 IndexedDB
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[LocalAssetManager] IndexedDB 打开失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initPromise = null;
        console.log('[LocalAssetManager] IndexedDB 初始化成功');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          objectStore.createIndex('id', 'id', { unique: true });
          console.log('[LocalAssetManager] 创建对象存储:', STORE_NAME);
        }
      };
    });

    return this.initPromise;
  }

  /**
   * 保存素材到本机
   */
  async saveAssets(assets: TempAsset[]): Promise<number> {
    try {
      const db = await this.initDB();
      const metadataList = this.getMetadataList();

      let savedCount = 0;

      for (const asset of assets) {
        // 如果已有相同 ID，跳过（避免重复）
        if (metadataList.find(m => m.id === asset.id)) {
          continue;
        }

        // 准备元数据
        const metadata: LocalAssetMetadata = {
          id: asset.id,
          name: asset.name,
          source: asset.source,
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height,
          savedAt: Date.now(),
          prompt: asset.prompt,
          generatedAt: asset.generatedAt,
          templateSize: asset.templateSize,
        };

        // 如果有 dataUrl，保存到 IndexedDB
        if (asset.dataUrl) {
          const data: LocalAssetData = {
            id: asset.id,
            dataUrl: asset.dataUrl,
          };

          await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(data);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        }

        // 保存元数据到 localStorage
        metadataList.push(metadata);
        savedCount++;
      }

      // 更新 localStorage
      this.saveMetadataList(metadataList);

      console.log(`[LocalAssetManager] 保存了 ${savedCount} 个素材到本机`);
      return savedCount;
    } catch (error) {
      console.error('[LocalAssetManager] 保存素材失败:', error);
      throw error;
    }
  }

  /**
   * 从本机加载所有素材
   */
  async loadAssets(): Promise<TempAsset[]> {
    try {
      const db = await this.initDB();
      const metadataList = this.getMetadataList();

      if (metadataList.length === 0) {
        return [];
      }

      const assets: TempAsset[] = [];

      // 从 IndexedDB 加载数据
      for (const metadata of metadataList) {
        let dataUrl: string | undefined;

        try {
          dataUrl = await new Promise<string | undefined>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(metadata.id);

            request.onsuccess = () => {
              const data = request.result as LocalAssetData | undefined;
              resolve(data?.dataUrl);
            };
            request.onerror = () => reject(request.error);
          });
        } catch (error) {
          console.warn(`[LocalAssetManager] 加载素材数据失败 (${metadata.id}):`, error);
          // 继续处理其他素材
        }

        const asset: TempAsset = {
          id: metadata.id,
          name: metadata.name,
          source: metadata.source,
          mimeType: metadata.mimeType,
          width: metadata.width,
          height: metadata.height,
          dataUrl,
          prompt: metadata.prompt,
          generatedAt: metadata.generatedAt,
          templateSize: metadata.templateSize,
        };

        assets.push(asset);
      }

      console.log(`[LocalAssetManager] 从本机加载了 ${assets.length} 个素材`);
      return assets;
    } catch (error) {
      console.error('[LocalAssetManager] 加载素材失败:', error);
      return [];
    }
  }

  /**
   * 删除单个素材
   */
  async deleteAsset(id: string): Promise<boolean> {
    try {
      const db = await this.initDB();
      const metadataList = this.getMetadataList();

      // 从 IndexedDB 删除
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // 从 localStorage 删除元数据
      const filtered = metadataList.filter(m => m.id !== id);
      this.saveMetadataList(filtered);

      console.log(`[LocalAssetManager] 删除了素材: ${id}`);
      return true;
    } catch (error) {
      console.error('[LocalAssetManager] 删除素材失败:', error);
      return false;
    }
  }

  /**
   * 清空所有本机素材
   */
  async clearAssets(): Promise<boolean> {
    try {
      const db = await this.initDB();

      // 清空 IndexedDB
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // 清空 localStorage
      localStorage.removeItem(METADATA_KEY);

      console.log('[LocalAssetManager] 已清空所有本机素材');
      return true;
    } catch (error) {
      console.error('[LocalAssetManager] 清空素材失败:', error);
      return false;
    }
  }

  /**
   * 获取素材数量
   */
  getAssetCount(): number {
    const metadataList = this.getMetadataList();
    return metadataList.length;
  }

  /**
   * 按来源获取素材数量
   */
  getAssetCountBySource(source: AssetSource): number {
    const metadataList = this.getMetadataList();
    return metadataList.filter(m => m.source === source).length;
  }

  /**
   * 获取存储大小（估算，单位：MB）
   */
  async getStorageSize(): Promise<number> {
    try {
      const db = await this.initDB();
      const metadataList = this.getMetadataList();

      let totalSize = 0;

      for (const metadata of metadataList) {
        try {
          const dataUrl = await new Promise<string | undefined>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(metadata.id);

            request.onsuccess = () => {
              const data = request.result as LocalAssetData | undefined;
              resolve(data?.dataUrl);
            };
            request.onerror = () => reject(request.error);
          });

          if (dataUrl) {
            // 估算 base64 数据大小（base64 比原始数据大约 33%）
            const base64Length = dataUrl.length;
            const estimatedSize = (base64Length * 3) / 4; // 转换为字节
            totalSize += estimatedSize;
          }
        } catch (error) {
          // 忽略单个素材的错误
        }
      }

      // 转换为 MB
      const sizeMB = totalSize / (1024 * 1024);
      return Math.round(sizeMB * 100) / 100; // 保留两位小数
    } catch (error) {
      console.error('[LocalAssetManager] 获取存储大小失败:', error);
      return 0;
    }
  }

  /**
   * 从 localStorage 获取元数据列表
   */
  private getMetadataList(): LocalAssetMetadata[] {
    try {
      const raw = localStorage.getItem(METADATA_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as LocalAssetMetadata[];
    } catch (error) {
      console.error('[LocalAssetManager] 读取元数据失败:', error);
      return [];
    }
  }

  /**
   * 保存元数据列表到 localStorage
   */
  private saveMetadataList(metadataList: LocalAssetMetadata[]): void {
    try {
      localStorage.setItem(METADATA_KEY, JSON.stringify(metadataList));
    } catch (error) {
      console.error('[LocalAssetManager] 保存元数据失败:', error);
      // localStorage 可能已满，尝试清理一些旧数据
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.warn('[LocalAssetManager] localStorage 已满，尝试清理旧数据');
        // 可以按时间排序，删除最旧的数据
        const sorted = metadataList.sort((a, b) => a.savedAt - b.savedAt);
        const half = sorted.slice(Math.floor(sorted.length / 2));
        try {
          localStorage.setItem(METADATA_KEY, JSON.stringify(half));
          console.log('[LocalAssetManager] 已清理一半旧数据');
        } catch (e) {
          console.error('[LocalAssetManager] 清理后仍无法保存:', e);
        }
      }
    }
  }
}

// 导出单例
export const localAssetManager = new LocalAssetManager();













