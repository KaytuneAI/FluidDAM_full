import React, { useState, useEffect, useCallback, useRef } from 'react';
import { localAssetManager } from '@shared/utils/localAssetManager';
import { getIconPath } from '../utils/iconPath.js';

// 外部跟踪本机素材的 assetId（如果 meta 也不允许自定义数据，使用这个作为备选方案）
const localAssetIdSet = new Set();

/**
 * 本机素材加载/卸载切换按钮
 * 功能：
 * - Load: 从本机素材中加载素材到素材面板
 * - Unload: 从素材面板中移除本机素材
 */
export default function LocalAssetToggleButton({ editor }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [localAssetIds, setLocalAssetIds] = useState(new Set()); // 跟踪已加载的本机素材 assetId

  // 检查本机素材是否已加载
  const checkLocalAssetsLoaded = useCallback(() => {
    if (!editor) return false;

    try {
      const allAssets = editor.getAssets();
      let hasLocalAssets = false;
      const foundLocalAssetIds = new Set();

      for (const [assetId, asset] of Object.entries(allAssets)) {
        // 优先检查 meta，如果 meta 不支持，则使用外部 Set 跟踪
        const isLocalAsset = asset?.meta?.isLocalAsset || localAssetIdSet.has(assetId);
        if (asset && asset.type === 'image' && isLocalAsset) {
          hasLocalAssets = true;
          foundLocalAssetIds.add(assetId);
        }
      }

      setLocalAssetIds(foundLocalAssetIds);
      return hasLocalAssets;
    } catch (error) {
      console.error('[LocalAssetToggleButton] 检查本机素材状态失败:', error);
      return false;
    }
  }, [editor]);

  // 初始化时检查状态
  useEffect(() => {
    if (editor) {
      const loaded = checkLocalAssetsLoaded();
      setIsLoaded(loaded);

      // 监听资产变化，自动更新状态
      const unsubscribe = editor.store.listen((record) => {
        if (record && record.typeName === 'asset') {
          const loaded = checkLocalAssetsLoaded();
          setIsLoaded(loaded);
        }
      }, { scope: 'document' });

      return () => unsubscribe();
    }
  }, [editor, checkLocalAssetsLoaded]);

  // 加载本机素材
  const handleLoad = async () => {
    if (!editor || isLoading) return;

    setIsLoading(true);
    try {
      console.log('[LocalAssetToggleButton] 开始加载本机素材...');

      // 检查本机素材数量
      const count = localAssetManager.getAssetCount();
      if (count === 0) {
        alert('本机暂无保存的素材');
        setIsLoading(false);
        return;
      }

      // 从本机加载素材
      const assets = await localAssetManager.loadAssets();
      console.log(`[LocalAssetToggleButton] 从本机加载了 ${assets.length} 个素材`);

      if (assets.length === 0) {
        alert('本机暂无保存的素材');
        setIsLoading(false);
        return;
      }

      // 添加到编辑器
      const loadedAssetIds = new Set();
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

          // 创建资产 - 标记为本机素材
          // 注意：不能将自定义属性放在 props 中（TLDraw 会验证），使用 meta 存储自定义数据
          editor.store.put([
            {
              id: assetId,
              type: 'image',
              typeName: 'asset',
              meta: {
                isLocalAsset: true, // 标记为本机素材
                localAssetId: assetData.id, // 保存原始本机素材ID
                source: assetData.source // 保存来源（link/template-gen）
              },
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

          loadedAssetIds.add(assetId);
          // 同时添加到外部跟踪 Set（作为备选方案）
          localAssetIdSet.add(assetId);
          console.log('[LocalAssetToggleButton] 素材已添加到编辑器:', assetData.name, assetId);
        } catch (error) {
          console.error('[LocalAssetToggleButton] 添加素材失败:', assetData.name, error);
          // 如果 meta 不支持，尝试不使用 meta，只使用外部跟踪
          if (error.message && error.message.includes('Unexpected property')) {
            console.warn('[LocalAssetToggleButton] meta 不支持自定义属性，改用外部跟踪');
            try {
              // 重新创建，不使用 meta
              editor.store.put([
                {
                  id: assetId,
                  type: 'image',
                  typeName: 'asset',
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
              loadedAssetIds.add(assetId);
              localAssetIdSet.add(assetId);
              console.log('[LocalAssetToggleButton] 素材已添加到编辑器（使用外部跟踪）:', assetData.name, assetId);
            } catch (retryError) {
              console.error('[LocalAssetToggleButton] 重试添加素材失败:', assetData.name, retryError);
            }
          }
        }
      }

      setLocalAssetIds(loadedAssetIds);
      setIsLoaded(true);
      console.log(`[LocalAssetToggleButton] 成功加载 ${loadedAssetIds.size} 个本机素材`);
    } catch (error) {
      console.error('[LocalAssetToggleButton] 加载本机素材失败:', error);
      alert('加载本机素材失败，请查看控制台');
    } finally {
      setIsLoading(false);
    }
  };

  // 卸载本机素材
  const handleUnload = async () => {
    if (!editor || isLoading) return;

    setIsLoading(true);
    try {
      console.log('[LocalAssetToggleButton] 开始卸载本机素材...');

      // 获取所有本机素材的 assetId
      const allAssets = editor.getAssets();
      const localAssetIdsToRemove = [];

      for (const [assetId, asset] of Object.entries(allAssets)) {
        // 优先检查 meta，如果 meta 不支持，则使用外部 Set 跟踪
        const isLocalAsset = asset?.meta?.isLocalAsset || localAssetIdSet.has(assetId);
        if (asset && asset.type === 'image' && isLocalAsset) {
          localAssetIdsToRemove.push(assetId);
        }
      }

      if (localAssetIdsToRemove.length === 0) {
        console.log('[LocalAssetToggleButton] 没有找到本机素材');
        setIsLoaded(false);
        setLocalAssetIds(new Set());
        setIsLoading(false);
        return;
      }

      // 检查是否有本机素材正在被使用
      const shapes = editor.getCurrentPageShapes();
      const usedLocalAssetIds = new Set();
      
      for (const shape of shapes) {
        if (shape.type === 'image' && shape.props?.assetId) {
          const assetId = shape.props.assetId;
          if (localAssetIdsToRemove.includes(assetId)) {
            usedLocalAssetIds.add(assetId);
          }
        }
      }

      if (usedLocalAssetIds.size > 0) {
        const confirmMessage = `有 ${usedLocalAssetIds.size} 个本机素材正在画布中使用。\n卸载后这些图片将无法显示。\n\n是否继续卸载？`;
        if (!confirm(confirmMessage)) {
          setIsLoading(false);
          return;
        }
      }

      // 从编辑器中删除本机素材
      // 使用 TLDraw 的 editor.deleteAssets() 方法（推荐方式）
      // 参考：https://tldraw.dev/reference/editor/Editor#deleteAssets
      const removedIds = [];
      
      try {
        // 方法 1：尝试使用 editor.deleteAssets()（TLDraw 官方 API）
        // deleteAssets 接受 asset ID 数组或 asset 对象数组
        if (editor.deleteAssets && typeof editor.deleteAssets === 'function') {
          // 收集 asset 对象（优先）或 asset ID
          const assetsToDelete = [];
          for (const assetId of localAssetIdsToRemove) {
            const asset = allAssets[assetId];
            if (asset) {
              assetsToDelete.push(asset);
            } else {
              // 如果找不到 asset 对象，使用 ID
              const normalizedId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
              assetsToDelete.push(normalizedId);
            }
          }
          
          editor.deleteAssets(assetsToDelete);
          console.log(`[LocalAssetToggleButton] 使用 deleteAssets() 删除 ${assetsToDelete.length} 个素材`);
          
          // 从外部跟踪 Set 中移除
          localAssetIdsToRemove.forEach(assetId => {
            const normalizedId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
            localAssetIdSet.delete(normalizedId);
            localAssetIdSet.delete(assetId);
            localAssetIdSet.delete(assetId.replace('asset:', ''));
            removedIds.push(normalizedId);
          });
        } else {
          // 方法 2：回退到使用 store.remove（如果 deleteAssets 不可用）
          console.warn('[LocalAssetToggleButton] deleteAssets 方法不可用，使用 store.remove');
          
          const recordsToRemove = [];
          for (const assetId of localAssetIdsToRemove) {
            const record = editor.store.get(assetId);
            if (record) {
              recordsToRemove.push(record);
            } else {
              const normalizedId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
              const normalizedRecord = editor.store.get(normalizedId);
              if (normalizedRecord) {
                recordsToRemove.push(normalizedRecord);
              } else {
                console.warn('[LocalAssetToggleButton] 无法找到素材 record:', assetId);
              }
            }
          }
          
          if (recordsToRemove.length > 0) {
            editor.store.remove(recordsToRemove);
            console.log(`[LocalAssetToggleButton] 使用 store.remove 删除 ${recordsToRemove.length} 个素材`);
            
            localAssetIdsToRemove.forEach(assetId => {
              const normalizedId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
              localAssetIdSet.delete(normalizedId);
              localAssetIdSet.delete(assetId);
              localAssetIdSet.delete(assetId.replace('asset:', ''));
              removedIds.push(normalizedId);
            });
          }
        }
        
        console.log(`[LocalAssetToggleButton] 批量删除 ${removedIds.length} 个本机素材`);
      } catch (error) {
        console.error('[LocalAssetToggleButton] 批量删除失败，尝试逐个删除:', error);
        
        // 如果批量删除失败，逐个删除
        for (const assetId of localAssetIdsToRemove) {
          try {
            const asset = allAssets[assetId];
            if (asset && editor.deleteAssets) {
              editor.deleteAssets([asset]);
            } else {
              const normalizedId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
              const record = editor.store.get(normalizedId);
              if (record) {
                editor.store.remove([record]);
              }
            }
            
            const normalizedId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
            localAssetIdSet.delete(normalizedId);
            localAssetIdSet.delete(assetId);
            localAssetIdSet.delete(assetId.replace('asset:', ''));
            removedIds.push(normalizedId);
            console.log('[LocalAssetToggleButton] 已移除本机素材:', normalizedId);
          } catch (err) {
            console.error('[LocalAssetToggleButton] 移除素材失败:', assetId, err);
          }
        }
      }

      // 等待一下，确保 store 的监听器被触发
      // 注意：IntegratedAssetSidebar 有 300ms 去抖延迟，所以需要等待更长时间
      // 另外，TLDraw 的 store.remove 是异步的，需要等待删除完成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 验证删除是否成功
      try {
        const remainingAssets = editor.getAssets();
        const remainingLocalAssets = Object.entries(remainingAssets).filter(([id, asset]) => {
          const isLocal = asset?.meta?.isLocalAsset || localAssetIdSet.has(id);
          return asset && asset.type === 'image' && isLocal;
        });
        
        if (remainingLocalAssets.length > 0) {
          console.warn('[LocalAssetToggleButton] 仍有本机素材未删除:', remainingLocalAssets.length, remainingLocalAssets.map(([id]) => id));
          console.warn('[LocalAssetToggleButton] 未删除的素材详情:', remainingLocalAssets.map(([id, asset]) => ({ id, name: asset?.props?.name })));
        } else {
          console.log('[LocalAssetToggleButton] ✅ 所有本机素材已成功删除');
        }
        
        // 输出当前所有素材数量（用于调试）
        const allAssetsCount = Object.keys(remainingAssets).length;
        console.log(`[LocalAssetToggleButton] 当前编辑器中共有 ${allAssetsCount} 个素材（应该不包含本机素材）`);
      } catch (error) {
        console.error('[LocalAssetToggleButton] 验证删除结果时出错:', error);
      }

      setLocalAssetIds(new Set());
      setIsLoaded(false);
      console.log(`[LocalAssetToggleButton] 成功卸载 ${removedIds.length} 个本机素材`);
    } catch (error) {
      console.error('[LocalAssetToggleButton] 卸载本机素材失败:', error);
      alert('卸载本机素材失败，请查看控制台');
    } finally {
      setIsLoading(false);
    }
  };

  // 根据状态选择图标和文本
  // 图标路径：Load 图标（带勾的文件夹）和 Unload 图标（带X的文件夹）
  // 需要将图标文件放在 FluidDAM/public/icons/ 目录下
  const iconPath = isLoaded 
    ? 'icons/unload_local_assets.png' // Unload 图标（带X的文件夹）
    : 'icons/load_local_assets.png'; // Load 图标（带勾的文件夹）

  const buttonText = isLoaded ? 'Unload本机素材' : 'Load本机素材';
  const buttonTitle = isLoaded 
    ? `卸载本机素材（当前已加载 ${localAssetIds.size} 个）`
    : '加载本机素材到素材面板';

  return (
    <button
      onClick={isLoaded ? handleUnload : handleLoad}
      disabled={isLoading}
      style={{
        fontSize: 12,
        padding: "2px",
        border: `0.5px solid ${isLoaded ? "#f44336" : "#4caf50"}`,
        borderRadius: 2,
        background: isLoaded ? "#ffebee" : "#e8f5e9",
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
      title={isLoading ? (isLoaded ? '正在卸载...' : '正在加载...') : buttonTitle}
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
