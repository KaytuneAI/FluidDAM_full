/**
 * StorageManager - 智能存储管理器
 * 优先使用 IndexedDB（大容量），回退到 localStorage（兼容性）
 */

const DB_NAME = 'TLDrawCanvasDB';
const DB_VERSION = 1;
const STORE_NAME = 'canvasData';
const CANVAS_KEY = 'autoSaveCanvas';

class StorageManager {
  constructor() {
    this.db = null;
    this.isIndexedDBAvailable = false;
    this.initPromise = this.init();
  }

  /**
   * 初始化 IndexedDB
   */
  async init() {
    if (!window.indexedDB) {
      console.warn('IndexedDB 不可用，将使用 localStorage');
      this.isIndexedDBAvailable = false;
      return;
    }

    try {
      this.db = await this.openDatabase();
      this.isIndexedDBAvailable = true;
    } catch (error) {
      console.warn('IndexedDB 初始化失败，使用 localStorage:', error);
      this.isIndexedDBAvailable = false;
    }
  }

  /**
   * 打开数据库
   */
  openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // 创建对象存储
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  /**
   * 保存数据（智能选择存储方式）
   */
  async saveCanvas(data) {
    await this.initPromise;

    const dataString = JSON.stringify(data);
    const dataSizeMB = (dataString.length / 1024 / 1024).toFixed(2);
    
    console.log(`📦 准备保存画布数据: ${dataSizeMB}MB`);

    // 优先使用 IndexedDB（支持大数据）
    if (this.isIndexedDBAvailable) {
      try {
        await this.saveToIndexedDB(dataString);
        return { success: true, method: 'IndexedDB', size: dataSizeMB };
      } catch (error) {
        console.warn('IndexedDB 保存失败，尝试 localStorage:', error);
      }
    }

    // 回退到 localStorage（有容量限制）
    try {
      await this.saveToLocalStorage(dataString, dataSizeMB);
      return { success: true, method: 'localStorage', size: dataSizeMB };
    } catch (error) {
      console.error('❌ 所有存储方式都失败了:', error);
      return { success: false, error: error.message, size: dataSizeMB };
    }
  }

  /**
   * 保存到 IndexedDB
   */
  async saveToIndexedDB(dataString) {
    if (!this.db) throw new Error('IndexedDB 未初始化');

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(dataString, CANVAS_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 保存到 localStorage（带清理重试）
   */
  async saveToLocalStorage(dataString, dataSizeMB) {
    try {
      localStorage.setItem(CANVAS_KEY, dataString);
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.warn('⚠️ localStorage 空间不足，尝试清理...');
        
        // 清理旧数据
        localStorage.removeItem(CANVAS_KEY);
        localStorage.removeItem('currentImageIds');
        
        // 重试
        try {
          localStorage.setItem(CANVAS_KEY, dataString);
        } catch (retryError) {
          throw new Error(`数据太大 (${dataSizeMB}MB)，超过 localStorage 限制 (~10MB)`);
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * 读取数据（智能选择读取方式）
   */
  async loadCanvas() {
    await this.initPromise;

    // 优先从 IndexedDB 读取
    if (this.isIndexedDBAvailable) {
      try {
        const data = await this.loadFromIndexedDB();
        if (data) {
          console.log('✅ 从 IndexedDB 加载数据');
          return JSON.parse(data);
        }
      } catch (error) {
        console.warn('从 IndexedDB 读取失败:', error);
      }
    }

    // 回退到 localStorage
    try {
      const data = localStorage.getItem(CANVAS_KEY);
      if (data) {
        console.log('✅ 从 localStorage 加载数据');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('从 localStorage 读取失败:', error);
    }

    return null;
  }

  /**
   * 从 IndexedDB 读取
   */
  async loadFromIndexedDB() {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(CANVAS_KEY);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清除所有数据
   */
  async clearCanvas() {
    await this.initPromise;

    // 清除 IndexedDB
    if (this.isIndexedDBAvailable && this.db) {
      try {
        await new Promise((resolve, reject) => {
          const transaction = this.db.transaction([STORE_NAME], 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.delete(CANVAS_KEY);
          
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch (error) {
        console.warn('清除 IndexedDB 失败:', error);
      }
    }

    // 清除 localStorage
    localStorage.removeItem(CANVAS_KEY);
    localStorage.removeItem('currentImageIds');
  }

  /**
   * 获取存储信息
   */
  async getStorageInfo() {
    await this.initPromise;

    const info = {
      indexedDBAvailable: this.isIndexedDBAvailable,
      currentMethod: this.isIndexedDBAvailable ? 'IndexedDB' : 'localStorage',
      maxSize: this.isIndexedDBAvailable ? '几百MB~几GB' : '~10MB'
    };

    // 检查持久化状态
    if (navigator.storage && navigator.storage.persisted) {
      try {
        const isPersisted = await navigator.storage.persisted();
        info.isPersistent = isPersisted;
        info.persistentStatus = isPersisted 
          ? '✅ 持久化存储（不会被自动清理）' 
          : '⚠️ 非持久化（磁盘空间不足时可能被清理）';
      } catch (error) {
        info.isPersistent = false;
        info.persistentStatus = '未知';
      }
    } else {
      info.isPersistent = false;
      info.persistentStatus = '浏览器不支持持久化 API';
    }

    // 检查存储配额
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usedMB = (estimate.usage / 1024 / 1024).toFixed(2);
        const quotaMB = (estimate.quota / 1024 / 1024).toFixed(2);
        info.storageUsed = `${usedMB}MB`;
        info.storageQuota = `${quotaMB}MB`;
        info.storageUsagePercent = ((estimate.usage / estimate.quota) * 100).toFixed(2) + '%';
      } catch (error) {
        // 无法获取配额信息
      }
    }

    // 检查是否有数据
    const data = await this.loadCanvas();
    if (data) {
      const dataString = JSON.stringify(data);
      const dataSizeMB = (dataString.length / 1024 / 1024).toFixed(2);
      info.currentSize = `${dataSizeMB}MB`;
      info.hasData = true;
    } else {
      info.hasData = false;
    }

    return info;
  }
}

// 创建全局单例
const storageManager = new StorageManager();

// 导出实例和类
export { storageManager, StorageManager };
export default storageManager;

