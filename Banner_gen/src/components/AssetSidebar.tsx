import React, { useState, useEffect, useMemo } from 'react';
import './AssetSidebar.css';
import { BannerData } from '../types';
import type { TempAsset } from '@shared/types/assets';

interface AssetSidebarProps {
  jsonData: BannerData[];
  currentIndex: number;
  onAssetClick?: (assetUrl: string, fieldName: string) => void;
  extraAssets?: TempAsset[];  // 来自 Link 的额外素材
  sidebarWidth?: number;  // 素材栏宽度，用于计算图片尺寸
}

interface AssetItem {
  id: string; // 唯一标识符
  url: string;
  fieldName: string;
  name: string;
  isUsed: boolean;
}

export const AssetSidebar: React.FC<AssetSidebarProps> = ({
  jsonData,
  currentIndex,
  onAssetClick,
  extraAssets = [],
  sidebarWidth = 280,
}) => {
  const [highlightedAsset, setHighlightedAsset] = useState<string | null>(null);

  // 合并 JSON 数据中的素材和来自 Link 的额外素材
  const displayAssets = useMemo(() => {
    const assetMap = new Map<string, AssetItem>();
    let assetCounter = 0; // 用于生成唯一 ID
    
    // 1. 从 JSON 数据中提取所有图片素材
    jsonData.forEach((data, index) => {
      Object.keys(data).forEach((key) => {
        const value = data[key];
        
        // 检查是否是图片字段（包含 _src, image, img 等关键词）
        const isImageField = 
          key.includes('_src') || 
          key.includes('image') || 
          key.includes('img') ||
          key.toLowerCase().includes('picture');
        
        if (isImageField && value) {
          // 处理字符串类型的图片 URL
          if (typeof value === 'string' && value.trim()) {
            const url = value.trim();
            // 使用组合 key 确保唯一性：fieldName + url + index
            const uniqueKey = `${key}_${index}_${url.substring(0, 50)}`;
            if (!assetMap.has(uniqueKey)) {
              assetMap.set(uniqueKey, {
                id: `json_${assetCounter++}`,
                url,
                fieldName: key,
                name: url.split('/').pop() || url.substring(0, 30),
                isUsed: index === currentIndex,
              });
            } else {
              // 更新 isUsed 状态
              const existing = assetMap.get(uniqueKey)!;
              if (index === currentIndex) {
                existing.isUsed = true;
              }
            }
          }
          // 处理数组类型的图片 URL
          else if (Array.isArray(value)) {
            value.forEach((item, itemIndex) => {
              if (typeof item === 'string' && item.trim()) {
                const url = item.trim();
                // 使用组合 key 确保唯一性
                const uniqueKey = `${key}_${index}_${itemIndex}_${url.substring(0, 50)}`;
                if (!assetMap.has(uniqueKey)) {
                  assetMap.set(uniqueKey, {
                    id: `json_${assetCounter++}`,
                    url,
                    fieldName: key,
                    name: url.split('/').pop() || url.substring(0, 30),
                    isUsed: index === currentIndex,
                  });
                } else {
                  const existing = assetMap.get(uniqueKey)!;
                  if (index === currentIndex) {
                    existing.isUsed = true;
                  }
                }
              }
            });
          }
        }
      });
    });
    
    // 2. 添加来自 Link 的额外素材
    extraAssets.forEach((asset, idx) => {
      const src = asset.dataUrl ?? asset.url;
      if (!src) return;
      
      // 使用 asset.id 作为 key，避免与 JSON 数据中的素材冲突
      if (!assetMap.has(asset.id)) {
        assetMap.set(asset.id, {
          id: asset.id,
          url: src,
          fieldName: 'link-asset',
          name: asset.name || `Link 素材 ${idx + 1}`,
          isUsed: false, // Link 素材默认不在当前数据中使用
        });
      }
    });
    
    return Array.from(assetMap.values());
  }, [jsonData, currentIndex, extraAssets]);

  // 高亮当前使用的素材
  useEffect(() => {
    const usedAssets = displayAssets.filter(a => a.isUsed);
    if (usedAssets.length > 0) {
      setHighlightedAsset(usedAssets[0].url);
      setTimeout(() => setHighlightedAsset(null), 2000);
    }
  }, [currentIndex, displayAssets]);

  const handleAssetClick = (asset: AssetItem) => {
    setHighlightedAsset(asset.url);
    setTimeout(() => setHighlightedAsset(null), 2000);
    if (onAssetClick) {
      onAssetClick(asset.url, asset.fieldName);
    }
  };

  return (
    <div className="asset-sidebar">
      <div className="asset-sidebar-header">
        <h3>素材库</h3>
        <span className="asset-count">{displayAssets.length} 个素材</span>
      </div>
      
      <div className="asset-sidebar-list">
        {displayAssets.length === 0 ? (
          <div className="asset-sidebar-empty">
            <p>暂无素材</p>
            <p className="hint">上传 JSON 数据后，图片素材将自动显示在这里</p>
          </div>
        ) : (
          displayAssets.map((asset) => {
            const isHighlighted = highlightedAsset === asset.url;
            return (
              <div
                key={asset.id}
                className={`asset-card ${asset.isUsed ? 'used' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                onClick={() => handleAssetClick(asset)}
                title={`${asset.fieldName}: ${asset.name}`}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', asset.url);
                  e.dataTransfer.setData('application/asset-url', asset.url);
                  e.dataTransfer.effectAllowed = 'copy';
                  
                  // 创建拖拽预览
                  const img = new Image();
                  img.crossOrigin = 'anonymous';
                  img.src = asset.url;
                  
                  const createDragImage = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    
                    const maxSize = 150;
                    let drawWidth = Math.min(maxSize, img.naturalWidth || img.width || 150);
                    let drawHeight = Math.min(maxSize, img.naturalHeight || img.height || 150);
                    
                    // 保持宽高比
                    if (img.naturalWidth && img.naturalHeight) {
                      const aspectRatio = img.naturalWidth / img.naturalHeight;
                      if (aspectRatio > 1) {
                        drawHeight = drawWidth / aspectRatio;
                      } else {
                        drawWidth = drawHeight * aspectRatio;
                      }
                    }
                    
                    canvas.width = drawWidth;
                    canvas.height = drawHeight;
                    ctx.drawImage(img, 0, 0, drawWidth, drawHeight);
                    e.dataTransfer.setDragImage(canvas, drawWidth / 2, drawHeight / 2);
                  };
                  
                  if (img.complete && img.naturalWidth > 0) {
                    // 图片已加载
                    createDragImage();
                  } else {
                    // 等待图片加载
                    img.onload = createDragImage;
                    img.onerror = () => {
                      // 加载失败时使用默认图标
                      const canvas = document.createElement('canvas');
                      canvas.width = 100;
                      canvas.height = 100;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.fillStyle = '#f0f0f0';
                        ctx.fillRect(0, 0, 100, 100);
                        ctx.fillStyle = '#999';
                        ctx.font = '12px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText('图片', 50, 50);
                        e.dataTransfer.setDragImage(canvas, 50, 50);
                      }
                    };
                  }
                }}
              >
                <div 
                  className="asset-thumb"
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    maxHeight: `${sidebarWidth - 32}px`, // 减去 padding
                  }}
                >
                  <img
                    src={asset.url}
                    alt={asset.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        parent.innerHTML = '<div class="asset-error">图片加载失败</div>';
                      }
                    }}
                  />
                </div>
                <div className="asset-info">
                  <div className="asset-name" title={asset.name}>
                    {asset.name}
                  </div>
                  <div className="asset-field">{asset.fieldName}</div>
                </div>
                {asset.isUsed && (
                  <div className="asset-badge">使用中</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

