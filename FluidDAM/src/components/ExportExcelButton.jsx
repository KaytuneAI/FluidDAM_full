import React, { useState } from "react";
import { getIconPath } from '../utils/iconPath.js';

/**
 * 导出图片按钮组件
 * 功能：将选中区域内的图片素材复制到剪贴板，可在 Excel 中粘贴为图片
 */
export default function ExportExcelButton({ editor }) {
  const [isExporting, setIsExporting] = useState(false);

  // 将图片转换为 Blob
  const imageToBlob = async (imageSrc) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('无法转换图片为 Blob'));
          }
        }, 'image/png');
      };
      img.onerror = reject;
      img.src = imageSrc;
    });
  };

  // 导出选中区域的图片到剪贴板
  const exportImages = async () => {
    if (!editor || isExporting) return;

    setIsExporting(true);
    try {
      console.log('[ExportImage] 开始导出选中区域的图片...');

      // 1. 获取选中的形状
      const selectedShapeIds = editor.getSelectedShapeIds();
      console.log(`[ExportImage] 选中的形状数量: ${selectedShapeIds.length}`);

      if (selectedShapeIds.length === 0) {
        alert('请先选中一个区域（框选图片）');
        setIsExporting(false);
        return;
      }

      // 2. 筛选出图片类型的形状
      const imageShapes = [];
      for (const shapeId of selectedShapeIds) {
        const shape = editor.getShape(shapeId);
        if (shape && shape.type === 'image') {
          imageShapes.push(shape);
        }
      }

      console.log(`[ExportImage] 找到 ${imageShapes.length} 个图片`);

      if (imageShapes.length === 0) {
        alert('选中的区域中没有图片，请选择包含图片的区域');
        setIsExporting(false);
        return;
      }

      // 3. 处理图片：如果只有一个，直接复制；如果有多个，合并为一个图片
      if (imageShapes.length === 1) {
        // 单个图片：直接复制
        const shape = imageShapes[0];
        const assetId = shape.props?.assetId;
        
        if (!assetId) {
          alert('图片数据不完整，无法导出');
          setIsExporting(false);
          return;
        }

        // 获取图片资源（标准化 assetId）
        const normalizedAssetId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
        const asset = editor.getAsset(normalizedAssetId);
        if (!asset || !asset.props?.src) {
          alert('无法获取图片资源');
          setIsExporting(false);
          return;
        }

        const imageSrc = asset.props.src;
        console.log('[ExportImage] 准备复制单个图片到剪贴板');

        // 转换为 Blob 并复制到剪贴板
        const blob = await imageToBlob(imageSrc);
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);

        console.log('[ExportImage] 图片已复制到剪贴板');
        alert(`已复制 1 张图片到剪贴板，可在 Excel 中粘贴`);
      } else {
        // 多个图片：转换为 HTML 格式，保持相对位置，让 Excel 识别为多张独立图片
        console.log('[ExportImage] 准备导出多个图片（保持独立）');

        // 获取所有图片的边界框，用于计算相对位置
        let minX = Infinity, minY = Infinity;
        const imageDataList = [];

        // 先获取所有图片的位置和资源
        for (const shape of imageShapes) {
          const assetId = shape.props?.assetId;
          if (!assetId) continue;

          // 标准化 assetId
          const normalizedAssetId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
          const asset = editor.getAsset(normalizedAssetId);
          if (!asset || !asset.props?.src) continue;

          // 获取形状的页面边界
          const bounds = editor.getShapePageBounds(shape.id);
          if (!bounds) continue;

          minX = Math.min(minX, bounds.x);
          minY = Math.min(minY, bounds.y);

          imageDataList.push({
            shape,
            assetId: normalizedAssetId,
            asset,
            bounds,
            src: asset.props.src
          });
        }

        if (imageDataList.length === 0) {
          alert('无法加载图片资源');
          setIsExporting(false);
          return;
        }

        // 加载所有图片并转换为 base64
        const loadedImages = [];
        for (const imageData of imageDataList) {
          try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = imageData.src;
            });

            // 转换为 base64
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const base64 = canvas.toDataURL('image/png');

            // 计算相对位置（相对于最小边界）
            const relativeX = imageData.bounds.x - minX;
            const relativeY = imageData.bounds.y - minY;

            loadedImages.push({
              base64,
              x: relativeX,
              y: relativeY,
              width: imageData.bounds.width,
              height: imageData.bounds.height,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight
            });
          } catch (error) {
            console.error('[ExportImage] 加载图片失败:', imageData.assetId, error);
          }
        }

        if (loadedImages.length === 0) {
          alert('无法加载图片资源');
          setIsExporting(false);
          return;
        }

        // 创建 HTML 片段，包含所有图片，使用绝对定位保持相对位置
        // Excel 支持从 HTML 粘贴，会识别其中的图片
        const htmlContent = `
          <html>
            <body style="margin: 0; padding: 0;">
              ${loadedImages.map((img, index) => `
                <img 
                  src="${img.base64}" 
                  style="
                    position: absolute; 
                    left: ${img.x}px; 
                    top: ${img.y}px; 
                    width: ${img.width}px; 
                    height: ${img.height}px;
                  "
                  alt="Image ${index + 1}"
                />
              `).join('')}
            </body>
          </html>
        `;

        // 创建纯文本版本（备用）
        const plainText = `已选择 ${loadedImages.length} 张图片`;

        // 使用 HTML 格式复制到剪贴板
        try {
          const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
          const textBlob = new Blob([plainText], { type: 'text/plain' });

          // 同时提供 HTML 和纯文本格式，Excel 会优先使用 HTML
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': htmlBlob,
              'text/plain': textBlob
            })
          ]);

          console.log('[ExportImage] 多张图片已复制到剪贴板（HTML格式）');
          alert(`已复制 ${loadedImages.length} 张图片到剪贴板，可在 Excel 中粘贴（将保持相对位置）`);
        } catch (error) {
          console.error('[ExportImage] 复制到剪贴板失败:', error);
          
          // 如果 HTML 格式失败，尝试使用第一张图片作为备用方案
          try {
            const firstBlob = await imageToBlob(loadedImages[0].base64);
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': firstBlob })
            ]);
            alert(`已复制第 1 张图片到剪贴板（共 ${loadedImages.length} 张，其他图片请单独导出）`);
          } catch (fallbackError) {
            console.error('[ExportImage] 备用方案也失败:', fallbackError);
            alert('复制到剪贴板失败，请检查浏览器权限设置');
          }
        }
      }
    } catch (error) {
      console.error('[ExportImage] 导出失败:', error);
      alert('导出失败: ' + (error.message || '未知错误，请查看控制台'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={exportImages}
      disabled={isExporting || !editor}
      title={isExporting ? "正在导出..." : "导出图片（选中区域内的图片将复制到剪贴板，可在Excel中粘贴）"}
      style={{
        fontSize: 12,
        padding: "2px",
        border: "0.5px solid #dee2e6",
        borderRadius: 2,
        background: "#dee2e6",
        color: "white",
        cursor: isExporting ? "wait" : "pointer",
        fontWeight: "bold",
        whiteSpace: "nowrap",
        width: 40,
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: isExporting ? 0.6 : 1
      }}
    >
      {isExporting ? (
        <div style={{
          width: 20,
          height: 20,
          border: "2px solid #ccc",
          borderTop: "2px solid #007bff",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }} />
      ) : (
        <span style={{ fontSize: 18 }}>🖼️</span>
      )}
    </button>
  );
}
