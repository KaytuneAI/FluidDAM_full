/**
 * 懒加载工具函数
 * 实现图片的视口内加载，视口外延迟加载
 */

// 获取当前视口边界
export function getViewportBounds(editor) {
  if (!editor) return null;
  
  try {
    const camera = editor.getCamera();
    const viewport = editor.getViewportPageBounds();
    
    return {
      left: viewport.x,
      right: viewport.x + viewport.w,
      top: viewport.y,
      bottom: viewport.y + viewport.h,
      zoom: camera.z
    };
  } catch (error) {
    console.warn('获取视口边界失败:', error);
    return null;
  }
}

// 检测图片是否在视口内
export function isImageInViewport(imageData, viewport) {
  if (!viewport || !imageData) return false;
  
  const { left, right, top, bottom } = viewport;
  const { x, y, width, height } = imageData;
  
  // 计算图片边界
  const imageLeft = x;
  const imageRight = x + width;
  const imageTop = y;
  const imageBottom = y + height;
  
  // 检测是否有重叠
  const horizontalOverlap = imageLeft < right && imageRight > left;
  const verticalOverlap = imageTop < bottom && imageBottom > top;
  
  return horizontalOverlap && verticalOverlap;
}

// 懒加载管理器
export class LazyLoadingManager {
  constructor(editor) {
    this.editor = editor;
    this.pendingImages = new Map(); // 待加载的图片
    this.loadedImages = new Set(); // 已加载的图片
    this.viewport = null;
    this.isListening = false;
  }
  
  // 添加待加载的图片
  addPendingImage(imageId, imageData) {
    this.pendingImages.set(imageId, imageData);
    console.log(`📝 添加待加载图片: ${imageId}`);
    
    // 开始监听
    if (!this.isListening) {
      this.startListening();
    }
    
    // 立即检查是否在视口内
    this.checkPendingImages();
  }
  
  // 开始监听视口变化
  startListening() {
    if (this.isListening) return;
    
    this.isListening = true;
    
    // 监听相机变化（缩放、平移）
    this.editor.store.listen((record) => {
      if (record.typeName === 'camera') {
        this.onViewportChange();
      }
    });
    
    console.log('👂 开始监听视口变化');
  }
  
  // 视口变化时的处理
  onViewportChange() {
    this.viewport = null; // 清除缓存
    this.checkPendingImages();
  }
  
  // 检查待加载的图片
  checkPendingImages() {
    if (this.pendingImages.size === 0) return;
    
    const viewport = this.getViewport();
    if (!viewport) return;
    
    const toLoad = [];
    
    for (const [imageId, imageData] of this.pendingImages) {
      if (isImageInViewport(imageData, viewport)) {
        toLoad.push({ imageId, imageData });
        this.pendingImages.delete(imageId);
        this.loadedImages.add(imageId);
      }
    }
    
    if (toLoad.length > 0) {
      console.log(`🚀 开始加载 ${toLoad.length} 张视口内图片`);
      this.loadImages(toLoad);
    }
  }
  
  // 获取视口（带缓存）
  getViewport() {
    if (!this.viewport) {
      this.viewport = getViewportBounds(this.editor);
    }
    return this.viewport;
  }
  
  // 加载图片（限制并发数量）
  async loadImages(imagesToLoad) {
    const maxConcurrent = 1; // 限制同时加载的图片数量
    const chunks = [];
    
    // 分批处理
    for (let i = 0; i < imagesToLoad.length; i += maxConcurrent) {
      chunks.push(imagesToLoad.slice(i, i + maxConcurrent));
    }
    
    // 逐批加载
    for (const chunk of chunks) {
      await Promise.all(chunk.map(async ({ imageId, imageData }) => {
        try {
          // 添加延迟，避免服务器压力
          await new Promise(resolve => setTimeout(resolve, 500));
          this.onImageLoad(imageId, imageData);
        } catch (error) {
          console.warn(`加载图片失败 ${imageId}:`, error);
        }
      }));
      
      // 批次间添加延迟
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  // 图片加载完成回调（需要外部实现）
  onImageLoad(imageId, imageData) {
    console.log(`✅ 图片加载完成: ${imageId}`);
    // 这里需要外部传入回调函数
    if (this.onLoadCallback) {
      this.onLoadCallback(imageId, imageData);
    }
  }
  
  // 设置加载回调
  setLoadCallback(callback) {
    this.onLoadCallback = callback;
  }
  
  // 清理
  destroy() {
    this.pendingImages.clear();
    this.loadedImages.clear();
    this.isListening = false;
    console.log('🧹 懒加载管理器已清理');
  }
}

// 全局懒加载管理器实例
let globalLazyManager = null;

// 获取全局懒加载管理器
export function getLazyLoadingManager(editor) {
  if (!globalLazyManager) {
    globalLazyManager = new LazyLoadingManager(editor);
  }
  return globalLazyManager;
}

// 清理全局管理器
export function destroyLazyLoadingManager() {
  if (globalLazyManager) {
    globalLazyManager.destroy();
    globalLazyManager = null;
  }
}
