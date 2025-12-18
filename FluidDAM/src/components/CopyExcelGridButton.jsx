import React, { useState, useEffect } from "react";
import ExcelJS from 'exceljs';
import { getIconPath } from '../utils/iconPath.js';

/**
 * Export to Excel (Grid) 按钮组件
 * 功能：将选中的多张图片导出为 Excel 文件，网格布局，保持画布相对位置关系
 * 
 * 特性：
 * - 图片高度固定为 4 个单元格，宽度按比例
 * - 左右间隔 1 个单元格
 * - 保持高精度（SCALE=2）
 * - 反映画布中的上下左右关系
 */
export default function CopyExcelGridButton({ editor }) {
  const [isExporting, setIsExporting] = useState(false);
  const [hasSelectedImages, setHasSelectedImages] = useState(false);

  // 配置参数 - 使用 Excel 默认单元格尺寸的倍数
  const ROW_HEIGHT_PT = 15 * 1.5;  // Excel 默认行高 15pt 的 1.5 倍 = 22.5pt
  const COL_WIDTH_CHAR = 8.43 * 1.3;  // Excel 默认列宽 8.43 字符的 1.3 倍 = 10.959
  const IMG_H_CELLS = 4;  // 图片显示高度 = 4 行
  const GAP_CELLS = 1;  // 图片之间横向间隔 1 列
  const GAP_ROWS = 3;  // 图片之间纵向间隔 3 行
  const SCALE = 2;  // 高分辨率倍数
  const MAX_COLS = 100;  // 最大列数（用于设置列宽）
  const MAX_ROWS = 200;  // 最大行数（用于设置行高）

  // Excel 单位转换
  const pt2px = 96 / 72;  // points 到 pixels 的转换（约 1.333）
  const char2px = 7;  // 字符宽度到 pixels 的转换（Excel 默认字体下）
  
  // 计算像素值（用于图片尺寸计算）
  const ROW_PX = ROW_HEIGHT_PT * pt2px;  // 22.5 * 1.333 ≈ 30px
  const COL_PX = COL_WIDTH_CHAR * char2px;  // 10.959 * 7 ≈ 76.7px
  
  // 计算显示尺寸
  const displayH_px = IMG_H_CELLS * ROW_PX;  // 4 * 30 = 120px
  const gap_px = GAP_CELLS * COL_PX;  // 1 * 76.7 ≈ 76.7px
  const ROW_SPLIT = IMG_H_CELLS * 0.6;  // 行分割阈值（约 2.4 行）

  // 监听选中状态，更新按钮可用性
  useEffect(() => {
    if (!editor) {
      setHasSelectedImages(false);
      return;
    }

    const updateSelection = () => {
      try {
        const selectedShapeIds = editor.getSelectedShapeIds();
        const imageShapes = selectedShapeIds
          .map(id => {
            try {
              return editor.getShape(id);
            } catch (e) {
              return null;
            }
          })
          .filter(shape => shape && shape.type === 'image');
        
        const hasImages = imageShapes.length >= 1;
        setHasSelectedImages(hasImages);
        console.log('[ExportExcelGrid] 选中状态更新:', {
          selectedCount: selectedShapeIds.length,
          imageCount: imageShapes.length,
          hasImages
        });
      } catch (error) {
        console.error('[ExportExcelGrid] 更新选中状态失败:', error);
        setHasSelectedImages(false);
      }
    };

    // 初始检查
    updateSelection();

    // 监听选中变化
    const unsubscribe = editor.store.listen(() => {
      setTimeout(updateSelection, 50);
    }, { scope: "document" });

    // 定期检查作为备用（每 500ms）
    const interval = setInterval(updateSelection, 500);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [editor]);

  // 将图片 URL 转换为 ArrayBuffer（浏览器环境）
  const imageToArrayBuffer = async (imageSrc) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          
          canvas.toBlob((blob) => {
            if (blob) {
              blob.arrayBuffer().then(resolve).catch(reject);
            } else {
              reject(new Error('无法转换图片为 Blob'));
            }
          }, 'image/png');
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => {
        if (imageSrc.startsWith('data:')) {
          // 如果是 data URI，直接转换
          const base64 = imageSrc.split(',')[1];
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          resolve(bytes.buffer);
        } else {
          reject(new Error('图片加载失败'));
        }
      };
      
      img.src = imageSrc;
    });
  };

  // 生成高分辨率图片 ArrayBuffer（保持比例，不裁剪）
  const generateHighResImage = async (imageSrc, targetWidth, targetHeight) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          // 计算高分辨率尺寸
          const srcH = targetHeight * SCALE;
          const srcW = targetWidth * SCALE;
          
          // 创建 canvas
          const canvas = document.createElement('canvas');
          canvas.width = srcW;
          canvas.height = srcH;
          const ctx = canvas.getContext('2d');
          
          // 使用高质量缩放
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          // 计算绘制尺寸（保持宽高比，contain 模式）
          const imgAspectRatio = img.naturalWidth / img.naturalHeight;
          const targetAspectRatio = targetWidth / targetHeight;
          
          let drawWidth, drawHeight, offsetX, offsetY;
          
          if (imgAspectRatio > targetAspectRatio) {
            // 图片更宽，以高度为准
            drawHeight = srcH;
            drawWidth = srcH * imgAspectRatio;
            offsetX = (srcW - drawWidth) / 2;
            offsetY = 0;
          } else {
            // 图片更高，以宽度为准
            drawWidth = srcW;
            drawHeight = srcW / imgAspectRatio;
            offsetX = 0;
            offsetY = (srcH - drawHeight) / 2;
          }
          
          // 填充白色背景
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, srcW, srcH);
          
          // 绘制图片
          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
          
          // 转换为 ArrayBuffer
          canvas.toBlob((blob) => {
            if (blob) {
              blob.arrayBuffer().then(resolve).catch(reject);
            } else {
              reject(new Error('无法转换图片为 Blob'));
            }
          }, 'image/png', 1.0);
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => {
        if (imageSrc.startsWith('data:')) {
          // 如果是 data URI，直接转换
          const base64 = imageSrc.split(',')[1];
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          resolve(bytes.buffer);
        } else {
          reject(new Error('图片加载失败'));
        }
      };
      
      img.src = imageSrc;
    });
  };

  // 导出为 Excel 文件
  const exportToExcel = async () => {
    if (!editor || isExporting) {
      if (!editor) {
        alert('编辑器未就绪，请稍候再试');
      }
      return;
    }

    setIsExporting(true);
    try {
      console.log('[ExportExcelGrid] 开始导出为 Excel 文件...');

      // 1. 获取选中的图片形状
      const selectedShapeIds = editor.getSelectedShapeIds();
      console.log('[ExportExcelGrid] 选中的形状 IDs:', selectedShapeIds);
      
      const imageShapes = selectedShapeIds
        .map(id => {
          try {
            return editor.getShape(id);
          } catch (e) {
            console.error('[ExportExcelGrid] 获取形状失败:', id, e);
            return null;
          }
        })
        .filter(shape => shape && shape.type === 'image');

      console.log('[ExportExcelGrid] 找到的图片形状:', imageShapes.length);

      if (imageShapes.length === 0) {
        alert('请先选中至少一张图片');
        setIsExporting(false);
        return;
      }

      // 2. 获取图片数据和位置信息
      const imageDataList = [];
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

        imageDataList.push({
          shape,
          assetId: normalizedAssetId,
          asset,
          bounds,
          src: asset.props.src,
          x: bounds.x,
          y: bounds.y,
          w: bounds.width,
          h: bounds.height
        });
      }

      if (imageDataList.length === 0) {
        alert('无法加载图片资源');
        setIsExporting(false);
        return;
      }

      // 3. 归一化并量化到网格
      const gridData = imageDataList.map(imgData => ({
        ...imgData,
        gridX: Math.round(imgData.x / COL_PX),
        gridY: Math.round(imgData.y / ROW_PX)
      }));

      // 4. 排序（按 gridY, gridX）
      gridData.sort((a, b) => {
        if (a.gridY !== b.gridY) {
          return a.gridY - b.gridY;
        }
        return a.gridX - b.gridX;
      });

      // 5. 分行（保持上下关系）
      const rows = [];
      let currentRow = [];
      let currentRowY = null;

      for (const imgData of gridData) {
        if (currentRowY === null || Math.abs(imgData.gridY - currentRowY) <= ROW_SPLIT) {
          // 同一行
          currentRow.push(imgData);
          if (currentRowY === null) {
            currentRowY = imgData.gridY;
          }
        } else {
          // 新行
          if (currentRow.length > 0) {
            // 对当前行按 gridX 排序
            currentRow.sort((a, b) => a.gridX - b.gridX);
            rows.push(currentRow);
          }
          currentRow = [imgData];
          currentRowY = imgData.gridY;
        }
      }
      // 添加最后一行
      if (currentRow.length > 0) {
        currentRow.sort((a, b) => a.gridX - b.gridX);
        rows.push(currentRow);
      }

      console.log(`[ExportExcelGrid] 分为 ${rows.length} 行`);

      // 6. 处理每张图片：计算显示尺寸并生成高分辨率图片
      const processedImages = [];
      for (const row of rows) {
        const rowImages = [];
        for (const imgData of row) {
          try {
            // 计算显示尺寸（保持比例）
            const dispH = displayH_px;  // 固定高度 80px
            let dispW = Math.round(dispH * (imgData.w / imgData.h));  // 按比例计算宽度
            
            // 限制最大宽度（防止极宽图撑爆版面）
            const maxWidth = 8 * COL_PX;  // 约 160px
            if (dispW > maxWidth) {
              dispW = maxWidth;
            }

            // 生成高分辨率图片 Buffer
            const imageBuffer = await generateHighResImage(
              imgData.src,
              dispW,
              dispH
            );

            rowImages.push({
              buffer: new Uint8Array(imageBuffer),  // 转换为 Uint8Array，exceljs 需要
              dispW,
              dispH,
              gridX: imgData.gridX,
              gridY: imgData.gridY
            });

            console.log('[ExportExcelGrid] 图片处理完成:', {
              dispW,
              dispH,
              gridX: imgData.gridX,
              gridY: imgData.gridY
            });
          } catch (error) {
            console.error('[ExportExcelGrid] 处理图片失败:', imgData.assetId, error);
          }
        }
        if (rowImages.length > 0) {
          processedImages.push(rowImages);
        }
      }

      if (processedImages.length === 0) {
        alert('无法处理图片资源');
        setIsExporting(false);
        return;
      }

      // 7. 创建 Excel 工作簿
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Canvas_Grid');

      // 8. 设置行高和列宽（使用 Excel 默认值）
      for (let i = 1; i <= MAX_ROWS; i++) {
        worksheet.getRow(i).height = ROW_HEIGHT_PT;  // 15pt
      }
      for (let i = 1; i <= MAX_COLS; i++) {
        worksheet.getColumn(i).width = COL_WIDTH_CHAR;  // 8.43 字符
      }

      // 9. 插入图片
      let rowCursor = 1;  // Excel 行号从 1 开始
      
      for (let rowIndex = 0; rowIndex < processedImages.length; rowIndex++) {
        const row = processedImages[rowIndex];
        
        // 计算该行的起始行号
        const rowStart = rowCursor;
        let colCursor = 1;  // Excel 列号从 1 开始
        
        for (let colIndex = 0; colIndex < row.length; colIndex++) {
          const img = row[colIndex];
          
          // 计算图片占用的列数
          const colSpan = Math.ceil(img.dispW / COL_PX);
          
          // 插入图片
          const imageId = workbook.addImage({
            buffer: img.buffer,
            extension: 'png',
          });
          
          worksheet.addImage(imageId, {
            tl: { col: colCursor - 1, row: rowStart - 1 },  // ExcelJS 使用 0-based 索引
            ext: { width: img.dispW, height: img.dispH }
          });
          
          console.log('[ExportExcelGrid] 插入图片:', {
            row: rowStart,
            col: colCursor,
            width: img.dispW,
            height: img.dispH
          });
          
          // 更新列光标（图片占用的列数 + 间距）
          colCursor += colSpan + GAP_CELLS;
        }
        
        // 更新行光标（图片高度 + 纵向间距）
        rowCursor += IMG_H_CELLS + GAP_ROWS;
      }

      // 10. 创建 Meta Sheet（可选）
      const metaSheet = workbook.addWorksheet('Meta');
      metaSheet.addRow(['参数', '值']);
      metaSheet.addRow(['ROW_PX', ROW_PX]);
      metaSheet.addRow(['COL_PX', COL_PX]);
      metaSheet.addRow(['IMG_H_CELLS', IMG_H_CELLS]);
      metaSheet.addRow(['GAP_CELLS', GAP_CELLS]);
      metaSheet.addRow(['SCALE', SCALE]);
      metaSheet.addRow(['导出时间', new Date().toISOString()]);
      metaSheet.addRow(['图片数量', imageDataList.length]);

      // 11. 生成并下载文件
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Canvas_Grid_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      console.log('[ExportExcelGrid] Excel 文件已生成并下载');
      alert(`已导出 ${imageDataList.length} 张图片到 Excel 文件`);
    } catch (error) {
      console.error('[ExportExcelGrid] 导出失败:', error);
      alert('导出失败: ' + (error.message || '未知错误，请查看控制台'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={exportToExcel}
      disabled={isExporting || !editor || !hasSelectedImages}
      title={
        !editor
          ? "编辑器未就绪"
          : !hasSelectedImages 
            ? "请先选中至少一张图片" 
            : isExporting 
              ? "正在导出..." 
              : "导出为 Excel 文件（网格布局，4 格高，保持比例）"
      }
      style={{
        fontSize: 12,
        padding: "2px",
        border: "0.5px solid #dee2e6",
        borderRadius: 2,
        background: hasSelectedImages ? "#28a745" : "#6c757d",
        color: "white",
        cursor: (isExporting || !editor || !hasSelectedImages) ? "not-allowed" : "pointer",
        fontWeight: "bold",
        whiteSpace: "nowrap",
        width: 40,
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: (isExporting || !editor || !hasSelectedImages) ? 0.6 : 1
      }}
    >
      {isExporting ? (
        <div style={{
          width: 20,
          height: 20,
          border: "2px solid #ccc",
          borderTop: "2px solid #fff",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }} />
      ) : (
        <img 
          src={getIconPath('icons/export_excel_logo.jpg')} 
          alt="导出 Excel" 
          style={{ width: 32, height: 32, objectFit: 'contain' }} 
        />
      )}
    </button>
  );
}
