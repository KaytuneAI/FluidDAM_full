import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Tldraw, createTLStore, defaultShapeUtils, getSnapshot, loadSnapshot } from "tldraw";
import "tldraw/tldraw.css";
import { getApiBaseUrl } from './utils/apiUtils.js';
import storageManager from './utils/storageManager.js';
import { localAssetManager } from '@shared/utils/localAssetManager';

// 导入 sessionBus（使用相对路径指向共享目录）
function readSessionPayload(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key); // 用完即删，避免脏数据
    return JSON.parse(raw);
  } catch (err) {
    console.error('[sessionBus] read error', key, err);
    return null;
  }
}

const SessionBusKeys = {
  LINK_TO_SPOT: 'fluiddam.linkToSpot.v1',
};

// 读图片天然尺寸（优先用 asset，其次用 src 加载）
async function getNaturalSize(editor, assetId, assetSrc) {
  const normId = assetId?.startsWith('asset:') ? assetId : `asset:${assetId}`;
  const asset = editor?.getAsset?.(normId);
  // TLDraw 的 image asset 一般会带 w,h
  if (asset?.props?.w && asset?.props?.h) {
    return { w: asset.props.w, h: asset.props.h };
  }
  // 兜底：用 src 加载一次
  const src = asset?.props?.src || assetSrc;
  if (!src) return { w: 100, h: 100 };
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const p = new Promise((res, rej) => {
    img.onload = () => res({ w: img.naturalWidth || 100, h: img.naturalHeight || 100 });
    img.onerror = rej;
  });
  img.src = src;
  try { return await p; } catch { return { w: 100, h: 100 }; }
}

// 计算放置尺寸：若落在 frame 内则 contain-fit 到 frame；否则按基准比例缩放并做上限/下限约束
function computeDropSize({ natW, natH, inFrame, frameBounds, baseScale = 0.6, minSide = 80, maxSide = 960, padding = 8 }) {
  if (inFrame && frameBounds) {
    const innerW = Math.max(1, frameBounds.w - padding * 2);
    const innerH = Math.max(1, frameBounds.h - padding * 2);
    const s = Math.min(innerW / natW, innerH / natH); // contain
    const w = Math.max(1, Math.floor(natW * s));
    const h = Math.max(1, Math.floor(natH * s));
    return { w, h };
  }
  // 画布自由放置：按基准比例缩放并夹紧
  const s = baseScale;
  let w = natW * s;
  let h = natH * s;
  const side = Math.max(w, h);
  if (side > maxSide) {
    const k = maxSide / side;
    w *= k; h *= k;
  }
  if (Math.min(w, h) < minSide) {
    const k = minSide / Math.min(w, h);
    w *= k; h *= k;
  }
  return { w: Math.round(w), h: Math.round(h) };
}

// 导入组件
import ResizableSidebar from './components/ResizableSidebar.jsx';
import IntegratedAssetSidebar from './components/IntegratedAssetSidebar.jsx';

// 导入样式
import { highlightStyle } from './styles/sidebarStyles.js';

// 添加高亮样式到页面
const styleElement = document.createElement('style');
styleElement.textContent = highlightStyle;
if (!document.head.querySelector('style[data-highlight]')) {
  styleElement.setAttribute('data-highlight', 'true');
  document.head.appendChild(styleElement);
}

// 添加恢复动画样式
const restoreStyleElement = document.createElement('style');
restoreStyleElement.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
if (!document.head.querySelector('style[data-restore]')) {
  restoreStyleElement.setAttribute('data-restore', 'true');
  document.head.appendChild(restoreStyleElement);
}

export default function MainCanvas() {
  const store = useMemo(() => createTLStore({ shapeUtils: [...defaultShapeUtils] }), []);
  const editorRef = useRef(null);
  const [editorReady, setEditorReady] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [forceRerender, setForceRerender] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [stylePanelCollapsed, setStylePanelCollapsed] = useState(false);
  const [buttonPosition, setButtonPosition] = useState({ bottom: 10, left: 'auto', right: 10 });
  const [savedButtonLeft, setSavedButtonLeft] = useState(null); // 保存展开时的左右位置
  const [savedPanelWidth, setSavedPanelWidth] = useState(200); // 保存编辑框宽度
  const [dragOver, setDragOver] = useState(false);
  const [scrollToAssetId, setScrollToAssetId] = useState(null);
  // 移除保存状态指示器，不再显示任何提示
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  // 刷新恢复状态
  const [isRestoring, setIsRestoring] = useState(false);
  
  // 保存干净初始态快照
  const pristineSnapshotRef = useRef(null);
  const snapshotSavedRef = useRef(false);
  
  // 调试工具：暴露到全局，方便在控制台检查
  useEffect(() => {
    window.debugCanvas = {
      checkSavedData: async () => {
        const data = await storageManager.loadCanvas();
        if (!data) {
          console.log('没有保存的数据');
          return null;
        }
        const dataString = JSON.stringify(data);
        const info = await storageManager.getStorageInfo();
        
        console.log('保存的数据:', {
          version: data.version,
          timestamp: data.timestamp,
          timestampDate: new Date(data.timestamp),
          hasCanvasData: !!data.canvasData,
          hasCamera: !!data.camera,
          camera: data.camera,
          currentPageId: data.currentPageId,
          imageCount: data.imageInfo?.length || 0,
          dataSize: (dataString.length / 1024 / 1024).toFixed(2) + ' MB',
          storageMethod: info.currentMethod,
          maxCapacity: info.maxSize
        });
        return data;
      },
      forceSave: async () => {
        if (editorRef.current) {
          console.log('强制保存当前状态...');
          const canvasData = getSnapshot(editorRef.current.store);
          const currentPageId = editorRef.current.getCurrentPageId();
          const currentShapes = editorRef.current.getCurrentPageShapes();
          const imageShapes = currentShapes.filter(shape => shape.type === 'image');
          const camera = editorRef.current.getCamera();
          const viewport = editorRef.current.getViewportPageBounds();
          
          const saveData = {
            canvasData,
            currentPageId,
            imageInfo: imageShapes.map(shape => ({ shapeId: shape.id })),
            camera,
            viewport,
            version: '1.0',
            timestamp: Date.now(),
            autoSave: true
          };
          
          const result = await storageManager.saveCanvas(saveData);
          if (result.success) {
            console.log(`强制保存完成 (${result.method}, ${result.size}MB)，形状数量:`, currentShapes.length);
          } else {
            console.error('强制保存失败:', result.error);
          }
        }
      },
      clearSavedData: async () => {
        await storageManager.clearCanvas();
      },
      getStorageInfo: async () => {
        const info = await storageManager.getStorageInfo();
        return info;
      }
    };
    
    console.log('🔧 调试工具已加载。在控制台运行：');
    console.log('  window.debugCanvas.checkSavedData() - 检查保存的数据');
    console.log('  window.debugCanvas.forceSave() - 强制保存当前画布');
    console.log('  window.debugCanvas.clearSavedData() - 清除保存的数据');
  }, []);

  // 新建画布功能 - 使用快照恢复
  const handleNewCanvas = useCallback(async () => {
    if (!editorRef.current || !pristineSnapshotRef.current) return;
    
    if (confirm('确定要创建新画布吗？当前画布的内容将被清空。')) {
      try {
        console.log('开始快照恢复重置...');
        
        // 暂停自动保存监听（避免在重置过程写入垃圾快照）
        setIsAutoSaving(false);
        
        // 加载干净初始态快照
        // 使用静态导入的 loadSnapshot
        loadSnapshot(store, pristineSnapshotRef.current);
        
        // 清除自动保存数据
        await storageManager.clearCanvas();
        
        // 恢复自动保存监听
        setIsAutoSaving(true);
        
        console.log('快照恢复重置成功！');
      } catch (error) {
        console.error('快照恢复重置失败:', error);
        // 恢复自动保存监听
        setIsAutoSaving(true);
      }
    }
  }, [store]);

  // 重置画布功能 - 使用快照恢复
  const handleResetCanvas = useCallback(async () => {
    if (!editorRef.current || !pristineSnapshotRef.current) return;
    
    if (confirm('重置/关闭画布将清空所有内容，未保存的数据将丢失。确定继续吗？')) {
      try {
        console.log('开始快照恢复重置...');
        
        // 暂停自动保存监听（避免在重置过程写入垃圾快照）
        setIsAutoSaving(false);
        
        // 加载干净初始态快照
        // 使用静态导入的 loadSnapshot
        loadSnapshot(store, pristineSnapshotRef.current);
        
        // 清除自动保存数据
        await storageManager.clearCanvas();
        
        // 恢复自动保存监听
        setIsAutoSaving(true);
        
        console.log('快照恢复重置成功！');
      } catch (error) {
        console.error('快照恢复重置失败:', error);
        // 恢复自动保存监听
        setIsAutoSaving(true);
      }
    }
  }, [store]);

  // 关闭画布功能
  const handleCloseCanvas = useCallback(() => {
    if (confirm('确定要关闭画布吗？当前画布的内容将被清空。')) {
      try {
        // 清空画布
        if (editorRef.current) {
          const currentShapes = editorRef.current.getCurrentPageShapes();
          if (currentShapes.length > 0) {
            const shapeIds = currentShapes.map(shape => shape.id);
            editorRef.current.deleteShapes(shapeIds);
          }
        }
        
        // 清除所有保存的数据
        localStorage.removeItem('autoSaveCanvas');
        localStorage.removeItem('currentImageIds');
        
        // 画布关闭完成
        
        console.log('画布已关闭');
      } catch (error) {
        console.error('关闭画布失败:', error);
        // 关闭画布失败
      }
    }
  }, []);

  // 自定义菜单项 - 尝试不同的API格式
  const customOverrides = useMemo(() => ({
    actions: (editor, actions) => {
      console.log('Available actions:', Object.keys(actions));
      return {
        ...actions,
        'new-canvas': {
          id: 'new-canvas',
          label: '新建画布',
          kbd: 'Ctrl+N',
          onSelect: handleNewCanvas,
        },
        'close-canvas': {
          id: 'close-canvas', 
          label: '关闭画布',
          kbd: 'Ctrl+W',
          onSelect: handleCloseCanvas,
        },
      };
    },
  }), [handleNewCanvas, handleCloseCanvas]);
  
  // 全局隐藏frame文字的Observer
  useEffect(() => {
    const hideFrameLabels = () => {
      const labelElements = document.querySelectorAll('.tl-frame-label, .tl-frame-heading, .tl-frame-heading-hit-area');
      labelElements.forEach(el => {
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.style.opacity = '0';
        el.style.height = '0';
        el.style.width = '0';
        el.style.overflow = 'hidden';
      });
    };
    
    // 立即执行一次
    hideFrameLabels();
    
    // 创建MutationObserver监听DOM变化
    const observer = new MutationObserver(() => {
      hideFrameLabels();
    });
    
    // 开始观察
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    
    // 定期检查（备用方案）
    const interval = setInterval(hideFrameLabels, 1000);
    
    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  // 自动保存画布状态到localStorage
  const saveCanvasState = useCallback(async () => {
    if (!editorRef.current || isAutoSaving) return;
    
    try {
      setIsAutoSaving(true);
      // 使用静态导入的 getSnapshot
      
      // 获取当前画布状态
      const canvasData = getSnapshot(editorRef.current.store);
      const currentPageId = editorRef.current.getCurrentPageId();
      
      // 获取当前图片ID列表
      const currentShapes = editorRef.current.getCurrentPageShapes();
      const imageShapes = currentShapes.filter(shape => shape.type === 'image');
      const currentImageIds = imageShapes.map(shape => shape.id);
      
      // 保存视图状态（缩放、位置等）
      const viewport = editorRef.current.getViewportPageBounds();
      const camera = editorRef.current.getCamera();
      
      // 构建保存数据
      const saveData = {
        canvasData,
        currentPageId,
        imageInfo: currentImageIds.map(id => ({ shapeId: id })),
        viewport: {
          x: viewport.x,
          y: viewport.y,
          width: viewport.width,
          height: viewport.height
        },
        camera: {
          x: camera.x,
          y: camera.y,
          z: camera.z
        },
        version: '1.0',
        timestamp: Date.now(),
        autoSave: true
      };
      
      
      // 检查 canvasData 中的形状
      if (canvasData && canvasData.store) {
        const shapesInSnapshot = Object.keys(canvasData.store).filter(key => 
          key.startsWith('shape:') && !key.includes('pointer')
        );
        console.log('快照中的形状数量:', shapesInSnapshot.length);
      }
      
      // 使用智能存储管理器保存（支持 IndexedDB 大容量）
      const result = await storageManager.saveCanvas(saveData);
      
      if (result.success) {
      } else {
        console.error(`❌ 自动保存失败: ${result.error}`);
        // 延迟输出，确保错误可见
        setTimeout(() => {
          console.error('⚠️ 自动保存失败详情:', {
            error: result.error,
            size: result.size,
            timestamp: new Date().toLocaleString()
          });
          if (parseFloat(result.size) > 10) {
            console.warn('💡 提示：数据太大，请使用"保存画布"按钮手动保存为文件');
          }
        }, 100);
      }
    } catch (error) {
      console.error('❌ 自动保存异常:', error);
      // 延迟输出，确保错误可见
      setTimeout(() => {
        console.error('⚠️ 自动保存发生严重错误:', {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toLocaleString()
        });
      }, 100);
    } finally {
      setIsAutoSaving(false);
    }
  }, [isAutoSaving]);

  // 从存储恢复画布状态（支持 IndexedDB 和 localStorage）
  const restoreCanvasState = useCallback(async () => {
    if (!editorRef.current) return false;
    
    try {
      const saveData = await storageManager.loadCanvas();
      if (!saveData) {
        console.log('没有找到保存的画布数据');
        return false;
      }
      
      // 检查数据有效性
      if (!saveData.canvasData || !saveData.version) {
        console.log('自动保存数据无效，跳过恢复');
        return false;
      }
      
      // 检查是否是最近的保存（避免恢复过旧的数据）
      const now = Date.now();
      const saveTime = saveData.timestamp || 0;
      const timeDiff = now - saveTime;
      
      // 如果保存时间超过24小时，不自动恢复
      if (timeDiff > 24 * 60 * 60 * 1000) {
        console.log('自动保存数据过旧，跳过恢复');
        return false;
      }
      
      console.log('保存的数据结构:', {
        hasCanvasData: !!saveData.canvasData,
        hasCurrentPageId: !!saveData.currentPageId,
        hasCamera: !!saveData.camera,
        hasViewport: !!saveData.viewport,
        timestamp: saveData.timestamp,
        isRefresh: saveData.isRefresh
      });
      
      // 详细检查 canvasData 中的形状数据
      if (saveData.canvasData && saveData.canvasData.store) {
        const shapesInData = Object.keys(saveData.canvasData.store).filter(key => 
          key.startsWith('shape:') && !key.includes('pointer')
        );
        console.log('保存的数据中包含的形状数量:', shapesInData.length);
        console.log('形状类型:', shapesInData.map(key => {
          const shape = saveData.canvasData.store[key];
          return shape.typeName === 'shape' ? shape.type : 'unknown';
        }));
      }
      
      setIsRestoring(true);
      
      const { loadSnapshot } = await import('tldraw');
      
      // 加载画布数据
      console.log('正在加载快照数据到 store...');
      loadSnapshot(editorRef.current.store, saveData.canvasData);
      console.log('快照数据加载完成');
      
      // 等待加载完成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 验证加载是否成功
      const shapesAfterLoad = editorRef.current.getCurrentPageShapes();
      console.log('加载后的形状数量:', shapesAfterLoad.length);
      console.log('加载后的形状:', shapesAfterLoad.map(s => ({ id: s.id, type: s.type })));
      
      // 恢复页面状态
      if (saveData.currentPageId) {
        try {
          const allPages = editorRef.current.getPages();
          const targetPage = allPages.find(page => page.id === saveData.currentPageId);
          
          if (targetPage) {
            setTimeout(() => {
              editorRef.current.setCurrentPage(saveData.currentPageId);
              console.log('已恢复到页面:', saveData.currentPageId);
            }, 100);
          } else if (allPages.length > 0) {
            editorRef.current.setCurrentPage(allPages[0].id);
          }
        } catch (error) {
          console.warn('恢复页面状态失败:', error);
        }
      }
      
      // 恢复视图状态（缩放、位置等）
      if (saveData.camera) {
        try {
          console.log('准备恢复相机状态:', saveData.camera);
          setTimeout(() => {
            try {
              editorRef.current.setCamera(saveData.camera);
              console.log('已恢复视图状态:', saveData.camera);
              
              // 验证相机状态是否真的恢复了
              setTimeout(() => {
                const currentCamera = editorRef.current.getCamera();
                console.log('当前相机状态:', currentCamera);
                console.log('相机状态恢复是否成功:', 
                  Math.abs(currentCamera.x - saveData.camera.x) < 0.01 &&
                  Math.abs(currentCamera.y - saveData.camera.y) < 0.01 &&
                  Math.abs(currentCamera.z - saveData.camera.z) < 0.01
                );
              }, 100);
            } catch (cameraError) {
              console.error('设置相机状态失败:', cameraError);
            }
          }, 500); // 增加延迟，确保编辑器完全初始化
        } catch (error) {
          console.warn('恢复视图状态失败:', error);
        }
      }
      
      // 如果是刷新恢复，显示提示
      if (saveData.isRefresh) {
        console.log('检测到刷新恢复，工作内容已完全恢复');
        // 可以在这里添加一个短暂的提示
      }
      
      // 更新localStorage中的图片ID列表
      if (saveData.imageInfo) {
        const currentImageIds = saveData.imageInfo.map(img => img.shapeId);
        localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
      }
      
      setIsRestoring(false);
      
      return true;
    } catch (error) {
      console.error('❌ 恢复自动保存失败:', error);
      // 延迟输出详细错误，确保可见
      setTimeout(() => {
        console.error('⚠️ 恢复画布状态时发生错误:', {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toLocaleString()
        });
      }, 100);
      return false;
    } finally {
      setIsRestoring(false);
    }
  }, []);

  // 监听画布变化，自动保存
  useEffect(() => {
    if (!editorReady || !editorRef.current) return;
    
    let saveTimeout;
    
    const unsubscribe = editorRef.current.store.listen(() => {
      // 防抖：延迟5秒后保存，避免频繁保存
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveCanvasState();
      }, 5000);
    }, { scope: "document" });
    
    return () => {
      clearTimeout(saveTimeout);
      unsubscribe();
    };
  }, [editorReady, saveCanvasState]);

  // 页面加载时自动恢复画布状态
  useEffect(() => {
    if (!editorReady) return;
    
    const restoreAutoSave = async () => {
      // 检查是否有分享ID，如果有分享ID则不自动恢复
      const urlParams = new URLSearchParams(window.location.search);
      const shareIdFromUrl = urlParams.get('share');
      const shareIdFromWindow = window.SHARE_ID;
      
      if (shareIdFromUrl || shareIdFromWindow) {
        console.log('检测到分享ID，跳过自动恢复');
        return;
      }
      
      // 延迟一下再恢复，确保编辑器完全初始化
      setTimeout(async () => {
        console.log('开始检查自动保存数据...');
        const restored = await restoreCanvasState();
        if (!restored) {
          console.log('没有找到自动保存的数据或恢复失败');
        } else {
          console.log('自动保存数据恢复完成');
        }
      }, 1500); // 增加延迟时间，确保编辑器完全初始化
    };
    
    restoreAutoSave();
  }, [editorReady, restoreCanvasState]);

  // 页面卸载前保存状态
  useEffect(() => {
    const handleBeforeUnload = async (event) => {
      if (editorRef.current) {
        try {
          
          // 强制同步保存，确保数据不丢失
          const canvasData = getSnapshot(editorRef.current.store);
          const currentPageId = editorRef.current.getCurrentPageId();
          
          const currentShapes = editorRef.current.getCurrentPageShapes();
          const imageShapes = currentShapes.filter(shape => shape.type === 'image');
          const currentImageIds = imageShapes.map(shape => shape.id);
          
          // 保存视图状态（缩放、位置等）
          const viewport = editorRef.current.getViewportPageBounds();
          const camera = editorRef.current.getCamera();
          
          console.log('保存时的状态:', {
            shapesCount: currentShapes.length,
            imageCount: imageShapes.length,
            currentPageId,
            camera,
            viewport
          });
          
          const saveData = {
            canvasData,
            currentPageId,
            imageInfo: currentImageIds.map(id => ({ shapeId: id })),
            viewport: {
              x: viewport.x,
              y: viewport.y,
              width: viewport.width,
              height: viewport.height
            },
            camera: {
              x: camera.x,
              y: camera.y,
              z: camera.z
            },
            version: '1.0',
            timestamp: Date.now(),
            autoSave: true,
            isRefresh: true // 标记为刷新保存
          };
          
          // 使用 storageManager 保存（支持 IndexedDB，避免 localStorage 配额超出）
          // 注意：beforeunload 事件中不能使用 async/await，但可以使用 Promise（虽然可能不完整执行）
          // 这里使用同步方式尝试保存，如果失败则静默处理
          try {
            const result = await storageManager.saveCanvas(saveData);
            if (result.success) {
              console.log(`✅ 页面关闭前保存成功 (${result.method}, ${result.size}MB)`);
            } else {
              console.warn('⚠️ 页面关闭前保存失败:', result.error);
            }
          } catch (saveError) {
            // 如果异步保存失败，尝试同步保存到 localStorage（作为最后手段）
            // 但如果数据太大，可能会失败，这是可以接受的
            try {
              const dataString = JSON.stringify(saveData);
              const dataSizeMB = (dataString.length / 1024 / 1024).toFixed(2);
              
              // 如果数据小于 5MB，尝试保存到 localStorage
              if (dataSizeMB < 5) {
                localStorage.setItem('autoSaveCanvas', dataString);
                console.log('✅ 页面关闭前保存到 localStorage 成功');
              } else {
                console.warn(`⚠️ 数据太大 (${dataSizeMB}MB)，跳过 localStorage 保存`);
              }
            } catch (localStorageError) {
              console.warn('⚠️ localStorage 保存也失败，数据可能丢失:', localStorageError.message);
            }
          }
          
          // 可选：显示确认对话框（仅在用户主动关闭时）
          if (event.type === 'beforeunload') {
            // 不显示确认对话框，直接保存
            return;
          }
        } catch (error) {
          console.error('页面关闭前保存失败:', error);
        }
      }
    };
    
    // 监听多种页面关闭事件
    window.addEventListener('beforeunload', handleBeforeUnload);
    // 移除 unload 事件监听器（已废弃）
    // window.addEventListener('unload', handleBeforeUnload);
    
    // 监听页面隐藏事件（移动端、切换标签页等）
    const handleVisibilityChange = () => {
      if (document.hidden && editorRef.current) {
        handleBeforeUnload({ type: 'visibilitychange' });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // window.removeEventListener('unload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 添加键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+R: 重置画布
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        if (confirm('重置/关闭画布将清空所有内容，未保存的数据将丢失。确定继续吗？')) {
          try {
            console.log('开始重置画布...');
            
            // 清空当前画布
            const currentShapes = editorRef.current.getCurrentPageShapes();
            console.log('当前形状数量:', currentShapes.length);
            
            if (currentShapes.length > 0) {
              const shapeIds = currentShapes.map(shape => shape.id);
              editorRef.current.deleteShapes(shapeIds);
              console.log('已删除形状:', shapeIds.length);
            }
            
            // 清除自动保存数据
            localStorage.removeItem('autoSaveCanvas');
            localStorage.removeItem('currentImageIds');
            
            // 重置视图
            editorRef.current.resetZoom();
            editorRef.current.setCamera({ x: 0, y: 0, z: 1 });
            console.log('已重置视图');
            
            console.log('画布重置成功！');
          } catch (error) {
            console.error('重置画布失败:', error);
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // 从 Link 导入素材到 SpotStudio
  useEffect(() => {
    if (!editorReady || !editorRef.current) {
      console.log('编辑器未就绪，等待中...', { editorReady, hasEditor: !!editorRef.current });
      return;
    }

    console.log('开始检查从 Link 导入的素材...');

    // Housekeeping: 清理旧的本机素材（从 IndexedDB 加载的，现在统一由 Link 管理）
    const cleanupOldLocalAssets = async () => {
      if (!editorRef.current) return;
      
      try {
        console.log('[SpotStudio] 🧹 开始清理旧的本机素材...');
        
        const editor = editorRef.current;
        const allAssets = editor.getAssets();
        const oldLocalAssetsToRemove = [];
        
        // 查找所有标记为本机素材的 assets
        for (const [assetId, asset] of Object.entries(allAssets)) {
          // 检查 meta.isLocalAsset 标记（之前 LocalAssetToggleButton 添加的）
          const isOldLocalAsset = asset?.meta?.isLocalAsset === true;
          if (asset && asset.type === 'image' && isOldLocalAsset) {
            oldLocalAssetsToRemove.push(assetId);
          }
        }
        
        if (oldLocalAssetsToRemove.length === 0) {
          console.log('[SpotStudio] ✅ 没有找到需要清理的旧本机素材');
          return;
        }
        
        console.log(`[SpotStudio] 找到 ${oldLocalAssetsToRemove.length} 个旧本机素材，准备清理...`);
        
        // 使用 editor.deleteAssets() 删除
        if (editor.deleteAssets && typeof editor.deleteAssets === 'function') {
          const assetsToDelete = [];
          for (const assetId of oldLocalAssetsToRemove) {
            const asset = allAssets[assetId];
            if (asset) {
              assetsToDelete.push(asset);
            } else {
              assetsToDelete.push(assetId);
            }
          }
          
          editor.deleteAssets(assetsToDelete);
          console.log(`[SpotStudio] ✅ 已清理 ${oldLocalAssetsToRemove.length} 个旧本机素材`);
        } else {
          // 回退到 store.remove
          const recordsToRemove = [];
          for (const assetId of oldLocalAssetsToRemove) {
            const record = editor.store.get(assetId);
            if (record) {
              recordsToRemove.push(record);
            }
          }
          
          if (recordsToRemove.length > 0) {
            editor.store.remove(recordsToRemove);
            console.log(`[SpotStudio] ✅ 已清理 ${recordsToRemove.length} 个旧本机素材（使用 store.remove）`);
          }
        }
      } catch (error) {
        console.error('[SpotStudio] ❌ 清理旧本机素材失败:', error);
      }
    };

    const importAssetsFromLink = async () => {
      try {
        // 先检查 URL 参数中是否有 token（跨端口的情况）
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('linkAssets');
        
        console.log('当前 URL:', window.location.href);
        console.log('URL 参数:', window.location.search);
        console.log('检查 token:', token);
        
        if (token) {
          console.log('✅ 从 URL 参数获取 token:', token);
          
          // 从 API 服务器获取素材数据
          console.log('准备调用 getApiBaseUrl()...');
          let apiBaseUrl;
          try {
            console.log('调用 getApiBaseUrl()...');
            apiBaseUrl = getApiBaseUrl();
            console.log('✅ getApiBaseUrl() 返回:', apiBaseUrl);
          } catch (error) {
            console.error('❌ 获取 API 地址时出错:', error);
            console.error('错误堆栈:', error.stack);
            return false;
          }
          
          if (!apiBaseUrl) {
            console.error('❌ 无法获取 API 地址，apiBaseUrl 为:', apiBaseUrl);
            return false;
          }
          
          const fetchUrl = `${apiBaseUrl}/api/link-to-spot-assets/${token}`;
          console.log('准备从 API 获取素材数据，URL:', fetchUrl);
          
          try {
            console.log('发送 fetch 请求...');
            const response = await fetch(fetchUrl);
            console.log('收到响应，状态:', response.status, response.statusText);
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error('API 响应错误:', errorText);
              throw new Error(`HTTP错误: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            console.log('API 响应结果:', result);
            
            if (!result.success || !result.assets) {
              console.error('API 返回数据无效:', result);
              throw new Error(result.message || '获取失败');
            }
            
            console.log('✅ 从 API 服务器获取到素材数据:', result.assets.length, '个素材');
            
            // 清理 URL 参数
            urlParams.delete('linkAssets');
            const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
            window.history.replaceState({}, '', newUrl);
            
            console.log('准备处理素材数据...');
            await processAssets({ assets: result.assets });
            console.log('✅ 素材处理完成');
            return true; // 成功导入
          } catch (error) {
            console.error('❌ 从 API 获取素材数据失败:', error);
            console.error('错误详情:', error.message, error.stack);
            // 继续尝试 sessionStorage
          }
        }
        
        // 尝试从 sessionStorage 读取（统一入口的情况）
        const key = 'fluiddam.linkToSpot.v1';
        console.log('检查 sessionStorage key:', key);
        
        const allSessionKeys = Object.keys(sessionStorage);
        console.log('所有 sessionStorage keys:', allSessionKeys.filter(k => k.includes('linkToSpot') || k.includes('fluiddam')));
        
        const raw = sessionStorage.getItem(key);
        console.log('从 sessionStorage 读取到的数据:', raw ? `有数据 (${raw.length} 字符)` : '无数据');
        console.log('当前域名:', window.location.origin);
        console.log('当前端口:', window.location.port);
        
        if (raw) {
          console.log('✅ 从 sessionStorage 找到数据');
          sessionStorage.removeItem(key); // 用完即删，避免脏数据
          const payload = JSON.parse(raw);
          await processAssets(payload);
          return true; // 成功导入
        }
        
        console.log('❌ 没有找到素材数据');
        console.log('可能的原因：1) 数据未保存 2) 跨端口导致存储不共享 3) 数据已过期');
        return false; // 未找到数据
      } catch (error) {
        console.error('从 Link 导入素材时出错:', error);
        return false;
      }
    };

    const processAssets = async (payload) => {
      if (!payload || !payload.assets || payload.assets.length === 0) {
        console.log('payload 无效或没有素材:', payload);
        return;
      }

      console.log('从 Link 导入素材到 SpotStudio:', payload.assets.length, '个素材');
      console.log('解析后的 payload:', payload);

      const editor = editorRef.current;
      if (!editor) {
        console.error('❌ 编辑器未就绪，无法导入素材');
        return;
      }
      
      console.log('编辑器已就绪，开始处理素材...');
      const assets = payload.assets;

      // 为每个素材创建 asset 并添加到编辑器
      for (const assetData of assets) {
          try {
            // 预加载图片获取真实尺寸
            const img = new Image();
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = assetData.dataUrl;
            });

            const naturalW = img.naturalWidth || 300;
            const naturalH = img.naturalHeight || 300;

            // 创建 asset ID
            const assetId = `asset:${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}`;

            // 创建资产 - 使用 store.put 方法
            editor.store.put([
              {
                id: assetId,
                type: "image",
                typeName: "asset",
                meta: {},
                props: {
                  w: naturalW,
                  h: naturalH,
                  src: assetData.dataUrl,
                  name: assetData.name || '未命名',
                  mimeType: assetData.mimeType || 'image/png',
                  isAnimated: false
                }
              }
            ]);

            console.log('素材已添加到 SpotStudio:', assetData.name, assetId);
          } catch (error) {
            console.error('添加素材失败:', assetData.name, error);
          }
        }

      console.log('所有素材已成功导入到 SpotStudio');
    };

    // 从本机加载素材（仅在未从 Link 导入时自动加载）
    const loadLocalAssets = async (skipIfHasAssets = false) => {
      try {
        // 如果 skipIfHasAssets 为 true，先检查是否已经有素材了
        if (skipIfHasAssets && editorRef.current) {
          const existingAssets = editorRef.current.getAssets();
          const assetCount = Object.keys(existingAssets).length;
          if (assetCount > 0) {
            console.log(`[SpotStudio] 检测到已有 ${assetCount} 个素材，跳过自动加载本机素材（避免重复）`);
            return;
          }
        }
        
        console.log('[SpotStudio] 开始加载本机素材...');
        console.log('[SpotStudio] 当前 origin:', window.location.origin);
        if (!localAssetManager) {
          console.error('[SpotStudio] localAssetManager 未定义');
          return;
        }
        
        // 先检查素材数量
        const count = localAssetManager.getAssetCount();
        console.log(`[SpotStudio] 本机素材数量（元数据）: ${count}`);
        
        if (count === 0) {
          console.log('[SpotStudio] 本机暂无保存的素材');
          return;
        }
        
        const assets = await localAssetManager.loadAssets();
        console.log(`[SpotStudio] 从本机加载了 ${assets.length} 个素材`);
        console.log('[SpotStudio] 素材详情:', assets.map(a => ({ id: a.id, name: a.name, hasDataUrl: !!a.dataUrl })));
        
        if (assets.length > 0) {
          console.log('[SpotStudio] 开始处理素材，添加到编辑器...');
          await processAssets({ assets });
          console.log('[SpotStudio] 素材处理完成');
        }
      } catch (error) {
        console.error('[SpotStudio] 加载本机素材失败:', error);
        console.error('[SpotStudio] 错误详情:', error.stack);
      }
    };

    // 延迟一下，确保编辑器完全初始化（增加到2秒，确保在自动恢复之后执行）
    const timer = setTimeout(async () => {
      console.log('延迟执行导入素材检查...');
      
      // 先执行 housekeeping：清理旧的本机素材
      try {
        await cleanupOldLocalAssets();
      } catch (error) {
        console.error('[SpotStudio] 清理旧本机素材时出错:', error);
      }
      
      // 然后尝试从 Link 导入素材
      let hasImportedFromLink = false;
      try {
        hasImportedFromLink = await importAssetsFromLink();
      } catch (error) {
        console.error('[SpotStudio] 从 Link 导入素材时出错:', error);
      }
      
      // 不再自动加载本机素材，用户可以通过按钮手动加载
      // if (!hasImportedFromLink) {
      //   console.log('[SpotStudio] 未从 Link 导入素材，开始加载本机素材...');
      //   try {
      //     await loadLocalAssets(false); // 不跳过，正常加载
      //   } catch (error) {
      //     console.error('[SpotStudio] 加载本机素材时出错:', error);
      //   }
      // } else {
      //   console.log('[SpotStudio] 已从 Link 导入素材，跳过自动加载本机素材（避免重复）');
      //   // 但仍然检查是否有本机素材，如果有则跳过自动加载（用户可以通过按钮手动加载）
      //   await loadLocalAssets(true); // 跳过如果已有素材
      // }
    }, 2000);

    return () => clearTimeout(timer);
  }, [editorReady]);

  // 自动加载分享画布
  useEffect(() => {
    const loadSharedCanvas = async () => {
      // 检查是否有分享ID（从URL参数或window.SHARE_ID）
      const urlParams = new URLSearchParams(window.location.search);
      const shareIdFromUrl = urlParams.get('share');
      const shareIdFromWindow = window.SHARE_ID;
      const shareId = shareIdFromUrl || shareIdFromWindow;
      
      if (!shareId || !editorReady) {
        return;
      }

      try {
        console.log('检测到分享ID，开始加载分享画布:', shareId);
        
        // 显示加载提示
        setIsLoading(true);
        
        // 获取分享数据
        const apiBaseUrl = getApiBaseUrl();
        if (!apiBaseUrl) {
          throw new Error('无法获取API地址');
        }
        
        const response = await fetch(`${apiBaseUrl}/api/get-share/${shareId}`);
        
        if (!response.ok) {
          throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
          const shareData = result.data;
          
          // 调试：打印分享数据结构
          console.log('分享数据结构:', shareData);
          console.log('画布数据:', shareData.canvasData);
          console.log('页面数据:', shareData.canvasData?.pages);
          console.log('形状数据:', shareData.canvasData?.shapes);
          console.log('当前页面ID:', shareData.currentPageId);
          
          // 加载分享的画布数据
          if (shareData.canvasData) {
            // 使用静态导入的 loadSnapshot
            
            // 加载完整的画布状态
            loadSnapshot(editorRef.current.store, shareData.canvasData);
            
            // 等待加载完成
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // 恢复页面状态 - 使用和LoadCanvasButton相同的逻辑
            if (shareData.currentPageId) {
              try {
                console.log('尝试恢复到页面:', shareData.currentPageId);
                
                // 检查页面是否存在
                const allPages = editorRef.current.getPages();
                const targetPage = allPages.find(page => page.id === shareData.currentPageId);
                console.log('目标页面是否存在:', !!targetPage);
                
                if (targetPage) {
                  // 等待一下确保画布完全加载
                  setTimeout(() => {
                    try {
                      editorRef.current.setCurrentPage(shareData.currentPageId);
                      console.log('已恢复到页面:', shareData.currentPageId);
                      
                      // 验证是否真的切换了
                      setTimeout(() => {
                        const newCurrentPage = editorRef.current.getCurrentPage();
                        console.log('切换后的当前页面:', newCurrentPage.name, newCurrentPage.id);
                        
                        // 强制刷新UI
                        try {
                          editorRef.current.updateViewportPageBounds();
                        } catch (e) {
                          // 如果方法不存在，静默处理
                        }
                        console.log('已强制刷新UI');
                      }, 50);
                    } catch (error) {
                      console.error('设置页面失败:', error);
                    }
                  }, 100);
                } else {
                  console.warn('页面不存在，使用默认页面:', shareData.currentPageId);
                  // 如果页面不存在，使用第一个可用页面
                  if (allPages.length > 0) {
                    editorRef.current.setCurrentPage(allPages[0].id);
                  }
                }
              } catch (error) {
                console.warn('恢复页面状态失败:', error);
                // 如果设置页面失败，尝试使用默认页面
                try {
                  const pages = editorRef.current.getPages();
                  if (pages.length > 0) {
                    editorRef.current.setCurrentPage(pages[0].id);
                  }
                } catch (fallbackError) {
                  console.error('设置默认页面也失败:', fallbackError);
                }
              }
            }
            
            // 验证加载结果
            const loadedShapes = editorRef.current.getCurrentPageShapes();
            const allPages = editorRef.current.getPages();
            console.log('加载后的形状数量:', loadedShapes.length);
            console.log('当前页面ID:', editorRef.current.getCurrentPageId());
            console.log('所有页面:', allPages.map(p => ({ id: p.id, name: p.name })));
            console.log('当前页面形状:', loadedShapes.map(s => ({ id: s.id, type: s.type })));
            
            console.log('分享画布加载成功');
            
            // 清理URL参数，避免刷新时重复加载
            if (shareIdFromUrl) {
              const newUrl = window.location.pathname;
              window.history.replaceState({}, document.title, newUrl);
            }
          }
        } else {
          console.error('获取分享数据失败:', result.message);
          alert(`分享画布加载失败：${result.message}`);
        }
      } catch (error) {
        console.error('加载分享画布时出错:', error);
        alert('加载分享画布失败，请检查链接是否正确');
      } finally {
        setIsLoading(false);
      }
    };

    loadSharedCanvas();
  }, [editorReady]);

  // 处理JSON文件加载
  const handleJsonFile = async (file) => {
    console.log('处理JSON文件:', file.name);
    
    try {
      const text = await file.text();
      const saveData = JSON.parse(text);
      
      if (saveData.canvasData && saveData.version) {
        // 使用静态导入的 loadSnapshot
        
        // 清空当前画布
        const currentShapes = editorRef.current.getCurrentPageShapes();
        if (currentShapes.length > 0) {
          const shapeIds = currentShapes.map(shape => shape.id);
          editorRef.current.deleteShapes(shapeIds);
        }
        
        // 加载画布数据
        loadSnapshot(editorRef.current.store, saveData.canvasData);
        
        // 等待加载完成
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 恢复页面状态
        if (saveData.currentPageId) {
          try {
            const allPages = editorRef.current.getPages();
            const targetPage = allPages.find(page => page.id === saveData.currentPageId);
            
            if (targetPage) {
              setTimeout(() => {
                editorRef.current.setCurrentPage(saveData.currentPageId);
              }, 100);
            } else if (allPages.length > 0) {
              editorRef.current.setCurrentPage(allPages[0].id);
            }
          } catch (error) {
            console.warn('恢复页面状态失败:', error);
          }
        }
        
        // 更新localStorage
        if (saveData.imageInfo) {
          const currentImageIds = saveData.imageInfo.map(img => img.shapeId);
          localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
        }
        
        console.log(`画布文件 "${file.name}" 加载成功！`);
      } else {
        alert('这不是一个有效的画布保存文件');
      }
    } catch (error) {
      console.error('加载JSON文件失败:', error);
      alert(`加载文件失败: ${error.message}`);
    }
  };

  // 处理拖拽JSON文件或素材
  const handleDragOver = (e) => {
    console.log('拖拽进入:', e.dataTransfer.types);
    // 检查是否拖拽的是文件或素材
    if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/asset-id')) {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    console.log('拖拽离开');
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = async (e) => {
    console.log('拖拽放下:', e.dataTransfer.files, e.dataTransfer.types);
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    
    // 检查是否是素材拖拽
    if (e.dataTransfer.types.includes('application/asset-id')) {
      const assetId = e.dataTransfer.getData('application/asset-id');
      const assetSrc = e.dataTransfer.getData('application/asset-src');
      const assetName = e.dataTransfer.getData('application/asset-name');
      
      
      // 检查资产是否真的存在
      if (editorRef.current) {
        const asset = editorRef.current.getAsset(assetId);
        
        const normalizedAssetId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
        const normalizedAsset = editorRef.current.getAsset(normalizedAssetId);
      }
      
      if (assetId && editorRef.current) {
        try {
          // 使用更简单的方法：直接使用屏幕坐标转换为画布坐标
          const screenPoint = { x: e.clientX, y: e.clientY };
          const pagePoint = editorRef.current.screenToPage(screenPoint);
          
          console.log('拖拽坐标转换:', { 
            screen: screenPoint, 
            page: pagePoint,
            camera: editorRef.current.getCamera()
          });
          
          // 确保assetId有正确的前缀
          const normalizedAssetId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
          
          // 获取图片原始尺寸
          const { w: natW, h: natH } = await getNaturalSize(editorRef.current, normalizedAssetId, assetSrc);

          // 判断是否丢到某个 frame 内
          const frames = editorRef.current.getCurrentPageShapes().filter(s => s.type === 'frame');
          const frame = frames.find(f => {
            const b = editorRef.current.getShapePageBounds(f.id);
            return b && pagePoint.x >= b.x && pagePoint.x <= b.x + b.w && pagePoint.y >= b.y && pagePoint.y <= b.y + b.h;
          });
          const frameBounds = frame ? editorRef.current.getShapePageBounds(frame.id) : null;

          const { w, h } = computeDropSize({
            natW, natH,
            inFrame: !!frame,
            frameBounds,
            baseScale: 0.6,       // 自由放置的默认缩放比例
            minSide: 80,
            maxSide: 1200,
            padding: 8
          });

          // 使用正确的方式创建图片形状，参考InsertImageButton的实现
          const result = editorRef.current.createShape({
            type: "image",
            x: Math.round(pagePoint.x - w / 2),
            y: Math.round(pagePoint.y - h / 2),
            props: { w, h, assetId: normalizedAssetId }
          });
          
          console.log('素材创建结果:', result);
          
          // 获取实际创建的形状ID
          let shapeId;
          if (typeof result === 'string') {
            shapeId = result;
          } else if (result && result.id) {
            shapeId = result.id;
          } else {
            // 如果无法从返回值获取ID，尝试从最新创建的形状中获取
            const currentShapes = editorRef.current.getCurrentPageShapes();
            const imageShapes = currentShapes.filter(shape => shape.type === 'image');
            if (imageShapes.length > 0) {
              shapeId = imageShapes[imageShapes.length - 1].id;
            }
          }
          
          console.log('素材已添加到画布，形状ID:', shapeId);
          
          // 验证创建的形状
          if (shapeId) {
            setTimeout(() => {
              const createdShape = editorRef.current.getShape(shapeId);
              
              // 检查资产是否存在
              const asset = editorRef.current.getAsset(normalizedAssetId);
            }, 100);
          }
        } catch (error) {
          console.error('添加素材到画布失败:', error);
        }
      }
      return;
    }
    
    const files = Array.from(e.dataTransfer.files);
    console.log('文件列表:', files);
    const jsonFiles = files.filter(file => file.type === 'application/json' || file.name.endsWith('.json'));
    console.log('JSON文件:', jsonFiles);
    
    if (jsonFiles.length > 0) {
      const file = jsonFiles[0]; // 只处理第一个JSON文件
      try {
        const text = await file.text();
        const saveData = JSON.parse(text);
        
        // 检查是否是有效的画布保存文件
        if (saveData.canvasData && saveData.version) {
          // 使用和LoadCanvasButton相同的加载逻辑
          // 使用静态导入的 loadSnapshot
          
          // 先清空当前画布
          const currentShapes = editorRef.current.getCurrentPageShapes();
          if (currentShapes.length > 0) {
            const shapeIds = currentShapes.map(shape => shape.id);
            editorRef.current.deleteShapes(shapeIds);
          }
          
          // 加载画布数据
          loadSnapshot(editorRef.current.store, saveData.canvasData);
          
          // 等待加载完成
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // 恢复页面状态
          if (saveData.currentPageId) {
            try {
              console.log('尝试恢复到页面:', saveData.currentPageId);
              
              const allPages = editorRef.current.getPages();
              const targetPage = allPages.find(page => page.id === saveData.currentPageId);
              console.log('目标页面是否存在:', !!targetPage);
              
              if (targetPage) {
                setTimeout(() => {
                  try {
                    editorRef.current.setCurrentPage(saveData.currentPageId);
                    console.log('已恢复到页面:', saveData.currentPageId);
                    
                    setTimeout(() => {
                      const newCurrentPage = editorRef.current.getCurrentPage();
                      console.log('切换后的当前页面:', newCurrentPage.name, newCurrentPage.id);
                      
                      try {
                        editorRef.current.updateViewportPageBounds();
                      } catch (e) {
                        // 如果方法不存在，静默处理
                      }
                      console.log('已强制刷新UI');
                    }, 50);
                  } catch (error) {
                    console.error('设置页面失败:', error);
                  }
                }, 100);
              } else {
                console.warn('页面不存在，使用默认页面:', saveData.currentPageId);
                if (allPages.length > 0) {
                  editorRef.current.setCurrentPage(allPages[0].id);
                }
              }
            } catch (error) {
              console.warn('恢复页面状态失败:', error);
            }
          }
          
          // 更新localStorage中的图片ID列表
          if (saveData.imageInfo) {
            const currentImageIds = saveData.imageInfo.map(img => img.shapeId);
            localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
          }
          
          console.log('JSON文件加载成功:', file.name);
          alert(`画布文件 "${file.name}" 加载成功！`);
        } else {
          alert('这不是一个有效的画布保存文件');
        }
      } catch (error) {
        console.error('加载JSON文件失败:', error);
        alert(`加载文件失败: ${error.message}`);
      }
    }
  };

  // 添加全局拖拽事件监听
  useEffect(() => {
    const handleGlobalDragOver = (e) => {
      console.log('全局拖拽进入:', e.target, e.dataTransfer.types);
      if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/asset-id')) {
        const files = Array.from(e.dataTransfer.files);
        const jsonFiles = files.filter(file => 
          file.type === 'application/json' || 
          file.name.toLowerCase().endsWith('.json')
        );
        
        if (jsonFiles.length > 0 || e.dataTransfer.types.includes('application/asset-id')) {
          console.log('检测到JSON文件或素材拖拽');
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }
      }
    };

    const handleGlobalDrop = async (e) => {
      console.log('全局拖拽放下:', e.target, e.dataTransfer.files, e.dataTransfer.types);
      
      // 检查是否是素材拖拽
      if (e.dataTransfer.types.includes('application/asset-id')) {
        const assetId = e.dataTransfer.getData('application/asset-id');
        const assetSrc = e.dataTransfer.getData('application/asset-src');
        const assetName = e.dataTransfer.getData('application/asset-name');
        
        
        // 检查资产是否真的存在
        if (editorRef.current) {
          const asset = editorRef.current.getAsset(assetId);
          
          const normalizedAssetId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
          const normalizedAsset = editorRef.current.getAsset(normalizedAssetId);
        }
        
        if (assetId && editorRef.current) {
          try {
            // 使用更简单的方法：直接使用屏幕坐标转换为画布坐标
            const screenPoint = { x: e.clientX, y: e.clientY };
            const pagePoint = editorRef.current.screenToPage(screenPoint);
            
            console.log('全局拖拽坐标转换:', { 
              screen: screenPoint, 
              page: pagePoint,
              camera: editorRef.current.getCamera()
            });
            
            // 确保assetId有正确的前缀
            const normalizedAssetId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
            
            // 获取图片原始尺寸
            const { w: natW, h: natH } = await getNaturalSize(editorRef.current, normalizedAssetId, assetSrc);

            // 判断是否丢到某个 frame 内
            const frames = editorRef.current.getCurrentPageShapes().filter(s => s.type === 'frame');
            const frame = frames.find(f => {
              const b = editorRef.current.getShapePageBounds(f.id);
              return b && pagePoint.x >= b.x && pagePoint.x <= b.x + b.w && pagePoint.y >= b.y && pagePoint.y <= b.y + b.h;
            });
            const frameBounds = frame ? editorRef.current.getShapePageBounds(frame.id) : null;

            const { w, h } = computeDropSize({
              natW, natH,
              inFrame: !!frame,
              frameBounds,
              baseScale: 0.6,       // 自由放置的默认缩放比例
              minSide: 80,
              maxSide: 1200,
              padding: 8
            });

            // 使用正确的方式创建图片形状，参考InsertImageButton的实现
            const result = editorRef.current.createShape({
              type: "image",
              x: Math.round(pagePoint.x - w / 2),
              y: Math.round(pagePoint.y - h / 2),
              props: { w, h, assetId: normalizedAssetId }
            });
            
            console.log('全局拖拽素材创建结果:', result);
            
            // 获取实际创建的形状ID
            let shapeId;
            if (typeof result === 'string') {
              shapeId = result;
            } else if (result && result.id) {
              shapeId = result.id;
            } else {
              // 如果无法从返回值获取ID，尝试从最新创建的形状中获取
              const currentShapes = editorRef.current.getCurrentPageShapes();
              const imageShapes = currentShapes.filter(shape => shape.type === 'image');
              if (imageShapes.length > 0) {
                shapeId = imageShapes[imageShapes.length - 1].id;
              }
            }
            
            console.log('全局拖拽素材已添加到画布，形状ID:', shapeId);
            
            // 验证创建的形状
            if (shapeId) {
              setTimeout(() => {
                const createdShape = editorRef.current.getShape(shapeId);
                
                // 检查资产是否存在
                const asset = editorRef.current.getAsset(normalizedAssetId);
              }, 100);
            }
          } catch (error) {
            console.error('添加素材到画布失败:', error);
          }
        }
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        return;
      }
      
      if (e.dataTransfer.types.includes('Files')) {
        const files = Array.from(e.dataTransfer.files);
        const jsonFiles = files.filter(file => 
          file.type === 'application/json' || 
          file.name.toLowerCase().endsWith('.json')
        );
        
        if (jsonFiles.length > 0) {
          console.log('检测到JSON文件，开始处理:', jsonFiles[0].name);
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          
          // 直接在这里处理JSON文件
          handleJsonFile(jsonFiles[0]);
        }
      }
    };

    document.addEventListener('dragover', handleGlobalDragOver, true);
    document.addEventListener('drop', handleGlobalDrop, true);

    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver, true);
      document.removeEventListener('drop', handleGlobalDrop, true);
    };
  }, []);

  // 动态更新按钮位置：贴在样式面板底部，或画布顶部
  useEffect(() => {
    if (!editorReady) return;
    
    const updateButtonPosition = () => {
      // 查找样式面板
      const stylePanelSelectors = [
        '.tlui-style-panel',
        '.tlui-panel',
        '[data-testid="style-panel"]',
        '.tlui-menu-panel'
      ];
      
      let foundPanel = null;
      for (const selector of stylePanelSelectors) {
        try {
          const panels = document.querySelectorAll(selector);
          for (const panel of panels) {
            const rect = panel.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(panel);
            const isVisible = rect.width > 0 && rect.height > 0 && 
                             computedStyle.display !== 'none' &&
                             computedStyle.visibility !== 'hidden' &&
                             computedStyle.opacity !== '0';
            if (isVisible && rect.left > window.innerWidth * 0.5) {
              foundPanel = panel;
              break;
            }
          }
          if (foundPanel) break;
        } catch (e) {}
      }
      
      if (foundPanel && !stylePanelCollapsed) {
        // 样式面板存在且可见，按钮贴在面板底部
        const rect = foundPanel.getBoundingClientRect();
        const buttonWidth = 40;
        const panelWidth = rect.width; // 编辑框宽度
        setSavedPanelWidth(panelWidth); // 保存编辑框宽度
        
        // 计算可用区域的右边界
        const availableRightEdge = sidebarCollapsed 
          ? window.innerWidth  // 右边栏收起，可用到窗口最右面
          : window.innerWidth - sidebarWidth; // 右边栏展开，减去右边栏宽度
        
        // 按钮距离右边缘 = 1/2 编辑框宽度
        const offsetFromRight = panelWidth / 2;
        const leftPos = availableRightEdge - buttonWidth - offsetFromRight;
        
        setSavedButtonLeft(leftPos); // 保存左右位置
        
        setButtonPosition({
          top: rect.bottom, // 按钮上边框贴着编辑框下边框
          left: leftPos,
          right: 'auto',
          bottom: 'auto',
          transform: 'none'
        });
      } else {
        // 样式面板不存在或已折叠，按钮在画布顶部
        const buttonWidth = 40;
        
        // 计算可用区域的右边界
        const availableRightEdge = sidebarCollapsed 
          ? window.innerWidth  // 右边栏收起，可用到窗口最右面
          : window.innerWidth - sidebarWidth; // 右边栏展开，减去右边栏宽度
        
        // 使用保存的编辑框宽度
        const panelWidth = savedPanelWidth;
        
        // 按钮距离右边缘 = 1/2 编辑框宽度
        const offsetFromRight = panelWidth / 2;
        const leftPos = availableRightEdge - buttonWidth - offsetFromRight;
        
        setButtonPosition({
          bottom: 'auto',
          top: 0, // 按钮上边框贴着画布上边框
          left: leftPos,
          right: 'auto',
          transform: 'none'
        });
      }
    };
    
    updateButtonPosition();
    const interval = setInterval(updateButtonPosition, 500);
    
    // 监听窗口大小变化
    window.addEventListener('resize', updateButtonPosition);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', updateButtonPosition);
    };
  }, [editorReady, stylePanelCollapsed, sidebarCollapsed, sidebarWidth]);

  // 控制 TLDraw 样式面板的显示/隐藏
  useEffect(() => {
    if (!editorReady) return;
    
    const toggleStylePanel = () => {
      // 方法1: 查找所有可能的样式面板选择器
      const stylePanelSelectors = [
        '.tlui-style-panel',
        '.tlui-panel',
        '[data-testid="style-panel"]',
        '.tlui-menu-panel',
        '.tlui-color-panel',
        '.tlui-stroke-style-panel',
        '.tlui-fill-style-panel',
        '[class*="tlui"][class*="panel"]',
        '[class*="tlui"][class*="style"]'
      ];
      
      const foundPanels = new Set();
      
      stylePanelSelectors.forEach(selector => {
        try {
          const panels = document.querySelectorAll(selector);
          panels.forEach(panel => {
            foundPanels.add(panel);
          });
        } catch (e) {
          // 忽略无效选择器
        }
      });
      
      // 方法2: 查找包含颜色选择器、滑块、尺寸按钮的元素（这些通常在样式面板中）
      const validSelectors = [
        '[class*="color"]',
        '[class*="palette"]',
        '[class*="swatch"]',
        '[class*="stroke"]',
        '[class*="fill"]',
        '[class*="size"]',
        'input[type="range"]' // 滑块
      ];
      
      validSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            const rect = el.getBoundingClientRect();
            // 检查是否在右侧区域（TLDraw 样式面板通常在右侧）
            const isRightSide = rect.left > window.innerWidth * 0.5;
            
            if (isRightSide) {
              // 向上查找包含这些元素的父面板
              let parent = el.parentElement;
              let depth = 0;
              while (parent && depth < 10) {
                const parentClass = parent.className || '';
                if (typeof parentClass === 'string' && (
                  parentClass.includes('panel') || 
                  parentClass.includes('tlui') ||
                  parentClass.includes('menu')
                )) {
                  foundPanels.add(parent);
                  break;
                }
                parent = parent.parentElement;
                depth++;
              }
            }
          });
        } catch (e) {
          // 忽略无效选择器
        }
      });
      
      // 方法3: 查找包含 S/M/L/XL 文本的按钮
      try {
        const allButtons = document.querySelectorAll('button');
        allButtons.forEach(button => {
          const text = button.textContent?.trim() || '';
          if (['S', 'M', 'L', 'XL'].includes(text)) {
            const rect = button.getBoundingClientRect();
            const isRightSide = rect.left > window.innerWidth * 0.5;
            
            if (isRightSide) {
              let parent = button.parentElement;
              let depth = 0;
              while (parent && depth < 10) {
                const parentClass = parent.className || '';
                if (typeof parentClass === 'string' && (
                  parentClass.includes('panel') || 
                  parentClass.includes('tlui') ||
                  parentClass.includes('menu')
                )) {
                  foundPanels.add(parent);
                  break;
                }
                parent = parent.parentElement;
                depth++;
              }
            }
          }
        });
      } catch (e) {
        // 忽略错误
      }
      
      // 应用显示/隐藏
      foundPanels.forEach(panel => {
        if (stylePanelCollapsed) {
          panel.style.display = 'none';
          panel.style.visibility = 'hidden';
          panel.style.opacity = '0';
          panel.style.height = '0';
          panel.style.overflow = 'hidden';
          panel.style.pointerEvents = 'none';
        } else {
          panel.style.display = '';
          panel.style.visibility = '';
          panel.style.opacity = '';
          panel.style.height = '';
          panel.style.overflow = '';
          panel.style.pointerEvents = '';
        }
      });
    };
    
    // 延迟执行，确保 TLDraw UI 已渲染
    const timer = setTimeout(toggleStylePanel, 500);
    
    // 使用 MutationObserver 监听 DOM 变化
    const observer = new MutationObserver(() => {
      toggleStylePanel();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    
    // 定期检查（备用方案）
    const interval = setInterval(toggleStylePanel, 1000);
    
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      observer.disconnect();
    };
  }, [editorReady, stylePanelCollapsed]);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", display: "flex" }}>
      {/* 左侧画布区域 */}
      <div 
        style={{ 
          flex: 1, 
          position: "relative"
        }}
        onDragOver={(e) => {
          console.log('画布区域拖拽进入');
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          console.log('画布区域拖拽离开');
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={async (e) => {
          console.log('画布区域拖拽放下');
          e.preventDefault();
          setDragOver(false);
          
          const files = Array.from(e.dataTransfer.files);
          console.log('拖拽的文件:', files);
          
          const jsonFiles = files.filter(file => 
            file.type === 'application/json' || 
            file.name.toLowerCase().endsWith('.json')
          );
          
          if (jsonFiles.length > 0) {
            const file = jsonFiles[0];
            console.log('处理JSON文件:', file.name);
            
            try {
              const text = await file.text();
              const saveData = JSON.parse(text);
              
              if (saveData.canvasData && saveData.version) {
                // 使用静态导入的 loadSnapshot
                
                // 清空当前画布
                const currentShapes = editorRef.current.getCurrentPageShapes();
                if (currentShapes.length > 0) {
                  const shapeIds = currentShapes.map(shape => shape.id);
                  editorRef.current.deleteShapes(shapeIds);
                }
                
                // 加载画布数据
                loadSnapshot(editorRef.current.store, saveData.canvasData);
                
                // 等待加载完成
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 恢复页面状态
                if (saveData.currentPageId) {
                  try {
                    const allPages = editorRef.current.getPages();
                    const targetPage = allPages.find(page => page.id === saveData.currentPageId);
                    
                    if (targetPage) {
                      setTimeout(() => {
                        editorRef.current.setCurrentPage(saveData.currentPageId);
                      }, 100);
                    } else if (allPages.length > 0) {
                      editorRef.current.setCurrentPage(allPages[0].id);
                    }
                  } catch (error) {
                    console.warn('恢复页面状态失败:', error);
                  }
                }
                
                // 更新localStorage
                if (saveData.imageInfo) {
                  const currentImageIds = saveData.imageInfo.map(img => img.shapeId);
                  localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
                }
                
                alert(`画布文件 "${file.name}" 加载成功！`);
              } else {
                alert('这不是一个有效的画布保存文件');
              }
            } catch (error) {
              console.error('加载JSON文件失败:', error);
              alert(`加载文件失败: ${error.message}`);
            }
          }
        }}
      >
      {isLoading ? (
        <div style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f5f5f5",
          fontSize: "18px",
          color: "#666"
        }}>
          正在重新初始化画布...
        </div>
      ) : isRestoring ? (
        <div style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f8f9fa",
          fontSize: "16px",
          color: "#28a745",
          flexDirection: "column",
          gap: "10px"
        }}>
          <div style={{
            width: "40px",
            height: "40px",
            border: "3px solid #28a745",
            borderTop: "3px solid transparent",
            borderRadius: "50%",
            animation: "spin 1s linear infinite"
          }}></div>
          <div>正在恢复您的工作内容...</div>
          <div style={{ fontSize: "14px", color: "#6c757d" }}>请稍候，您的画布即将完全恢复</div>
        </div>
      ) : (
        <Tldraw
            key={forceRerender} // 强制重新渲染
            store={store}
            onMount={(editor) => {
          editorRef.current = editor;
          setEditorReady(true);
          
          // 保存干净初始态快照（只在首次mount时保存）
          if (!snapshotSavedRef.current) {
            try {
              const snapshot = getSnapshot(store);
              pristineSnapshotRef.current = snapshot;
              snapshotSavedRef.current = true;
            } catch (error) {
              console.error('保存初始快照失败:', error);
            }
          }
          
          // 确保没有选中任何元素
          setTimeout(() => {
            try {
              editor.setSelectedShapes([]);
            } catch (error) {
              // 静默处理错误
            }
          }, 100);
          
          // 监听选中变化
          editor.store.listen(() => {
            // 检查选中的形状，看是否有frame被选中
            try {
              const selectedShapeIds = editor.getSelectedShapeIds();
              if (selectedShapeIds.length > 0) {
                const selectedShape = editor.getShape(selectedShapeIds[0]);
                if (selectedShape && selectedShape.type === 'frame') {
                  setSelectedFrame(selectedShape);
                } else if (selectedShape && selectedShape.type === 'image') {
                  // 如果选中的是图片，触发滚动到素材面板
                  const assetId = selectedShape.props?.assetId;
                  if (assetId) {
                    setScrollToAssetId(assetId);
                    // 重置状态，避免重复触发
                    setTimeout(() => setScrollToAssetId(null), 100);
                  }
                  setSelectedFrame(null);
                } else {
                  setSelectedFrame(null);
                }
              } else {
                setSelectedFrame(null);
              }
            } catch (error) {
              setSelectedFrame(null);
            }
            
            // 更新当前图片ID列表
            const currentShapes = editor.getCurrentPageShapes();
            const imageShapes = currentShapes.filter(shape => shape.type === 'image');
            const currentImageIds = imageShapes.map(shape => shape.id);
            localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
          });

        }}
        />
      )}
      
      {/* 保存状态指示器已移除 */}

      {/* 样式面板折叠/展开按钮 */}
      {editorReady && (
        <div
          style={{
            position: 'fixed',
            ...buttonPosition,
            width: 40, // 展开和收起时都是40
            height: 20, // 展开和收起时都是20
            background: '#ffffff',
            border: '1px solid #d1d5db', // 展开和收起时都是黑色边框
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            zIndex: 10000,
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)'
          }}
          onClick={() => setStylePanelCollapsed(!stylePanelCollapsed)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f3f4f6';
            e.currentTarget.style.borderColor = '#9ca3af';
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.18)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.borderColor = '#d1d5db';
            e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.12)';
          }}
          title={stylePanelCollapsed ? "展开样式面板" : "收起样式面板"}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderStyle: 'solid',
              borderWidth: stylePanelCollapsed ? '5px 4px 0 4px' : '0 4px 5px 4px',
              borderColor: stylePanelCollapsed 
                ? `#4b5563 transparent transparent transparent`
                : `transparent transparent #4b5563 transparent`,
              transition: 'all 0.2s ease-in-out'
            }}
          />
        </div>
      )}

      {/* 拖拽提示覆盖层 */}
      {dragOver && (
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 123, 255, 0.1)',
            border: '3px dashed #007bff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            pointerEvents: 'auto'
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#007bff' }}>🎨 拖拽素材到画布</h3>
            <p style={{ margin: 0, color: '#666' }}>将素材拖拽到这里直接放置到画布上</p>
          </div>
        </div>
      )}
      
       {/* 顶部按钮已移除，功能集成到右侧素材栏中 */}
      </div>
      
      {/* 右侧集成素材栏 */}
      {editorReady && (
        <ResizableSidebar 
          width={sidebarCollapsed ? 0 : sidebarWidth} 
          onWidthChange={setSidebarWidth}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          <IntegratedAssetSidebar 
            editor={editorRef.current} 
            selectedFrame={selectedFrame}
            setIsLoading={setIsLoading}
            platform="TM"
            width={sidebarWidth}
            onReset={handleResetCanvas}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            onScrollToAsset={scrollToAssetId}
          />
        </ResizableSidebar>
      )}
    </div>
  );
}
