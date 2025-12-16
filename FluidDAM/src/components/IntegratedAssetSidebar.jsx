import React, { useState, useEffect, useCallback, useRef } from 'react';
import { sidebarStyles } from '../styles/sidebarStyles.js';
import { placeAssetIntoSelectedFrame } from '../utils/assetUtils.js';
import InsertImageButton from './InsertImageButton.jsx';
import LoadCanvasButton from './LoadCanvasButton.jsx';
import SaveCanvasButton from './SaveCanvasButton.jsx';
import ShareCanvasButton from './ShareCanvasButton.jsx';
import FormatBrushButton from './FormatBrushButton.jsx';
import ImageFormatBrushButton from './ImageFormatBrushButton.jsx';
import BatchReplaceButton from './BatchReplaceButton.jsx';
import LocalAssetToggleButton from './LocalAssetToggleButton.jsx';
import { getIconPath } from '../utils/iconPath.js';
import { navigateToHome } from '../utils/navigation.js';

export default function IntegratedAssetSidebar({ editor, selectedFrame, setIsLoading, platform = "TM", width, onReset, collapsed, onToggleCollapse, onScrollToAsset }) {
  const [usedAssetIds, setUsedAssetIds] = useState(new Set());
  const [assets, setAssets] = useState([]);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [highlightedAssetId, setHighlightedAssetId] = useState(null);
  
  // 去抖定时器引用
  const debounceTimerRef = useRef(null);
  const assetListRef = useRef(null);

  // 更新已使用的资产ID
  const updateUsedAssetIds = useCallback(() => {
    if (!editor) return;
    try {
      const imgs = editor.getCurrentPageShapes().filter(s => s.type === "image");
      const setA = new Set(imgs.map(s => s?.props?.assetId).filter(Boolean));
      setUsedAssetIds(setA);
    } catch (error) {
      // 静默处理错误
    }
  }, [editor]);

  // 滚动到指定素材并高亮
  const scrollToAsset = useCallback((assetId) => {
    if (!assetListRef.current) return;
    
    try {
      // 查找对应的素材元素
      const assetElement = assetListRef.current.querySelector(`[data-asset-id="${assetId}"]`);
      if (assetElement) {
        // 滚动到该元素
        assetElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
        
        // 高亮显示
        setHighlightedAssetId(assetId);
        
        // 3秒后移除高亮
        setTimeout(() => {
          setHighlightedAssetId(null);
        }, 3000);
      }
    } catch (error) {
      console.error('滚动到素材时出错:', error);
    }
  }, []);

  // 高亮画布中的素材
  const highlightAssetOnCanvas = useCallback((assetId) => {
    if (!editor) return;
    
    try {
      // 查找画布中所有使用该素材的图片形状
      const shapes = editor.getCurrentPageShapes();
      const targetShapes = shapes.filter(shape => 
        shape.type === "image" && shape.props.assetId === assetId
      );
      
      if (targetShapes.length > 0) {
        // 先清除之前的高亮效果
        document.querySelectorAll('.asset-highlight').forEach(el => {
          el.classList.remove('asset-highlight');
        });
        
        // 使用临时高亮效果，不移动视图，不改变选中状态
        targetShapes.forEach(shape => {
          // 尝试多种选择器来找到元素
          const selectors = [
            `[data-shape-id="${shape.id}"]`,
            `[data-tl-shape-id="${shape.id}"]`,
            `[data-id="${shape.id}"]`,
            `#shape-${shape.id}`
          ];
          
          let element = null;
          for (const selector of selectors) {
            element = document.querySelector(selector);
            if (element) break;
          }
          
          if (element) {
            // 添加高亮类名
            element.classList.add('asset-highlight');
            
            // 3秒后移除高亮效果
            setTimeout(() => {
              if (element) {
                element.classList.remove('asset-highlight');
              }
            }, 3000);
          }
        });
        
        // 已高亮显示素材
      }
    } catch (error) {
      // 静默处理错误
    }
  }, [editor]);

  // 监听外部滚动请求
  useEffect(() => {
    if (onScrollToAsset && typeof onScrollToAsset === 'string') {
      scrollToAsset(onScrollToAsset);
    }
  }, [onScrollToAsset, scrollToAsset]);

  // 更新资产列表 - 从store中获取所有image资产（带去抖）
  const updateAssets = useCallback(() => {
    if (!editor) return;
    
    // 清除之前的定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // 设置新的去抖定时器
    debounceTimerRef.current = setTimeout(() => {
      try {
        const assets = [];
        const seenAssetIds = new Set();
        
        // 方法1: 从store中直接获取所有image资产（包括未使用的）
        try {
          const allAssets = editor.getAssets();
          for (const [key, asset] of Object.entries(allAssets)) {
            if (asset && asset.type === 'image') {
              const assetId = asset.id || key;
              if (!seenAssetIds.has(assetId)) {
                assets.push(asset);
                seenAssetIds.add(assetId);
              }
            }
          }
        } catch (error) {
          console.warn('从store获取资产时出错，尝试备用方法:', error);
        }
        
        // 方法2: 如果方法1没有获取到资产，从当前页面的image形状反查资产（备用方案）
        if (assets.length === 0) {
          const currentShapes = editor.getCurrentPageShapes();
          const imageShapes = currentShapes.filter(shape => shape.type === 'image');
          
          for (const imageShape of imageShapes) {
            const assetId = imageShape.props?.assetId;
            if (assetId && !seenAssetIds.has(assetId)) {
              try {
                const asset = editor.getAsset(assetId);
                if (asset && asset.type === 'image') {
                  assets.push(asset);
                  seenAssetIds.add(assetId);
                }
              } catch (error) {
                // 资产不存在，跳过
              }
            }
          }
        }
        
        console.log('更新资产列表，共', assets.length, '个资产');
        setAssets(assets);
      } catch (error) {
        console.error('更新资产列表时出错:', error);
      }
    }, 300); // 300ms 去抖延迟
  }, [editor]);

  // 监听编辑器变化
  useEffect(() => {
    if (!editor) return;

    const updateAll = () => {
      updateUsedAssetIds();
      updateAssets();
    };

    // 初始更新
    updateAll();

    // 监听变化 - 监听形状和资产的变化
    const unsubscribe = editor.store.listen((record, prevRecord) => {
      // 监听形状变化（特别是图片形状）
      if (record && record.typeName === 'shape') {
        if (record.type === 'image') {
          console.log('检测到图片形状变化:', record.id);
          updateAll();
        }
      }
      // 监听资产变化（包括删除）
      if (record && record.typeName === 'asset') {
        // 检查是否是删除操作（prevRecord 存在但 record 不存在，或者 record 被标记为删除）
        const isDeleted = !record || (prevRecord && !record);
        console.log('检测到资产变化:', {
          typeName: record?.typeName,
          type: record?.type,
          id: record?.id || prevRecord?.id,
          isDeleted: isDeleted,
          action: isDeleted ? '删除' : '更新/添加'
        });
        updateAll();
      }
    }, { scope: "document" });

    // 添加定期检查作为备用方案
    const interval = setInterval(updateAll, 2000);

    return () => {
      unsubscribe();
      clearInterval(interval);
      // 清理去抖定时器
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [editor, updateUsedAssetIds, updateAssets]);

  // 放置资产到选中的Frame
  const onPlace = useCallback((assetId) => {
    if (!editor) return;
    placeAssetIntoSelectedFrame(editor, assetId, platform);
  }, [editor, platform]);


  return (
    <div style={{
      ...sidebarStyles.container,
      width: width,
      borderLeft: `2px solid #007bff`,
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden"
    }}>
      {/* 顶部操作按钮区域 - 固定在顶部 */}
      <div style={{
        padding: "12px",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flexShrink: 0,
        background: "#fff",
        zIndex: 10
      }}>
        {/* Logo 区域 */}
        <div 
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 4,
            cursor: "pointer"
          }}
          onClick={navigateToHome}
          title="返回主页"
        >
          <img 
            src={encodeURI(getIconPath('image/kaytuneai logo.png'))} 
            alt="Kaytune AI Logo" 
            style={{
              maxWidth: "100%",
              height: "auto",
              maxHeight: "40px",
              objectFit: "contain"
            }}
          />
        </div>
        <div style={{
          display: 'flex', 
          gap: 4, 
          flexWrap: 'wrap', 
          alignItems: 'center',
          justifyContent: 'flex-start'
        }}>
          <InsertImageButton editor={editor} selectedFrame={selectedFrame} />
          <LoadCanvasButton editor={editor} setIsLoading={setIsLoading} />
          <SaveCanvasButton editor={editor} />
          <ShareCanvasButton editor={editor} />
          <FormatBrushButton editor={editor} iconSrc={getIconPath('icons/resize.png')} />
          <ImageFormatBrushButton editor={editor} />
          <LocalAssetToggleButton editor={editor} />
          <button 
            onClick={onReset}
            style={{
              fontSize: 12,
              padding: "2px",
              border: "0.5px solid #dee2e6",
              borderRadius: 2,
              background: "#dee2e6",
              color: "white",
              cursor: "pointer",
              fontWeight: "bold",
              whiteSpace: "nowrap",
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
            title="重置画布 (Ctrl+R)"
          >
            <img src={getIconPath('icons/reset.png')} alt="重置画布" style={{width: 32, height: 32}} />
          </button>
        </div>
      </div>

      {/* 素材预览区域 - 可滚动 */}
      <div ref={assetListRef} style={{
        ...sidebarStyles.list,
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden"
      }}>
        {assets.map((a) => {
          const name = a?.props?.name || a?.props?.src?.split("/").slice(-1)[0] || a.id;
          const isUsed = usedAssetIds.has(a.id);
          return (
            <div 
              key={a.id} 
              data-asset-id={a.id}
              style={{
                ...sidebarStyles.card(isUsed),
                cursor: 'grab',
                background: highlightedAssetId === a.id ? "#fff3cd" : (isUsed ? "#e3f2fd" : "#fff"),
                border: highlightedAssetId === a.id ? "2px solid #ffc107" : (isUsed ? "1px solid #2196f3" : "1px solid #e5e7eb"),
                transition: "all 0.3s ease"
              }}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/asset-id', a.id);
                e.dataTransfer.setData('application/asset-src', a?.props?.src || '');
                e.dataTransfer.setData('application/asset-name', name);
                e.dataTransfer.effectAllowed = 'copy';
                
                // 设置拖拽时的预览图像 - 创建合适尺寸的预览
                const img = new Image();
                img.src = a?.props?.src || '';
                
                // 创建一个合适大小的预览画布
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 200;
                canvas.height = 200;
                
                img.onload = () => {
                  // 在画布上绘制缩小的图片，保持宽高比
                  const aspectRatio = img.naturalWidth / img.naturalHeight;
                  let drawWidth = 200;
                  let drawHeight = 200;
                  
                  if (aspectRatio > 1) {
                    // 宽图片
                    drawHeight = 200 / aspectRatio;
                  } else {
                    // 高图片
                    drawWidth = 200 * aspectRatio;
                  }
                  
                  // 居中绘制
                  const offsetX = (200 - drawWidth) / 2;
                  const offsetY = (200 - drawHeight) / 2;
                  
                  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
                  e.dataTransfer.setDragImage(canvas, 100, 100);
                };
                
                // 如果图片已经加载完成
                if (img.complete) {
                  const aspectRatio = img.naturalWidth / img.naturalHeight;
                  let drawWidth = 200;
                  let drawHeight = 200;
                  
                  if (aspectRatio > 1) {
                    drawHeight = 200 / aspectRatio;
                  } else {
                    drawWidth = 200 * aspectRatio;
                  }
                  
                  const offsetX = (200 - drawWidth) / 2;
                  const offsetY = (200 - drawHeight) / 2;
                  
                  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
                  e.dataTransfer.setDragImage(canvas, 100, 100);
                }
              }}
              onDragEnd={(e) => {
                // 拖拽结束时的处理
              }}
              title="拖拽到画布或点击放置到Frame"
            >
              <div style={sidebarStyles.thumbWrap}>
                <img 
                  src={a?.props?.src} 
                  alt={name} 
                  style={{
                    ...sidebarStyles.thumb,
                    cursor: 'pointer'
                  }}
                  onClick={() => highlightAssetOnCanvas(a.id)}
                  title="点击高亮画布中的相同素材"
                />
              </div>
              <div>
                <div title={name} style={sidebarStyles.name}>{name}</div>
                <BatchReplaceButton 
                  editor={editor} 
                  assetId={a.id} 
                  assetName={name}
                />
              </div>
            </div>
          );
        })}
        {assets.length === 0 && (
          <div style={{ color: "#6b7280", fontSize: 12, padding: "12px" }}>拖入图片或粘贴即可出现数字资产</div>
        )}
      </div>
    </div>
  );
}
