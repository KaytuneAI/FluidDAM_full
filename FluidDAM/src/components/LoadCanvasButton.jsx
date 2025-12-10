import React, { useRef, useState } from "react";
import { loadSnapshot, getSnapshot } from "tldraw";
import { checkExistingImageByContent } from '../utils/assetUtils.js';
import ExcelJS from 'exceljs';
import { toRichText } from 'tldraw';
import storageManager from '../utils/storageManager.js';
import SheetSelectionDialog from './SheetSelectionDialog.jsx';
import { mapExcelColorToTL } from '../utils/colorMapper.js';

export default function LoadCanvasButton({ editor, setIsLoading }) {
  const fileInputRef = useRef(null);
  const [showSheetDialog, setShowSheetDialog] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);

  // 检测是否有多个工作表导出
  const checkMultipleSheets = async (file) => {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file);
      
      const layoutSheet = workbook.getWorksheet('LayoutJson');
      if (!layoutSheet) {
        return { hasMultiple: false, sheets: [] };
      }

      const maxRow = layoutSheet.rowCount;
      const availableSheets = [];

      for (let row = 1; row <= maxRow; row++) {
        const cellValue = layoutSheet.getCell(row, 1).value;
        
        if (cellValue && typeof cellValue === 'string' && cellValue.length > 0) {
          if (cellValue.includes('"sheet":{') && cellValue.includes('"name":')) {
            try {
              const sheetName = extractSheetNameFromJson(cellValue);
              if (sheetName) {
                availableSheets.push({
                  name: sheetName,
                  row: row,
                  hasMultipleColumns: layoutSheet.getCell(row, 2).value && 
                                   layoutSheet.getCell(row, 2).value.length > 0
                });
              }
            } catch (parseError) {
              console.warn(`解析第${row}行JSON失败:`, parseError);
            }
          }
        }
      }

      return {
        hasMultiple: availableSheets.length > 1,
        sheets: availableSheets
      };
    } catch (error) {
      console.error('检测多工作表失败:', error);
      return { hasMultiple: false, sheets: [] };
    }
  };

  // 从JSON字符串中提取工作表名称
  const extractSheetNameFromJson = (jsonStr) => {
    try {
      const searchPattern = '"sheet":{"name":"';
      const startPos = jsonStr.indexOf(searchPattern);
      
      if (startPos > -1) {
        const nameStart = startPos + searchPattern.length;
        const nameEnd = jsonStr.indexOf('"', nameStart);
        
        if (nameEnd > nameStart) {
          return jsonStr.substring(nameStart, nameEnd);
        }
      }
      
      return null;
    } catch (error) {
      console.warn('提取工作表名称失败:', error);
      return null;
    }
  };

  // Excel处理函数
  const processExcelFile = async (file, selectedSheet = null) => {
    const loadingMessage = document.createElement('div');
    loadingMessage.textContent = '正在读取Excel文件中的LayoutJson...';
    loadingMessage.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8); color: white; padding: 20px; border-radius: 8px;
      z-index: 10000; font-family: Arial, sans-serif;
    `;
    document.body.appendChild(loadingMessage);

    try {
      console.log('开始读取Excel文件中的LayoutJson sheet...');
      
      // 1. 读取Excel文件
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file);
      
      console.log('找到LayoutJson sheet');
      console.log('工作簿调试信息:', {
        workbookName: workbook.name,
        sheetCount: workbook.worksheets.length,
        sheetNames: workbook.worksheets.map(ws => ws.name)
      });
      
      // 2. 找到LayoutJson sheet
      const layoutSheet = workbook.getWorksheet('LayoutJson');
      if (!layoutSheet) {
        throw new Error('未找到LayoutJson sheet');
      }
      
      // 3. 确定要读取的行
      let targetRow = 1; // 默认第一行
      if (selectedSheet) {
        targetRow = selectedSheet.row;
        console.log(`加载选中的工作表: ${selectedSheet.name} (第${targetRow}行)`);
      }
      
      // 4. 检查是否分割的JSON（横向扩展模式）
      let jsonContent = '';
      
      // 从指定行读取JSON
      const singleJson = layoutSheet.getCell(targetRow, 1).value;
      if (singleJson && singleJson.length > 0) {
        // 检查下一列是否有内容，如果有则说明是横向分割的JSON
        const secondChunk = layoutSheet.getCell(targetRow, 2).value;
        if (secondChunk && secondChunk.length > 0) {
          // 横向分割的JSON，需要重新组合
          console.log(`检测到第${targetRow}行横向分割的JSON`);
          
          // 横向读取：A{targetRow}, B{targetRow}, C{targetRow}...
          let columnIndex = 1;
          let chunk = layoutSheet.getCell(targetRow, columnIndex).value;
          
          while (chunk && chunk.length > 0) {
            jsonContent += chunk;
            columnIndex++;
            chunk = layoutSheet.getCell(targetRow, columnIndex).value;
          }
          
          console.log(`横向分割的JSON，总列数: ${columnIndex - 1}`);
        } else {
          // 单个JSON，直接从指定行读取
          jsonContent = singleJson;
        }
      }
      
      console.log('读取到JSON内容长度:', jsonContent.length);
      
      if (!jsonContent) {
        throw new Error(`LayoutJson sheet第${targetRow}行中没有找到有效数据`);
      }
      
      // 4. 解析JSON
      const layoutData = JSON.parse(jsonContent);
      console.log('成功解析布局数据:', layoutData);
      
      // 5. 清空当前画布
      const currentShapes = editor.getCurrentPageShapes();
      if (currentShapes.length > 0) {
        const shapeIds = currentShapes.map(shape => shape.id);
        editor.deleteShapes(shapeIds);
      }
      
      // 6. 设置页面名称为sheet名称
      if (layoutData.sheet && layoutData.sheet.name) {
        try {
          const currentPageId = editor.getCurrentPageId();
          editor.updatePage({
            id: currentPageId,
            name: layoutData.sheet.name
          });
          console.log(`页面名称已设置为: ${layoutData.sheet.name}`);
        } catch (error) {
          console.warn('设置页面名称失败:', error);
        }
      }
      
      // 7. 处理布局数据并创建形状
      await processLayoutData(layoutData, file);
      
      // 8. 触发自动保存，确保导入的内容被保存
      setTimeout(async () => {
        try {
          console.log('===== Excel导入完成后触发自动保存 =====');
          // 使用静态导入的 getSnapshot
          const canvasData = getSnapshot(editor.store);
          const currentPageId = editor.getCurrentPageId();
          const currentShapes = editor.getCurrentPageShapes();
          const imageShapes = currentShapes.filter(shape => shape.type === 'image');
          const viewport = editor.getViewportPageBounds();
          const camera = editor.getCamera();
          
          console.log('准备保存的数据:', {
            shapesCount: currentShapes.length,
            shapes: currentShapes.map(s => ({ id: s.id, type: s.type })),
            imageCount: imageShapes.length
          });
          
          // 检查快照中的形状
          if (canvasData && canvasData.store) {
            const shapesInSnapshot = Object.keys(canvasData.store).filter(key => 
              key.startsWith('shape:') && !key.includes('pointer')
            );
            console.log('快照中的形状数量:', shapesInSnapshot.length);
          }
          
          const autoSaveData = {
            canvasData,
            currentPageId,
            imageInfo: imageShapes.map(shape => ({ shapeId: shape.id })),
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
            source: 'excel-import' // 标记数据来源
          };
          
              // 使用智能存储管理器保存（支持 IndexedDB 大容量）
              const result = await storageManager.saveCanvas(autoSaveData);
              
              if (result.success) {
                console.log(`✅ Excel导入后自动保存完成 (${result.method}, ${result.size}MB)，形状数量:`, currentShapes.length);
                console.log('=====================================');
              } else {
                console.error('❌ Excel导入后自动保存失败:', result.error);
                if (parseFloat(result.size) > 10) {
                  alert(`Excel 数据太大 (${result.size}MB)，无法自动保存。\n刷新后将无法恢复，请使用"保存画布"按钮手动保存为文件。`);
                }
              }
        } catch (saveError) {
          console.error('❌ Excel导入后自动保存失败:', saveError);
        }
      }, 1500); // 增加等待时间到 1.5 秒
      
      // 9. 移除加载提示
      document.body.removeChild(loadingMessage);
      console.log('Excel LayoutJson重构测试完成！');
      
    } catch (error) {
      document.body.removeChild(loadingMessage);
      console.error('处理Excel文件失败:', error);
      alert('处理Excel文件失败: ' + error.message);
    }
  };

  // 处理布局数据的函数
  // 判断是否绘制背景矩形的函数
  const hasVisibleFill = (hex) => {
    if (!hex || hex === 'none') return false;
    const c = hex.replace('#', '');
    if (c.length !== 6) return true;
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    // 白色或接近白的颜色不画背景
    return !(r > 245 && g > 245 && b > 245);
  };

  const processLayoutData = async (layoutData, file) => {
    // 开始处理布局数据
    
    // 1. 设置画布尺寸（如果需要）
    if (layoutData.sheet && layoutData.sheet.sizePx) {
      // 画布尺寸已设置
    }
    
    // 2. 创建所有元素的统一列表并按Z-order排序
    const allElements = [];
    
    // 添加文本框
    if (layoutData.sheet && layoutData.sheet.textboxes) {
      for (const textbox of layoutData.sheet.textboxes) {
        allElements.push({
          type: 'textbox',
          data: textbox,
          z: textbox.z
        });
      }
    }
    
    // 添加图片
    if (layoutData.sheet && layoutData.sheet.images) {
      for (const image of layoutData.sheet.images) {
        allElements.push({
          type: 'image',
          data: image,
          z: image.z
        });
      }
    }
    
    // 按Z-order排序，Z值小的先创建（在底层）
    const sortedElements = allElements.sort((a, b) => a.z - b.z);
    
    // 3. 首先提取图片数据
    let extractedImages = [];
    if (layoutData.sheet && layoutData.sheet.images && layoutData.sheet.images.length > 0) {
      try {
        console.log('提取图片数据...');
        const { importExcelToTLDraw } = await import('../utils/excelUtils.js');
        const tempResult = await importExcelToTLDraw(file, null, { extractOnly: true });

        if (tempResult.success && tempResult.data && tempResult.data.images) {
          extractedImages = tempResult.data.images;
          console.log('从importExcelToTLDraw提取到图片:', extractedImages.length);
        } else {
          // 找到原始工作表来提取图片
          const originalSheetName = layoutData.sheet.name;
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(file);
          const originalSheet = workbook.getWorksheet(originalSheetName);
          
          if (originalSheet) {
            console.log('找到原始工作表:', originalSheetName);
            const { ExcelToTLDrawConverter } = await import('../utils/excelConverter.js');
            const converter = new ExcelToTLDrawConverter(null);
            const images = await converter.extractImages(originalSheet);
            extractedImages = images;
            console.log('从ExcelToTLDrawConverter提取到图片:', extractedImages.length);
          } else {
            console.warn('未找到原始工作表:', originalSheetName);
          }
        }
      } catch (error) {
        console.warn('图片提取失败:', error);
      }
    }

    // 统一的 contain-fit：等比包含 + 居中；无向上放大；对极端比例做微补偿
    function computeContainFit(x, y, wCell, hCell, wNat, hNat, paddingPx = 2) {
      // --- 1) 动态 padding：避免紧贴容器边缘引发"被切一刀"的错觉 ---
      const containerArea = wCell * hCell;
      const basePadding = Math.max(2, Math.min(8, Math.sqrt(containerArea) / 50));
      const ratio = wNat / hNat;
      const isTooWide = ratio > 3;       // 超宽（例如 3:1 以上）
      const isTooTall = ratio < 1 / 3;   // 超高（例如 1:3 以上）
      const aspectFactor = (isTooWide || isTooTall) ? 1.4 : 1.0;
      const pad = Math.round(Math.max(paddingPx, basePadding * aspectFactor));

      const innerW = Math.max(0, wCell - pad * 2);
      const innerH = Math.max(0, hCell - pad * 2);

      // --- 2) 计算 contain 缩放：禁止任何"额外放大" ---
      // 重要：不要再乘以 renderSafetyMargin (>1)；那会把图像变成 cover 效果！
      const s = Math.min(innerW / wNat, innerH / hNat);

      // --- 3) 尺寸取整策略：w/h 用 floor，避免 1px 溢出导致被 mask 裁切 ---
      let wImg = Math.max(1, Math.floor(wNat * s));
      let hImg = Math.max(1, Math.floor(hNat * s));

      // --- 4) 极端比例微补偿（只做"减小"，绝不放大），防止边缘抗锯齿误差 ---
      if (isTooWide) {
        wImg = Math.max(1, wImg - Math.max(1, Math.round(wCell * 0.002))); // 减 0.2% 宽
      }
      if (isTooTall) {
        hImg = Math.max(1, hImg - Math.max(1, Math.round(hCell * 0.002))); // 减 0.2% 高
      }

      // --- 5) 居中定位：x/y 用 round（防亚像素锯齿）；并确保不为负 ---
      const xImg = Math.max(x, Math.round(x + (wCell - wImg) / 2));
      const yImg = Math.max(y, Math.round(y + (hCell - hImg) / 2));

      // 调试输出（可保留，便于定位问题）
      console.log(
        `🧩 contain-fit: 容器${wCell}×${hCell}, 原图${wNat}×${hNat}, 比例=${ratio.toFixed(3)}, pad=${pad}, ` +
        `绘制=${wImg}×${hImg}, 位置=(${xImg},${yImg})`
      );

      return { x: xImg, y: yImg, w: wImg, h: hImg };
    }

    // 提取图片创建函数
    async function createImageShape(editor, imageInfo, imageData) {
      // 检查是否已存在相同的图片（跨页面检测）
      // 使用静态导入的 checkExistingImageByContent
      let assetId = await checkExistingImageByContent(editor, imageData.url);
      
      if (!assetId) {
        // 创建新的图片资产
        assetId = `asset:${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}`;
        
        // 预加载图片获取真实尺寸
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imageData.url;
        });

        const naturalW = img.naturalWidth || imageInfo.width;
        const naturalH = img.naturalHeight || imageInfo.height;
        
        
        // 保存原始尺寸信息到imageData中，供后续contain-fit计算使用
        imageData.naturalWidth = naturalW;
        imageData.naturalHeight = naturalH;

        // 创建资产 - 使用原始尺寸
        editor.createAssets([
          {
            id: assetId,
            type: "image",
            typeName: "asset",
            meta: {},
            props: {
              w: naturalW,
              h: naturalH,
              src: imageData.url,
              name: imageInfo.name,
              mimeType: imageData.mimeType || 'image/png',
              isAnimated: false
            }
          }
        ]);
        
        // 创建新图片资产
      } else {
        // 重用现有图片资产
      }

      // 创建图片形状 - 使用contain-fit模式确保完整显示
      // 确保assetId有正确的前缀
      const normalizedAssetId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
      
      // 获取图片的原始尺寸（从asset创建时获取的naturalWidth/naturalHeight）
      const naturalW = imageData.naturalWidth || imageInfo.width;
      const naturalH = imageData.naturalHeight || imageInfo.height;
      
      
      // === REPLACE: 使用 contain-fit 计算最终 x/y/w/h ===
      const { x, y, w, h } = computeContainFit(
        imageInfo.left,
        imageInfo.top,
        imageInfo.width,
        imageInfo.height,
        naturalW,      // 注意：是预加载得到的 natural 宽
        naturalH,      //       与上面 natural 高
        2              // 基础 padding，可按需 2~6
      );
      
      
      const imageShape = {
        type: 'image',
        x,
        y,
        props: {
          w,
          h,
          assetId: normalizedAssetId,
          // 显式清空历史裁剪（若之前曾使用过 crop）
          crop: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } },
        },
      };
      
      editor.createShape(imageShape);
      // 图片形状创建完成
    }

    // 4. 首先创建所有单元格背景色（最底层，Z-order = -1000）
    console.log('🔍 检查layoutData结构:', {
      hasSheet: !!layoutData.sheet,
      hasCells: !!(layoutData.sheet && layoutData.sheet.cells),
      cellsLength: layoutData.sheet?.cells?.length || 0,
      layoutDataKeys: Object.keys(layoutData)
    });
    
    if (layoutData.sheet && layoutData.sheet.cells) {
      console.log('开始创建单元格背景色（最底层）:', layoutData.sheet.cells.length);
      
      for (const cell of layoutData.sheet.cells) {
        try {
          // 验证并设置默认值
          const x = typeof cell.x === 'number' ? cell.x : 0;
          const y = typeof cell.y === 'number' ? cell.y : 0;
          const w = typeof cell.w === 'number' && cell.w > 0 ? cell.w : 50; // 默认宽度50
          const h = typeof cell.h === 'number' && cell.h > 0 ? cell.h : 20; // 默认高度20
          
          // 使用新的颜色映射函数
          const tlColor = mapExcelColorToTL(cell.fillColor, {
            forceVeryLightToGrey: false,  // 白色保持白色
            lightnessAsWhite: 0.94,       // 提高白阈值，RGB(240,240,240)以上为白色
            lightnessAsBlack: 0.12,       // 黑阈值
            minSaturation: 0.18,          // 低饱和阈值
          });

          // 白色保持白色
          const finalColor = tlColor;
          
          // 调试信息：显示单元格颜色映射结果
          
          // 创建单元格背景色（最底层，Z-order = -1000）
          // 使用hasVisibleFill函数判断是否绘制背景矩形
          if (hasVisibleFill(finalColor) && (cell.isRepresentative ?? true)) {
            const inset = 0.5; // 1px内缩，防止描边压线
            
            // 检查是否有边框
            const hasBorder = cell.hasBorder === true;
            
            // 检查是否为纯背景色格子（没有文字）
            const hasText = cell.v && cell.v.trim() !== '';
            const isPureBackgroundCell = !hasText;
            
            const cellBackgroundShape = {
              type: 'geo',
              x: x + inset, // 使用验证后的X坐标 + 内缩
              y: y + inset, // 使用验证后的Y坐标 + 内缩
              props: {
                geo: 'rectangle',
                w: Math.max(0, w - inset * 2), // 宽度减去内缩
                h: Math.max(0, h - inset * 2), // 高度减去内缩
                fill: 'solid',
                color: finalColor, // 使用映射后的颜色
                dash: 'solid',
                size: 's' // 细线条
              }
            };
            editor.createShape(cellBackgroundShape);
            
          }
          
        } catch (error) {
          console.warn('创建单元格背景失败:', cell, error);
        }
      }
    }
    
    // 4.5. 处理VBA输出的边框数组（优化版：避免重复边框）
    if (layoutData.sheet && layoutData.sheet.borders && layoutData.sheet.borders.length > 0) {
      // 策略：只画每个单元格的右边和下边，避免相邻单元格的边框重叠
      // 第一行需要画上边，第一列需要画左边
      
      // 找出最小的row和col来判断是否是第一行/列
      let minRow = Infinity, minCol = Infinity;
      layoutData.sheet.borders.forEach(item => {
        if (item.row < minRow) minRow = item.row;
        if (item.col < minCol) minCol = item.col;
      });
      
      for (const borderItem of layoutData.sheet.borders) {
        try {
          const x = typeof borderItem.x === 'number' ? borderItem.x : 0;
          const y = typeof borderItem.y === 'number' ? borderItem.y : 0;
          const w = typeof borderItem.width === 'number' && borderItem.width > 0 ? borderItem.width : 50;
          const h = typeof borderItem.height === 'number' && borderItem.height > 0 ? borderItem.height : 20;
          
          if (borderItem.borders) {
            const { top, right, bottom, left } = borderItem.borders;
            const isFirstRow = borderItem.row === minRow;
            const isFirstCol = borderItem.col === minCol;
            
            // 第一行：画上边
            if (isFirstRow && top) {
              editor.createShape({
                type: 'geo',
                x: x,
                y: y,
                props: {
                  geo: 'rectangle',
                  w: w,
                  h: 0.5,
                  fill: 'solid',
                  color: 'grey',
                  dash: 'solid',
                  size: 's'
                }
              });
            }
            
            // 第一列：画左边
            if (isFirstCol && left) {
              editor.createShape({
                type: 'geo',
                x: x,
                y: y,
                props: {
                  geo: 'rectangle',
                  w: 0.5,
                  h: h,
                  fill: 'solid',
                  color: 'grey',
                  dash: 'solid',
                  size: 's'
                }
              });
            }
            
            // 所有单元格：画右边和下边
            if (right) {
              editor.createShape({
                type: 'geo',
                x: x + w - 0.5,
                y: y,
                props: {
                  geo: 'rectangle',
                  w: 0.5,
                  h: h,
                  fill: 'solid',
                  color: 'grey',
                  dash: 'solid',
                  size: 's'
                }
              });
            }
            
            if (bottom) {
              editor.createShape({
                type: 'geo',
                x: x,
                y: y + h - 0.5,
                props: {
                  geo: 'rectangle',
                  w: w,
                  h: 0.5,
                  fill: 'solid',
                  color: 'grey',
                  dash: 'solid',
                  size: 's'
                }
              });
            }
          }
        } catch (error) {
          console.warn('创建边框失败:', borderItem, error);
        }
      }
    }
    
    // 5. 按Z-order顺序创建图片和文本框（保持原有Z-order）
    
    for (const element of sortedElements) {
      try {
        if (element.type === 'textbox') {
          // 创建文本框
          const textbox = element.data;
          
          // 检查是否有真正的边框或填充
          const hasBorder = textbox.border && textbox.border.style !== 'none';
          const hasFill = textbox.fill && 
                         textbox.fill.color && 
                         textbox.fill.color !== '#FFFFFF' && 
                         textbox.fill.opacity > 0;
          
          if (hasBorder || hasFill) {
            // 创建带边框和填充的背景矩形
            const backgroundShape = {
              type: 'geo',
              x: textbox.left,
              y: textbox.top,
              props: {
                geo: 'rectangle',
                w: textbox.width,
                h: textbox.height,
                fill: hasFill ? 'solid' : 'none',
                color: hasFill ? mapExcelColorToTL(textbox.fill.color, {
                  forceVeryLightToGrey: false,  // 白色保持白色
                  lightnessAsWhite: 0.94,       // 提高白阈值，RGB(240,240,240)以上为白色
                  lightnessAsBlack: 0.12,
                  minSaturation: 0.18,
                }) : 'black',
                ...(hasBorder && {
                  dash: mapBorderStyle(textbox.border.style),
                  size: 's'  // 强制设置为最细边框
                })
              }
            };
            
            editor.createShape(backgroundShape);
            // 文本框背景创建完成
          }
          
          // 创建文字内容
          const padding = 6; // 增加内边距，确保文字不贴边
          const textWidth = Math.max(textbox.width - (padding * 2), 20);
          
          // 处理文本格式 - 使用最小字体（TLDraw不支持复杂富媒体）
          let mainFont, mainSize, mainColor;
          let hasRichFormatting = false;
          
          // 检查是否有富媒体格式信息
          if (textbox.richTextFormatting && textbox.richTextFormatting.length > 0) {
            hasRichFormatting = true;
            
            // 找到最小的字体大小
            let minFontSize = Infinity;
            let minFormat = null;
            
            textbox.richTextFormatting.forEach((format, index) => {
              if (format.fontSize < minFontSize) {
                minFontSize = format.fontSize;
                minFormat = format;
              }
            });
            
            if (minFormat) {
              mainFont = mapExcelFontToTL(minFormat.fontName);
              mainSize = mapPtToTLSize(minFormat.fontSize);
              mainColor = normalizeTextColor(minFormat.color);
              
              console.log('📏 使用最小字体:', {
                fontName: minFormat.fontName,
                fontSize: minFormat.fontSize,
                color: minFormat.color
              });
            }
            
            // 输出富媒体格式信息供调试
            console.log('📋 富媒体格式详情:');
            textbox.richTextFormatting.forEach((format, index) => {
              const segment = textbox.text.substring(format.start, format.end + 1);
              const isMinSize = format.fontSize === minFontSize;
            });
          } else {
            // 没有富媒体格式，使用默认格式
            const excelFontName = textbox.style?.fontName || textbox.fontName || (textbox.font && textbox.font.name);
            const excelFontSizePt = textbox.style?.fontSize || textbox.fontSize || (textbox.font && textbox.font.size);
            const excelColorHex = textbox.style?.color || (textbox.font && textbox.font.color) || textbox.color;
            
            mainFont = mapExcelFontToTL(excelFontName);
            mainSize = mapPtToTLSize(excelFontSizePt);
            mainColor = normalizeTextColor(excelColorHex);
          }

          const textShape = {
            type: 'text',
            x: textbox.left + padding,
            y: textbox.top + padding,
            props: {
              richText: toRichText(textbox.text),
              w: textWidth,
              autoSize: false,
              font: mainFont,
              size: mainSize,
              color: mainColor
            }
          };
          
          
          editor.createShape(textShape);
          // 文本框创建完成
          
        } else if (element.type === 'image') {
          // 创建图片
          const imageInfo = element.data;
          let imageData = null;
          
          // 尝试匹配图片数据（仅用于获取Base64数据，不使用坐标）
          if (extractedImages.length > 0) {
            // 简单的索引匹配
            const imageIndex = layoutData.sheet.images.indexOf(imageInfo);
            if (imageIndex >= 0 && imageIndex < extractedImages.length) {
              imageData = extractedImages[imageIndex];
              console.log('图片数据匹配:', {
                vba坐标: { x: imageInfo.left, y: imageInfo.top },
                提取坐标: { x: imageData.x, y: imageData.y },
                说明: '仅使用提取的Base64数据，坐标完全以VBA为准'
              });
            }
          }
          
          // 检查是否启用懒加载
          const enableLazyLoading = false; // 禁用懒加载，避免API错误
          if (enableLazyLoading && imageData && imageData.url) {
            // 使用懒加载
            const { getLazyLoadingManager } = await import('../utils/lazyLoading.js');
            const lazyManager = getLazyLoadingManager(editor);
            
            // 设置加载回调
            lazyManager.setLoadCallback(async (imageId, imageData) => {
              await createImageShape(editor, imageInfo, imageData);
            });
            
            // 添加待加载图片
            const imageId = `lazy_${imageInfo.name}_${Date.now()}`;
            const imageDataWithPosition = {
              ...imageData,
              x: imageInfo.left,
              y: imageInfo.top,
              width: imageInfo.width,
              height: imageInfo.height
            };
            
            lazyManager.addPendingImage(imageId, imageDataWithPosition);
            console.log('🔄 图片已加入懒加载队列:', imageInfo.name);
            continue; // 跳过立即创建
          }
          
          if (imageData && imageData.url) {
            // 使用提取的图片创建函数
            await createImageShape(editor, imageInfo, imageData);
          } else {
            // 创建占位符 - 直接使用VBA提供的精确坐标
            const placeholderShape = {
              type: 'geo',
              x: imageInfo.left,  // 直接使用VBA的精确坐标
              y: imageInfo.top,   // 直接使用VBA的精确坐标
              props: {
                geo: 'rectangle',
                w: imageInfo.width,  // 直接使用VBA的精确宽度
                h: imageInfo.height, // 直接使用VBA的精确高度
                fill: 'none',
                color: 'grey',
                dash: 'dashed'
              }
            };
            
            editor.createShape(placeholderShape);
            // 图片占位符创建完成
          }
        }
      } catch (error) {
        console.warn('创建元素失败:', element.data.name, error);
      }
    }
    
    // 6. 最后创建单元格文本（按Z-order顺序，但确保在单元格底色之上）
    if (layoutData.sheet && layoutData.sheet.cells) {
      
      for (const cell of layoutData.sheet.cells) {
        try {
          // 验证并设置默认值
          const x = typeof cell.x === 'number' ? cell.x : 0;
          const y = typeof cell.y === 'number' ? cell.y : 0;
          const w = typeof cell.w === 'number' && cell.w > 0 ? cell.w : 50; // 默认宽度50
          const h = typeof cell.h === 'number' && cell.h > 0 ? cell.h : 20; // 默认高度20
          
          // 如果有内容，添加文本
          if (cell.v && cell.v.trim()) {
            // 如果 JSON 里也记录了 cell 的字体与字号，就取；没有则给合理默认
            const cellFontName = cell.fontName || (cell.font && cell.font.name) || 'Microsoft YaHei';
            const cellFontSize = cell.fontSize || (cell.font && cell.font.size) || 11;
            const cellColorHex = (cell.font && cell.font.color) || '#000000';
            let cellHAlign = cell.hAlign || cell.align || 'left';
            const cellVAlign = cell.vAlign || 'top';
            
            // 处理Excel的'general'对齐方式
            if (cellHAlign === 'general') {
              cellHAlign = 'left'; // general通常当作左对齐处理
            }

            // 调试信息：显示单元格字体映射结果

            // 使用精准对齐函数创建文本
            await placeTextWithAlignment(editor, {
              cellX: x, 
              cellY: y, 
              cellW: w, 
              cellH: h,
              text: cell.v,
              font: mapExcelFontToTL(cellFontName),
              size: mapPtToTLSize(cellFontSize),
              color: normalizeTextColor(cell.fontColor || cellColorHex),  // 优先使用导出的字体颜色，并转换为TLDraw支持的颜色
              hAlign: cellHAlign || 'left',     // 'left' | 'center' | 'right'
              vAlign: cellVAlign || 'top',      // 'top' | 'middle' | 'bottom'
              padding: 4,
            });
          }
          
          // 单元格文本创建完成
        } catch (error) {
          console.warn('创建单元格文本失败:', cell, error);
        }
      }
    }
    
    // 7. 为合并单元格创建边框（VBA的borders数组可能没有包含合并单元格的完整边框）
    console.log('🔍 检查是否应该创建合并单元格边框:', {
      hasSheet: !!layoutData.sheet,
      hasCells: !!(layoutData.sheet && layoutData.sheet.cells),
      cellsLength: layoutData.sheet?.cells?.length || 0
    });
    
    if (layoutData.sheet && layoutData.sheet.cells) {
      console.log('开始为合并单元格创建边框');
      
      // 统计合并单元格数量
      let mergedCellCount = 0;
      for (const cell of layoutData.sheet.cells) {
        if (cell.isMerged && cell.mergeArea) {
          mergedCellCount++;
        }
      }
      console.log('🔍 找到合并单元格数量:', mergedCellCount);
      
      // 收集所有合并单元格的边框信息
      const mergedCellBorders = new Map();
      
      for (const cell of layoutData.sheet.cells) {
        try {
          // 检查是否是合并单元格的代表单元格
          if (cell.isMerged && cell.mergeArea) {
            const mergeKey = `${cell.mergeArea}`;
            
            if (!mergedCellBorders.has(mergeKey)) {
              // 检查VBA的borders数组中是否包含这个合并单元格的边框
              let hasBorderInVBA = false;
              if (layoutData.sheet.borders) {
                for (const borderItem of layoutData.sheet.borders) {
                  // 检查borders数组中是否有这个合并单元格的边框
                  // 需要检查合并单元格的每个单元格是否在borders数组中
                  const mergeCells = mergeKey.split(':');
                  const startCell = mergeCells[0]; // 如 $B$2
                  const endCell = mergeCells[1];   // 如 $B$3
                  
                  if (borderItem.address && 
                      (borderItem.address.includes(startCell) || 
                       borderItem.address.includes(endCell) ||
                       borderItem.address === mergeKey)) {
                    hasBorderInVBA = true;
                    console.log('✅ 在VBA borders中找到合并单元格边框:', {
                      mergeKey,
                      borderAddress: borderItem.address,
                      borderPosition: { x: borderItem.x, y: borderItem.y, w: borderItem.width, h: borderItem.height }
                    });
                    break;
                  }
                }
              }
              
              // 如果没有在VBA borders中找到，记录调试信息
              if (!hasBorderInVBA) {
                console.log('⚠️ VBA borders中未找到合并单元格边框:', {
                  mergeKey,
                  bordersCount: layoutData.sheet.borders?.length || 0
                });
              }
              
              mergedCellBorders.set(mergeKey, {
                x: cell.x,
                y: cell.y,
                w: cell.w,
                h: cell.h,
                hasBorder: hasBorderInVBA // 只有VBA检测到边框的合并单元格才创建边框
              });
              
              console.log('🔍 合并单元格边框检测:', {
                mergeKey,
                hasBorderInVBA,
                position: { x: cell.x, y: cell.y, w: cell.w, h: cell.h }
              });
            }
          }
        } catch (error) {
          console.warn('处理合并单元格边框失败:', cell, error);
        }
      }
      
      // 为每个合并单元格创建边框
      for (const [mergeKey, borderInfo] of mergedCellBorders) {
        try {
          if (borderInfo.hasBorder) {
            // 创建合并单元格的边框矩形
            const mergedCellBorderShape = {
              type: 'geo',
              x: borderInfo.x,
              y: borderInfo.y,
              props: {
                geo: 'rectangle',
                w: borderInfo.w,
                h: borderInfo.h,
                fill: 'none',
                color: 'grey', // 使用灰色，看起来更细
                dash: 'solid',
                size: 's' // 细线条
              }
            };
            
            editor.createShape(mergedCellBorderShape);
            
            console.log('✅ 创建合并单元格边框:', {
              mergeKey,
              position: { x: borderInfo.x, y: borderInfo.y, w: borderInfo.w, h: borderInfo.h }
            });
          }
        } catch (error) {
          console.warn('创建合并单元格边框失败:', mergeKey, error);
        }
      }
    }
    
    console.log('布局数据处理完成');
  };


  const loadCanvas = async (file) => {
    if (!editor) {
      return;
    }

    // 显示加载提示
    const loadingMessage = document.createElement('div');
    
    try {
      console.log('开始加载画布...');
      loadingMessage.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 20px;
        border-radius: 8px;
        z-index: 3000;
        font-size: 16px;
      `;
      loadingMessage.textContent = '正在加载画布...';
      document.body.appendChild(loadingMessage);
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const saveData = JSON.parse(e.target.result);
          
          // 1. 重置当前画布 - 使用更安全的方法
          try {
            // 尝试删除所有形状而不是清空store
            const currentShapes = editor.getCurrentPageShapes();
            if (currentShapes.length > 0) {
              const shapeIds = currentShapes.map(shape => shape.id);
              try {
                editor.deleteShapes(shapeIds);
              } catch (deleteError) {
                // 备用方案：逐个删除
                for (const shapeId of shapeIds) {
                  try {
                    editor.deleteShapes([shapeId]);
                  } catch (singleDeleteError) {
                    // 删除单个形状失败，静默处理
                  }
                }
              }
            }
            
            // 等待删除操作完成
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (clearError) {
            // 清空画布时出错，静默处理
          }
          
          // 2. 直接使用loadSnapshot加载完整状态
          if (saveData.canvasData) {
            try {
              // Tldraw v3: 使用loadSnapshot加载完整状态
              try {
                loadSnapshot(editor.store, saveData.canvasData);
                
                // 标记为加载状态，触发组件完全重新渲染
                setIsLoading(true);
                
                // 延迟重新渲染，确保加载完成
                setTimeout(() => {
                  setIsLoading(false);
                }, 500);
                
              } catch (error) {
                // 加载画布状态时出错，静默处理
              }
              
              // 等待加载完成
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
              // 加载画布状态时出错，静默处理
            }
          }
          
          // 3. 检查加载结果
          const loadedShapes = editor.getCurrentPageShapes();
          const imageShapes = loadedShapes.filter(shape => shape.type === 'image');
          
          // 4. 更新localStorage中的图片ID列表
          if (saveData.imageInfo) {
            const currentImageIds = saveData.imageInfo.map(img => img.shapeId);
            localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
          }
          
          // 4.5 触发自动保存，确保加载的内容被保存
          setTimeout(async () => {
            try {
              console.log('===== 加载完成后触发自动保存 =====');
              // 使用静态导入的 getSnapshot
              const canvasData = getSnapshot(editor.store);
              const currentPageId = editor.getCurrentPageId();
              const currentShapes = editor.getCurrentPageShapes();
              const imageShapes = currentShapes.filter(shape => shape.type === 'image');
              const viewport = editor.getViewportPageBounds();
              const camera = editor.getCamera();
              
              console.log('准备保存的数据:', {
                shapesCount: currentShapes.length,
                shapes: currentShapes.map(s => ({ id: s.id, type: s.type })),
                imageCount: imageShapes.length
              });
              
              // 检查快照中的形状
              if (canvasData && canvasData.store) {
                const shapesInSnapshot = Object.keys(canvasData.store).filter(key => 
                  key.startsWith('shape:') && !key.includes('pointer')
                );
                console.log('快照中的形状数量:', shapesInSnapshot.length);
              }
              
              const autoSaveData = {
                canvasData,
                currentPageId,
                imageInfo: imageShapes.map(shape => ({ shapeId: shape.id })),
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
                source: 'json-load' // 标记数据来源
              };
              
              // 使用智能存储管理器保存（支持 IndexedDB 大容量）
              const result = await storageManager.saveCanvas(autoSaveData);
              
              if (result.success) {
                console.log(`✅ JSON加载后自动保存完成 (${result.method}, ${result.size}MB)，形状数量:`, currentShapes.length);
                console.log('=====================================');
              } else {
                console.error('❌ JSON加载后自动保存失败:', result.error);
                if (parseFloat(result.size) > 10) {
                  alert(`画布数据太大 (${result.size}MB)，无法自动保存。\n刷新后将无法恢复，请使用"保存画布"按钮手动保存为文件。`);
                }
              }
            } catch (saveError) {
              console.error('❌ 加载后自动保存失败:', saveError);
            }
          }, 1500); // 增加等待时间到 1.5 秒
          
          // 5. 恢复保存的页面状态
          if (saveData.currentPageId) {
            try {
              console.log('尝试恢复到页面:', saveData.currentPageId);
              
              // 检查页面是否存在
              const allPages = editor.getPages();
              const targetPage = allPages.find(page => page.id === saveData.currentPageId);
              console.log('目标页面是否存在:', !!targetPage);
              
              if (targetPage) {
                // 等待一下确保画布完全加载
                setTimeout(() => {
                  try {
                    editor.setCurrentPage(saveData.currentPageId);
                    console.log('已恢复到页面:', saveData.currentPageId);
                    
                    // 验证是否真的切换了
                    setTimeout(() => {
                      const newCurrentPage = editor.getCurrentPage();
                      console.log('切换后的当前页面:', newCurrentPage.name, newCurrentPage.id);
                      
                      // 强制刷新UI
                      try {
                        editor.updateViewportPageBounds();
                      } catch (e) {
                        // 如果方法不存在，静默处理
                      }
                      console.log('已强制刷新UI');
                    }, 50);
                  } catch (error) {
                    console.warn('恢复页面状态时出错:', error);
                    console.log('错误详情:', error.message);
                  }
                }, 200); // 增加等待时间
              } else {
                console.warn('目标页面不存在:', saveData.currentPageId);
              }
            } catch (error) {
              console.warn('恢复页面状态时出错:', error);
              console.log('错误详情:', error.message);
            }
          } else {
            console.log('保存数据中没有currentPageId');
          }
          
          // 6. 加载完成，组件将自动重新渲染
          // 移除加载提示
          document.body.removeChild(loadingMessage);
          
        } catch (error) {
          document.body.removeChild(loadingMessage);
          alert('加载失败：文件格式错误');
        }
      };
      
      reader.onerror = (error) => {
        document.body.removeChild(loadingMessage);
        alert('加载失败：无法读取文件');
      };
      
      reader.readAsText(file);
      
    } catch (error) {
      if (document.body.contains(loadingMessage)) {
        document.body.removeChild(loadingMessage);
      }
      alert('加载失败，请重试');
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (file) {
      // 检测文件类型，分别处理
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        console.log('检测到JSON文件，使用JSON画布加载逻辑');
        loadCanvas(file);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                 file.type === 'application/vnd.ms-excel' || 
                 file.name.endsWith('.xlsx') || 
                 file.name.endsWith('.xls')) {
        console.log('检测到Excel文件，使用Excel布局重构逻辑');
        
        // 检查是否有多个工作表导出
        const sheetInfo = await checkMultipleSheets(file);
        
        if (sheetInfo.hasMultiple) {
          // 显示工作表选择对话框
          setCurrentFile(file);
          setShowSheetDialog(true);
        } else if (sheetInfo.sheets.length === 1) {
          // 只有一个工作表，直接加载
          processExcelFile(file, sheetInfo.sheets[0]);
        } else {
          // 没有找到有效的工作表数据
          alert('LayoutJson工作表中没有找到有效的导出数据');
        }
      } else {
        alert('请选择有效的JSON或Excel文件');
      }
    }
    // 清空input值，允许重复选择同一文件
    event.target.value = '';
  };

  const openFileDialog = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // 处理工作表选择
  const handleSheetSelect = (selectedSheet) => {
    setShowSheetDialog(false);
    processExcelFile(currentFile, selectedSheet);
  };

  // 取消工作表选择
  const handleSheetCancel = () => {
    setShowSheetDialog(false);
    setCurrentFile(null);
  };

  return (
    <>
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.xlsx,.xls"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      
      {/* 加载画布按钮 */}
        <button
          onClick={openFileDialog}
         title="加载画布(JSON)或Excel布局重构"
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
           justifyContent: "center"
         }}
        >
          <img src={`${import.meta.env.BASE_URL || ''}icons/load_canvas.png`} alt="加载画布" style={{width: 32, height: 32}} />
        </button>
        

      {/* 工作表选择对话框 */}
      {showSheetDialog && currentFile && (
        <SheetSelectionDialog
          file={currentFile}
          onSheetSelect={handleSheetSelect}
          onCancel={handleSheetCancel}
        />
      )}
    </>
  );
}

// 辅助函数：颜色映射
const mapColorToTLDraw = (hexColor) => {
  if (!hexColor || !hexColor.startsWith('#')) return 'black';
  
  const hex = hexColor.replace('#', '');
  if (hex.length === 6) {
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // 根据RGB值映射到TLDraw支持的颜色
    if (r > 200 && g < 100 && b < 100) return 'red';
    if (r < 100 && g > 200 && b < 100) return 'green';
    if (r < 100 && g < 100 && b > 200) return 'blue';
    if (r > 200 && g > 200 && b < 100) return 'yellow';
    if (r > 200 && g < 100 && b > 200) return 'violet';
    if (r > 200 && g > 200 && b > 200) return 'white';
    if (r < 100 && g < 100 && b < 100) return 'black';
  }
  
  // 默认返回黑色
  return 'black';
};

// 辅助函数：边框样式映射
const mapBorderStyle = (style) => {
  switch (style) {
    case 'solid': return 'solid';
    case 'dashed': return 'dashed';
    case 'dotted': return 'dotted';
    case 'dashDot': return 'dashed';
    case 'dashDotDot': return 'dashed';
    default: return 'solid';
  }
};

// 将 Excel 字体名粗略映射到 TLDraw 允许的四类字体：'sans' | 'serif' | 'mono' | 'draw'
function mapExcelFontToTL(fontName = '') {
  const f = (fontName || '').toLowerCase();
  if (!f) return 'sans';
  // 常见西文字体
  if (f.includes('consola') || f.includes('mono') || f.includes('courier') || f.includes('等宽')) return 'mono';
  if (f.includes('times') || f.includes('georgia') || f.includes('garamond') || f.includes('serif')) return 'serif';
  // 常见无衬线（Windows/Office/中文环境）
  if (f.includes('arial') || f.includes('helvetica') || f.includes('calibri') || f.includes('segoe') ||
      f.includes('microsoft yahei') || f.includes('yahei') || f.includes('微软雅黑') ||
      f.includes('heiti') || f.includes('黑体') || f.includes('deng') || f.includes('等线') ||
      f.includes('苹方') || f.includes('pingfang')) return 'sans';
  // 其它中文字体（宋体/仿宋/楷体）大多更接近 serif 的视觉
  if (f.includes('song') || f.includes('宋') || f.includes('fang') || f.includes('仿宋') ||
      f.includes('kai') || f.includes('楷')) return 'serif';
  // 默认无衬线
  return 'sans';
}

// 将 Excel pt 映射为 TLDraw 的离散字号档位（'s' | 'm' | 'l' | 'xl'）
// 说明：TLDraw 的 text.size 只支持这四个值，并非自由 pt；用分段近似即可。
// 调整：整体再变小一轮，让16-18pt也落到m档
function mapPtToTLSize(pt = 11) {
  const p = Number(pt) || 11;
  if (p <= 8) return 's';   // 极小号：≤8pt → s
  if (p <= 12) return 's';  // 小号：9-12pt → s
  if (p <= 18) return 'm';  // 中号：13-18pt → m (扩大范围)
  if (p <= 24) return 'l';  // 大号：19-24pt → l
  return 'xl';              // 超大号：25pt+ → xl
}

// 水平对齐：Excel -> TLDraw
function mapHAlignToTL(align = 'left') {
  const a = (align || '').toLowerCase();
  if (a.includes('center')) return 'middle';
  if (a.includes('right')) return 'end';
  return 'start'; // left
}

// 文本颜色：将十六进制颜色映射到TLDraw支持的颜色名称
function normalizeTextColor(hex) {
  if (typeof hex !== 'string' || !/^#([0-9a-f]{6})$/i.test(hex)) {
    return 'black'; // 默认黑色
  }
  
  // 移除#号并转换为小写
  const hexColor = hex.replace('#', '').toLowerCase();
  
  // 常见颜色映射到TLDraw支持的颜色
  const colorMap = {
    '000000': 'black',
    'ffffff': 'white',
    'ff0000': 'red',
    '00ff00': 'green',
    '0000ff': 'blue',
    'ffff00': 'yellow',
    'ffa500': 'orange',
    '800080': 'violet',
    'ffc0cb': 'light-red',
    '90ee90': 'light-green',
    'add8e6': 'light-blue',
    'dda0dd': 'light-violet',
    '808080': 'grey'
  };
  
  // 精确匹配
  if (colorMap[hexColor]) {
    return colorMap[hexColor];
  }
  
  // 根据颜色值进行近似匹配
  const r = parseInt(hexColor.substr(0, 2), 16);
  const g = parseInt(hexColor.substr(2, 2), 16);
  const b = parseInt(hexColor.substr(4, 2), 16);
  
  // 计算亮度
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  
  if (brightness < 50) return 'black';
  if (brightness > 200) return 'white';
  
  // 根据RGB值判断主要颜色
  if (r > g && r > b) return 'red';
  if (g > r && g > b) return 'green';
  if (b > r && b > g) return 'blue';
  if (r > 200 && g > 200 && b < 100) return 'yellow';
  if (r > 200 && g > 100 && b < 100) return 'orange';
  
  return 'black'; // 默认返回黑色
}


/**
 * 精准放置文本：基于实际渲染尺寸计算对齐位置
 * 适用于 Excel 单元格或文本框的文字居中 / 底部对齐
 */
async function placeTextWithAlignment(editor, {
  cellX, cellY, cellW, cellH,
  text, font, size, color,
  hAlign = 'left',   // 'left' | 'center' | 'right'
  vAlign = 'top',    // 'top' | 'middle' | 'bottom'
  padding = 4,
}) {
  // 纯空白（只含空格/换行）直接跳过
  if (!text || !text.replace(/\s+/g, '')) return null

  const id = `shape:${(crypto.randomUUID?.() || Math.random().toString(36).slice(2))}`

  // 1) 第一次：自适应宽度（不换行），拿"字形真实宽度"
  editor.createShape({
    id,
    type: 'text',
    x: cellX + padding,
    y: cellY + padding,
    props: {
      autoSize: true,                // 关键：先让它按内容收缩
      richText: toRichText(text),
      font, size, color,
    },
  })
  await new Promise(requestAnimationFrame)

  const b1 = editor.getShapePageBounds(id)
  const contentW = Math.ceil(b1?.w ?? 0)    // 真实字形宽度（单行/短文本很重要）
  const contentH = Math.ceil(b1?.h ?? 0)

  // 2) 计算最终宽度（是否需要换行）
  const maxW = Math.max(10, Math.floor(cellW - padding * 2))
  const finalW = Math.min(maxW, contentW || maxW) // 短内容不换行，长内容才限制宽度

  // 3) 更新为固定宽度（触发换行），再测"最终高度"
  editor.updateShape({
    id,
    type: 'text',
    props: { autoSize: false, w: finalW },
  })
  await new Promise(requestAnimationFrame)

  const b2 = editor.getShapePageBounds(id)
  const textH = Math.ceil(b2?.h ?? (contentH || 0))

  // 4) 用"字形真实宽度"算水平位置（不是用 finalW！）
  const glyphW = Math.min(contentW || finalW, finalW)
  let x = cellX + padding
  if (hAlign === 'center') x = Math.round(cellX + (cellW - glyphW) / 2)
  else if (hAlign === 'right') x = Math.round(cellX + cellW - glyphW - padding)

  // 5) 垂直位置用最终高度
  let y = cellY + padding
  if (vAlign === 'middle') y = Math.round(cellY + (cellH - textH) / 2)
  else if (vAlign === 'bottom') y = Math.round(cellY + cellH - textH - padding)

  // 6) 边界护栏（避免极端小格子产生负位置）
  const minX = cellX + padding
  const maxX = cellX + cellW - glyphW - padding
  if (minX <= maxX) x = Math.max(minX, Math.min(x, maxX))

  const minY = cellY + padding
  const maxY = cellY + cellH - textH - padding
  if (minY <= maxY) y = Math.max(minY, Math.min(y, maxY))

  // 调试信息：输出计算过程
  console.log(`  单元格: x=${cellX}, y=${cellY}, w=${cellW}, h=${cellH}`);
  console.log(`  字形真实宽度: ${contentW}`);
  console.log(`  最终宽度: ${finalW}`);
  console.log(`  最终高度: ${textH}`);
  console.log(`  计算位置: x=${x}, y=${y}`);
  console.log(`  边界检查: minX=${minX}, maxX=${maxX}, minY=${minY}, maxY=${maxY}`);

  editor.updateShape({ id, type: 'text', x, y })
  return id
}
