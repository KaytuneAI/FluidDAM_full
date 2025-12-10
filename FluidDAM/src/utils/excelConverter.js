import * as ExcelJS from 'exceljs';
import { toRichText } from 'tldraw';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import DrawingML from './DrawingML';
import { createTextFitConfig, pt2px, shrinkAndRefitTextShape, createSafeRichText } from './textFitUtils';

// 导入拆分后的工具函数
import { 
  pointsToPx, 
  columnWidthToPx, 
  calculateOffsets, 
  getCellPixelBoundsPrecise, 
  getCellPixelBounds,
  columnLetterToNumber 
} from './unitConversion.js';

import { 
  getMergedCells, 
  isInMergedCell, 
  extractCellBackgrounds, 
  extractFrames 
} from './cellUtils.js';

import { 
  analyzeLayoutStructure, 
  groupElementsByRow, 
  groupElementsByColumn, 
  calculateElementSpacing, 
  identifyElementClusters, 
  calculateScaleFactors, 
  applyLayoutAnalysis 
} from './layoutAnalyzer.js';

import { 
  extractDrawingMLElements, 
  extractImages, 
  extractTextFromDrawings, 
  extractTextFromSingleDrawing, 
  extractTextFromWorkbook, 
  extractTextFromWorksheetProperties 
} from './drawingExtractor.js';

import { 
  extractTexts, 
  extractRectangleTexts, 
  extractTextFromRectangle 
} from './excel/utils/texts.js';

import { 
  getImageTextOverlays 
} from './imageUtils.js';

import { 
  mapColorToTLDraw, 
  mapFontSizeToTLDraw, 
  createSafeRichTextStyle, 
  compressImage, 
  parseExcelColor, 
  parseExcelFont, 
  parseExcelBorder, 
  parseExcelFill 
} from './styleMapper.js';

// 内联定义错误和成功处理函数
function createError(message, code = 'UNKNOWN_ERROR', details = {}) {
  return {
    success: false,
    error: message,
    code,
    details
  };
}

function createSuccess(message, data = {}) {
  return {
    success: true,
    message,
    data
  };
}

// Fidelity-first 模式配置
export const PRESERVE_EXCEL_LAYOUT = false;       // 图片要fit到格子
export const SNAP_TO_FRAME_THRESHOLD = 0.95;      // 可选：与某个frame重叠≥95%才贴齐

/**
 * Excel到TLDraw转换工具类
 * 实现Excel布局到TLDraw画布的转换，保持相对距离和版式
 */
export class ExcelToTLDrawConverter {
  constructor(editor, scale = 1) {
    this.editor = editor;
    this.scale = scale; // 整体缩放系数
    this.batchSize = 100; // 批量处理大小
  }

  /**
   * 单位换算：行高 points -> px
   * @param {number} points - 行高（points）
   * @returns {number} 像素值
   */
  pointsToPx(points) {
    return pointsToPx(points);
  }

  /**
   * 单位换算：列宽 Excel width -> px
   * @param {number} width - Excel列宽
   * @returns {number} 像素值
   */
  columnWidthToPx(width) {
    return columnWidthToPx(width);
  }

  /**
   * 计算行列偏移量数组，用于DrawingML解析
   * @param {Object} worksheet - Excel工作表
   * @returns {Object} { colOffsets: [], rowOffsets: [] }
   */
  calculateOffsets(worksheet) {
    return calculateOffsets(worksheet);
  }

  /**
   * 更精确的单元格像素边界计算
   * @param {number} row - 行号（1-based）
   * @param {number} col - 列号（1-based）
   * @param {Object} worksheet - Excel工作表
   * @returns {Object} {x, y, width, height}
   */
  getCellPixelBoundsPrecise(row, col, worksheet) {
    return getCellPixelBoundsPrecise(row, col, worksheet);
  }

  /**
   * 简化的单元格像素边界计算（使用偏移量数组）
   * @param {number} row - 行号（1-based）
   * @param {number} col - 列号（1-based）
   * @param {Object} worksheet - Excel工作表
   * @returns {Object} {x, y, width, height}
   */
  getCellPixelBounds(row, col, worksheet) {
    return getCellPixelBounds(row, col, worksheet);
  }

  /**
   * 列字母转数字
   * @param {string} columnLetter - 列字母（如 "A", "B", "AA"）
   * @returns {number} 列号（1-based）
   */
  columnLetterToNumber(columnLetter) {
    return columnLetterToNumber(columnLetter);
  }

  /**
   * 处理合并单元格
   * @param {Object} worksheet - Excel工作表
   * @returns {Array} 合并单元格信息数组
   */
  getMergedCells(worksheet) {
    return getMergedCells(worksheet);
  }

  /**
   * 检查单元格是否在合并区域内
   * @param {number} row - 行号
   * @param {number} col - 列号
   * @param {Array} mergedCells - 合并单元格数组
   * @returns {Object|null} 合并单元格信息或null
   */
  isInMergedCell(row, col, mergedCells) {
    return isInMergedCell(row, col, mergedCells);
  }

  /**
   * 动态分析Excel布局结构，自动识别元素间的关系和比例
   * @param {Object} worksheet - Excel工作表对象
   * @param {Array} images - 图片元素数组
   */
  analyzeLayoutStructure(worksheet, images = []) {
    return analyzeLayoutStructure(worksheet, images);
  }

  /**
   * 按Y坐标分组元素（识别水平行）
   */
  groupElementsByRow(elements) {
    return groupElementsByRow(elements);
  }

  /**
   * 按X坐标分组元素（识别垂直列）
   */
  groupElementsByColumn(elements) {
    return groupElementsByColumn(elements);
  }

  /**
   * 计算元素间的间距
   */
  calculateElementSpacing(elements, rows, cols) {
    return calculateElementSpacing(elements, rows, cols);
  }

  /**
   * 识别元素簇（相近的元素组）
   */
  identifyElementClusters(elements) {
    return identifyElementClusters(elements);
  }

  /**
   * 计算缩放因子
   */
  calculateScaleFactors(elements, avgRowHeight, avgColWidth) {
    return calculateScaleFactors(elements, avgRowHeight, avgColWidth);
  }

  /**
   * 使用DrawingML解析器提取文本框和图片（只解析当前worksheet关联的drawing文件）
   * @param {Object} worksheet - Excel工作表
   * @param {JSZip} zip - Excel文件的zip对象
   * @param {Object} opts - 过滤选项
   * @returns {Object} { texts: [], images: [] }
   */
  async extractDrawingMLElements(worksheet, zip, opts = {}) {
    return await extractDrawingMLElements(worksheet, zip, opts);
  }

  /**
   * 提取图片元素
   * @param {Object} worksheet - Excel工作表
   * @returns {Array} 图片信息数组
   */
  async extractImages(worksheet) {
    return await extractImages(worksheet);
  }

  /**
   * 从drawings中提取文本框
   * @param {Object} drawings - Excel drawings对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromDrawings(drawings, images) {
    return extractTextFromDrawings(drawings, images);
  }

  /**
   * 从单个drawing中提取文本框
   * @param {Object} drawing - 单个drawing对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromSingleDrawing(drawing, images) {
    return extractTextFromSingleDrawing(drawing, images);
  }

  /**
   * 从workbook中提取文本框
   * @param {Object} workbook - Excel workbook对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromWorkbook(workbook, images) {
    return extractTextFromWorkbook(workbook, images);
  }

  /**
   * 从worksheet属性中提取文本框
   * @param {Object} worksheet - Excel worksheet对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromWorksheetProperties(worksheet, images) {
    return extractTextFromWorksheetProperties(worksheet, images);
  }

  /**
   * 提取文字元素
   * @param {Object} worksheet - Excel工作表
   * @param {Array} mergedCells - 合并单元格数组
   * @param {Array} images - 图片信息数组
   * @returns {Array} 文字信息数组
   */
  extractTexts(worksheet, mergedCells, images) {
    return extractTexts(worksheet, mergedCells, images);
  }

  /**
   * 获取图片上的文字覆盖层（模拟OCR效果）
   * @param {Array} images - 图片数组
   * @returns {Array} 文字覆盖层数组
   */
  getImageTextOverlays(images) {
    return getImageTextOverlays(images);
  }

  /**
   * 提取矩形文本框
   * @param {Object} worksheet - Excel工作表
   * @returns {Array} 矩形文本框数组
   */
  extractRectangleTexts(worksheet) {
    return extractRectangleTexts(worksheet);
  }

  /**
   * 从单个矩形中提取文本
   * @param {Object} rectangle - 矩形对象
   * @param {Array} texts - 文本数组
   */
  extractTextFromRectangle(rectangle, texts) {
    return extractTextFromRectangle(rectangle, texts);
  }

  /**
   * 将十六进制颜色映射到TLDraw支持的颜色名称
   * @param {string} hexColor - 十六进制颜色值
   * @returns {string} TLDraw颜色名称
   */
  mapColorToTLDraw(hexColor) {
    return mapColorToTLDraw(hexColor);
  }

  /**
   * 将pt字号映射到TLDraw v3的size值
   * @param {number} pt - 字号（pt）
   * @returns {string} TLDraw v3的size值
   */
  mapFontSizeToTLDraw(pt) {
    return mapFontSizeToTLDraw(pt);
  }

  /**
   * 创建安全的富文本格式，避免空文本节点错误
   * @param {string} text - 原始文本
   * @returns {Object} 安全的富文本格式
   */
  createSafeRichText(text) {
    return toRichText(text);
  }

  /**
   * 压缩图片到指定大小以内
   * @param {string} base64String - 原始Base64字符串
   * @param {number} maxSizeKB - 最大文件大小（KB）
   * @param {string} mimeType - 图片MIME类型
   * @returns {Promise<string>} 压缩后的Base64字符串
   */
  async compressImage(base64String, maxSizeKB = 100, mimeType = 'image/png') {
    return await compressImage(base64String, maxSizeKB, mimeType);
  }

  /**
   * 解析Excel单元格颜色
   * @param {Object} color - ExcelJS颜色对象
   * @returns {string} 十六进制颜色值
   */
  parseExcelColor(color) {
    return parseExcelColor(color);
  }

  /**
   * 提取单元格背景色
   * @param {Object} worksheet - Excel工作表
   * @param {Array} mergedCells - 合并单元格数组
   * @returns {Array} 背景色元素数组
   */
  extractCellBackgrounds(worksheet, mergedCells) {
    return extractCellBackgrounds(worksheet, mergedCells);
  }

  /**
   * 提取边框框架
   * @param {Object} worksheet - Excel工作表
   * @param {Array} mergedCells - 合并单元格数组
   * @returns {Array} 框架元素数组
   */
  extractFrames(worksheet, mergedCells) {
    return extractFrames(worksheet, mergedCells);
  }

  /**
   * 应用布局分析结果到元素
   */
  applyLayoutAnalysis(elements, layoutInfo) {
    return applyLayoutAnalysis(elements, layoutInfo);
  }

  /**
   * 检查点是否在矩形内
   * @param {number} px - 点X坐标
   * @param {number} py - 点Y坐标
   * @param {Object} rect - 矩形对象 {x, y, width, height}
   * @returns {boolean} 是否在矩形内
   */
  _isPointInRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.width &&
           py >= rect.y && py <= rect.y + rect.height;
  }

  /**
   * 查找包含图片的框架
   * @param {Array} frames - 框架数组
   * @param {Object} img - 图片对象
   * @returns {Object|null} 包含图片的框架或null
   */
  _findContainingFrame(frames, img) {
    for (const frame of frames) {
      if (this._isPointInRect(img.x, img.y, frame) &&
          this._isPointInRect(img.x + img.width, img.y + img.height, frame)) {
        return frame;
      }
    }
    return null;
  }

  /**
   * 计算两个矩形的重叠面积
   * @param {Object} rect1 - 矩形1
   * @param {Object} rect2 - 矩形2
   * @returns {number} 重叠面积
   */
  _calculateOverlapArea(rect1, rect2) {
    const left = Math.max(rect1.x, rect2.x);
    const right = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
    const top = Math.max(rect1.y, rect2.y);
    const bottom = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);
    
    if (left < right && top < bottom) {
      return (right - left) * (bottom - top);
    }
    return 0;
  }

  /**
   * 尝试将元素贴齐到框架
   * @param {Object} element - 元素对象
   * @param {Array} frames - 框架数组
   * @returns {Object} 调整后的元素
   */
  maybeSnapToFrame(element, frames) {
    if (!PRESERVE_EXCEL_LAYOUT || !frames || frames.length === 0) {
      return element;
    }
    
    let bestFrame = null;
    let bestRatio = 0;
    
    if (element.type === 'image') {
      bestFrame = this._findContainingFrame(frames, element);
      if (bestFrame) {
        const overlapArea = this._calculateOverlapArea(element, bestFrame);
        const elementArea = element.width * element.height;
        bestRatio = overlapArea / elementArea;
      }
    }
    
    if (bestFrame && bestRatio >= SNAP_TO_FRAME_THRESHOLD) {
      return {
        ...element,
        x: bestFrame.x,
        y: bestFrame.y,
        width: bestFrame.width,
        height: bestFrame.height
      };
    }
    
    return element;
  }

  /**
   * 查找所有包含图片的框架
   * @param {Array} frames - 框架数组
   * @param {Object} img - 图片对象
   * @returns {Array} 包含图片的框架数组
   */
  _findAllContainingFrames(frames, img) {
    const containingFrames = [];
    
    for (const frame of frames) {
      if (this._isPointInRect(img.x, img.y, frame) &&
          this._isPointInRect(img.x + img.width, img.y + img.height, frame)) {
        containingFrames.push(frame);
      }
    }
    
    return containingFrames;
  }

  /**
   * 将文本框适配到框架内
   * @param {Array} texts - 文本框数组
   * @param {Array} frames - 框架数组
   * @param {number} padding - 内边距
   * @returns {Array} 调整后的文本框数组
   */
  _fitTextboxesIntoFrames(texts, frames, padding = 4) {
    if (PRESERVE_EXCEL_LAYOUT) {
      return texts;
    }
    
    const adjustedTexts = [];
    
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      
      if (text.type !== 'textbox') {
        adjustedTexts.push(text);
        continue;
      }
      
      const containingFrames = this._findAllContainingFrames(frames, text);
      
      if (containingFrames.length === 0) {
        // 如果没有包含的框架，尝试找到最接近的框架
        if (frames.length > 0) {
          let closestFrame = null;
          let minDistance = Infinity;
          
          for (const frame of frames) {
            const distance = Math.sqrt(
              Math.pow(text.x - frame.x, 2) + Math.pow(text.y - frame.y, 2)
            );
            if (distance < minDistance) {
              minDistance = distance;
              closestFrame = frame;
            }
          }
          
          if (closestFrame && minDistance < 100) {
            adjustedTexts.push({
              ...text,
              x: closestFrame.x + padding,
              y: closestFrame.y + padding,
              width: closestFrame.width - padding * 2,
              height: closestFrame.height - padding * 2
            });
            continue;
          }
        }
        
        adjustedTexts.push(text);
        continue;
      }
      
      // 如果有多个包含的框架，选择最大的
      const bestFrame = containingFrames.reduce((best, current) => 
        (current.width * current.height) > (best.width * best.height) ? current : best
      );
      
      adjustedTexts.push({
        ...text,
        x: bestFrame.x + padding,
        y: bestFrame.y + padding,
        width: bestFrame.width - padding * 2,
        height: bestFrame.height - padding * 2
      });
    }
    
    return adjustedTexts;
  }

  /**
   * 将图片适配到框架内
   * @param {Array} images - 图片数组
   * @param {Array} frames - 框架数组
   * @param {number} padding - 内边距
   * @returns {Array} 调整后的图片数组
   */
  _fitImagesIntoFrames(images, frames, padding = 0) {
    if (PRESERVE_EXCEL_LAYOUT) {
      return images;
    }
    
    const adjustedImages = [];
    
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      
      const containingFrames = this._findAllContainingFrames(frames, img);
      
      if (containingFrames.length === 0) {
        adjustedImages.push(img);
        continue;
      }
      
      // 如果有多个包含的框架，选择最大的
      const bestFrame = containingFrames.reduce((best, current) => 
        (current.width * current.height) > (best.width * best.height) ? current : best
      );
      
      // 检查是否是横幅图片（长宽比大于2:1）
      const aspectRatio = img.width / img.height;
      const isBanner = aspectRatio > 2;
      
      if (isBanner) {
        // 横幅图片保持宽高比，居中显示
        const scale = Math.min(
          (bestFrame.width - padding * 2) / img.width,
          (bestFrame.height - padding * 2) / img.height
        );
        
        const newWidth = img.width * scale;
        const newHeight = img.height * scale;
        
        adjustedImages.push({
          ...img,
          x: bestFrame.x + (bestFrame.width - newWidth) / 2,
          y: bestFrame.y + (bestFrame.height - newHeight) / 2,
          width: newWidth,
          height: newHeight
        });
      } else {
        // 普通图片填充框架
        adjustedImages.push({
          ...img,
          x: bestFrame.x + padding,
          y: bestFrame.y + padding,
          width: bestFrame.width - padding * 2,
          height: bestFrame.height - padding * 2
        });
      }
    }
    
    return adjustedImages;
  }

  /**
   * 批量创建形状
   * @param {Array} elements - 元素数组
   * @param {string} shapeType - 形状类型
   * @returns {Promise<Array>} 创建的形状数组
   */
  async createShapesBatch(elements, shapeType) {
    const shapes = [];
    
    for (const element of elements) {
      try {
        let shape = null;
        
        switch (shapeType) {
          case 'image':
            // 创建图片形状
            if (element.url) {
              // 检查是否已经是完整的 data URL
              let imageUrl = element.url;
              if (imageUrl.startsWith('data:')) {
                // 如果已经是 data URL，直接使用
                console.log('使用现有的 data URL:', imageUrl.substring(0, 50) + '...');
              } else {
                // 如果不是 data URL，则压缩并添加前缀
                const compressedBase64 = await this.compressImage(element.url);
                imageUrl = `data:image/png;base64,${compressedBase64}`;
              }
              
              // 检查是否超出锚点范围
              const exceedsAnchor = element.x < 0 || element.y < 0 || 
                                   element.x + element.width > 10000 || 
                                   element.y + element.height > 10000;
              
              if (exceedsAnchor) {
                console.warn(`图片位置超出范围，跳过: ${element.x}, ${element.y}`);
                continue;
              }
              
              shape = {
                type: 'image',
                x: element.x * this.scale,
                y: element.y * this.scale,
                props: {
                  w: element.width * this.scale,
                  h: element.height * this.scale,
                  assetId: null, // 将在后续设置
                  url: imageUrl
                }
              };
            }
            break;
            
          case 'textbox':
            // 创建文本框形状
            if (element.text && element.text.trim()) {
              const richText = toRichText(element.text.trim());
              
              shape = {
                type: 'text',
                x: element.x * this.scale,
                y: element.y * this.scale,
                props: {
                  w: element.width * this.scale,
                  richText: richText,
                  size: 'm',
                  color: 'black',
                  font: 'draw'
                }
              };
            }
            break;
            
          case 'frame':
            // 创建框架形状
            shape = {
              type: 'frame',
              x: element.x * this.scale,
              y: element.y * this.scale,
              props: {
                w: element.width * this.scale,
                h: element.height * this.scale,
                name: `Frame ${shapes.length + 1}`
              }
            };
            break;
            
          case 'background':
            // 创建背景形状
            shape = {
              type: 'rectangle',
              x: element.x * this.scale,
              y: element.y * this.scale,
              props: {
                w: element.width * this.scale,
                h: element.height * this.scale,
                fill: this.mapColorToTLDraw(element.color),
                stroke: 'none'
              }
            };
            break;
        }
        
        if (shape) {
          shapes.push(shape);
        }
      } catch (error) {
        console.warn(`创建${shapeType}形状失败:`, error);
      }
    }
    
    if (shapes.length > 0) {
      try {
        // 使用批量创建API
        if (typeof this.editor.batch === 'function') {
          await this.editor.batch(() => {
            this.editor.createShapes(shapes);
          });
        } else {
          // 回退到单个创建
          for (const shape of shapes) {
            this.editor.createShapes([shape]);
          }
        }
      } catch (error) {
        console.warn(`批量创建${shapeType}形状失败:`, error);
      }
    }
    
    return shapes;
  }

  /**
   * 后处理文本形状
   * @param {Array} textElements - 文本元素数组
   * @returns {Promise<void>}
   */
  async postProcessTextShapes(textElements) {
    if (!textElements || textElements.length === 0) {
      return;
    }
    
    try {
      // 获取所有文本形状
      const textShapes = this.editor.getCurrentPageShapes().filter(shape => 
        shape.type === 'text'
      );
      
      for (const textShape of textShapes) {
        try {
          // 检查是否需要缩小文本
          const needsShrinking = textShape.props.w < 100;
          
          if (needsShrinking) {
            // 使用文本适配工具缩小文本
            const config = createTextFitConfig(textShape);
            shrinkAndRefitTextShape(this.editor, textShape.id, textShape.props.w, config);
          }
        } catch (error) {
          console.warn('后处理文本形状失败:', error);
        }
      }
    } catch (error) {
      console.warn('后处理文本形状失败:', error);
    }
  }

  /**
   * 主要的转换方法
   * @param {File} file - Excel文件
   * @returns {Promise<Object>} 转换结果
   */
  async convertExcelToTLDraw(file) {
    try {
      console.log('开始转换Excel文件到TLDraw...');
      
      // 验证文件 - 使用简单的文件类型检查
      if (!file || !file.name || (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.xlsm'))) {
        return createError('请选择有效的Excel文件（.xlsx, .xls, .xlsm）');
      }
      
      // 验证编辑器
      if (!this.editor) {
        return createError('编辑器未初始化');
      }
      
      // 加载Excel文件
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file);
      
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return createError('Excel文件中没有找到工作表');
      }
      
      console.log(`开始处理工作表: ${worksheet.name}`);
      
      // 提取DrawingML元素
      const zip = new JSZip();
      const zipContent = await file.arrayBuffer();
      await zip.loadAsync(zipContent);
      
      const drawingMLElements = await this.extractDrawingMLElements(worksheet, zip);
      
      if (drawingMLElements.skipped && drawingMLElements.skipped.length > 0) {
      }
      
      // 提取图片
      const images = await this.extractImages(worksheet);
      console.log(`提取到${images.length}张图片`);
      
      // 提取合并单元格
      const mergedCells = this.getMergedCells(worksheet);
      console.log(`找到${mergedCells.length}个合并单元格`);
      
      // 提取文本
      const cellTexts = this.extractTexts(worksheet, mergedCells, images);
      
      // 提取DrawingML文本
      const drawingTexts = drawingMLElements.texts || [];
      
      // 提取矩形文本
      const rectangleTexts = this.extractRectangleTexts(worksheet);
      
      // 合并所有文本
      const allTexts = [...cellTexts, ...drawingTexts, ...rectangleTexts];
      
      // 分析布局结构
      const layoutInfo = this.analyzeLayoutStructure(worksheet, images);
      
      // 应用布局分析
      const adjustedTexts = this.applyLayoutAnalysis(allTexts, layoutInfo);
      const adjustedImages = this.applyLayoutAnalysis(images, layoutInfo);
      
      // 提取背景和框架
      const backgrounds = this.extractCellBackgrounds(worksheet, mergedCells);
      const frames = this.extractFrames(worksheet, mergedCells);
      
      // 调整元素到框架内
      const adjustedFrames = this._fitTextboxesIntoFrames(frames, frames);
      const adjustedImagesInFrames = this._fitImagesIntoFrames(adjustedImages, adjustedFrames);
      const adjustedTextsInFrames = this._fitTextboxesIntoFrames(adjustedTexts, adjustedFrames);
      
      // 创建形状
      let currentShapes = [];
      
      // 创建背景
      if (backgrounds.length > 0) {
        const backgroundShapes = await this.createShapesBatch(backgrounds, 'background');
        currentShapes = currentShapes.concat(backgroundShapes);
      }
      
      // 创建框架
      if (adjustedFrames.length > 0) {
        const frameShapes = await this.createShapesBatch(adjustedFrames, 'frame');
        currentShapes = currentShapes.concat(frameShapes);
      }
      
      // 创建图片
      if (adjustedImagesInFrames.length > 0) {
        const imageShapes = await this.createShapesBatch(adjustedImagesInFrames, 'image');
        currentShapes = currentShapes.concat(imageShapes);
      }
      
      // 创建文本
      if (adjustedTextsInFrames.length > 0) {
        const textShapes = await this.createShapesBatch(adjustedTextsInFrames, 'textbox');
        currentShapes = currentShapes.concat(textShapes);
        
        // 后处理文本形状
        await this.postProcessTextShapes(adjustedTextsInFrames);
      }
      
      console.log(`转换完成，共创建${currentShapes.length}个形状`);
      
      return createSuccess('Excel转换成功', {
        shapesCount: currentShapes.length,
        imagesCount: images.length,
        textsCount: allTexts.length,
        framesCount: frames.length,
        backgroundsCount: backgrounds.length
      });
      
    } catch (error) {
      console.error('Excel转换失败:', error);
      console.error('错误堆栈:', error.stack);
      return createError(error.message, 'CONVERSION_ERROR', { stack: error.stack });
    }
  }
}

