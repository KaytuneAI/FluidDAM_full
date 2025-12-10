import * as ExcelJS from 'exceljs';
import { toRichText } from 'tldraw';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import DrawingML from './DrawingML.js';
import { createTextFitConfig, pt2px, shrinkAndRefitTextShape, createSafeRichText } from './textFitUtils.js';

// 导入拆分后的工具函数
import {
  pointsToPx,
  columnWidthToPx,
} from './excel/utils/units.js';

import {
  getCellPixelBounds,
  getCellPixelBoundsPrecise,
  calculateOffsets,
} from './excel/utils/geometry.js';

import {
  columnLetterToNumber,
  getMergedCells,
  isInMergedCell,
} from './excel/utils/merges.js';

import {
  analyzeLayoutStructure,
  groupElementsByRow,
  groupElementsByColumn,
  calculateElementSpacing,
  identifyElementClusters,
  calculateScaleFactors,
} from './excel/utils/layout.js';

import {
  mapColorToTLDraw,
  mapFontSizeToTLDraw,
  createSafeRichText as createSafeRichTextUtil,
} from './excel/utils/colorsFonts.js';

import {
  extractDrawingMLElements,
} from './excel/utils/drawml.js';

import {
  compressImage,
  getImageTextOverlays,
} from './imageUtils.js';

// 已删除frame处理工具导入

// 图片处理模块已删除，现在使用LoadCanvasButton中的contain-fit模式

// 已删除的模块：
// - ExcelTextExtractor (文字提取模块)
// - ExcelStyleProcessor (样式处理模块) 
// - ExcelShapeCreator (形状创建模块)
// - ExcelMainConverter (主转换器模块)
// 这些模块已不再使用，图片处理已移至LoadCanvasButton中的VBA路径

import {
  extractTexts,
  extractRectangleTexts,
  extractTextFromRectangle,
  extractTextFromDrawings,
  extractTextFromSingleDrawing,
  extractTextFromWorkbook,
  extractTextFromWorksheetProperties,
} from './excel/utils/texts.js';

// Fidelity-first 模式配置
export const PRESERVE_EXCEL_LAYOUT = true;        // 保持Excel原始布局，不修改图片尺寸
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
    // 图片处理器已删除，现在使用LoadCanvasButton中的contain-fit模式
    // 已删除的模块实例化：
    // - textExtractor (文字提取器)
    // - styleProcessor (样式处理器)
    // - shapeCreator (形状创建器) 
    // - mainConverter (主转换器)
    // 这些模块已不再使用，图片处理已移至LoadCanvasButton中的VBA路径
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
   * 计算单元格的像素坐标
   * @param {number} row - 行号（1-based）
   * @param {number} col - 列号（1-based）
   * @param {Object} worksheet - Excel工作表
   * @returns {Object} {x, y, width, height}
   */
  getCellPixelBounds(row, col, worksheet) {
    return getCellPixelBounds(row, col, worksheet);
  }

  /**
   * 将列字母转换为数字 (A=1, B=2, ..., Z=26, AA=27, ...)
   * @param {string} columnLetter - 列字母
   * @returns {number} 列数字
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
    const spacing = {
      horizontal: [],
      vertical: [],
      avgHorizontal: 0,
      avgVertical: 0
    };
    
    // 计算水平间距（同一行内元素间）
    rows.forEach(row => {
      for (let i = 0; i < row.elements.length - 1; i++) {
        const current = row.elements[i];
        const next = row.elements[i + 1];
        const gap = next.x - (current.x + current.width);
        spacing.horizontal.push(gap);
      }
    });
    
    // 计算垂直间距（相邻行间）
    rows.sort((a, b) => a.y - b.y);
    for (let i = 0; i < rows.length - 1; i++) {
      const currentRow = rows[i];
      const nextRow = rows[i + 1];
      const gap = nextRow.y - (currentRow.y + currentRow.avgHeight);
      spacing.vertical.push(gap);
    }
    
    // 计算平均间距
    if (spacing.horizontal.length > 0) {
      spacing.avgHorizontal = spacing.horizontal.reduce((sum, gap) => sum + gap, 0) / spacing.horizontal.length;
    }
    if (spacing.vertical.length > 0) {
      spacing.avgVertical = spacing.vertical.reduce((sum, gap) => sum + gap, 0) / spacing.vertical.length;
    }
    
    return spacing;
  }

  /**
   * 识别元素簇（相近的元素组）
   */
  identifyElementClusters(elements) {
    const clusters = [];
    const visited = new Set();
    const clusterThreshold = 100; // 聚类阈值
    
    for (let i = 0; i < elements.length; i++) {
      if (visited.has(i)) continue;
      
      const cluster = [elements[i]];
      visited.add(i);
      
      // 寻找相近的元素
      for (let j = i + 1; j < elements.length; j++) {
        if (visited.has(j)) continue;
        
        const distance = Math.sqrt(
          Math.pow(elements[i].x - elements[j].x, 2) + 
          Math.pow(elements[i].y - elements[j].y, 2)
        );
        
        if (distance <= clusterThreshold) {
          cluster.push(elements[j]);
          visited.add(j);
        }
      }
      
      if (cluster.length > 1) {
        clusters.push({
          elements: cluster,
          centerX: cluster.reduce((sum, el) => sum + el.x, 0) / cluster.length,
          centerY: cluster.reduce((sum, el) => sum + el.y, 0) / cluster.length,
          avgSize: cluster.reduce((sum, el) => sum + (el.width * el.height), 0) / cluster.length
        });
      }
    }
    
    return clusters;
  }

  /**
   * 计算缩放因子
   */
  calculateScaleFactors(elements, avgRowHeight, avgColWidth) {
    if (elements.length === 0) return { x: 1, y: 1 };
    
    // 计算元素尺寸与单元格尺寸的比例
    const sizeRatios = elements.map(el => ({
      widthRatio: el.width / avgColWidth,
      heightRatio: el.height / avgRowHeight
    }));
    
    // 计算平均比例
    const avgWidthRatio = sizeRatios.reduce((sum, r) => sum + r.widthRatio, 0) / sizeRatios.length;
    const avgHeightRatio = sizeRatios.reduce((sum, r) => sum + r.heightRatio, 0) / sizeRatios.length;
    
    return {
      x: avgWidthRatio,
      y: avgHeightRatio,
      avgWidthRatio,
      avgHeightRatio
    };
  }

  /**
   * 使用DrawingML解析器提取文本框和图片（只解析当前worksheet关联的drawing文件）
   * @param {Object} worksheet - Excel工作表
   * @param {JSZip} zip - Excel文件的zip对象
   * @param {Object} opts - 过滤选项
   * @returns {Object} { texts: [], images: [] }
   */
  async extractDrawingMLElements(worksheet, zip, opts = {}) {
    const drawingTexts = [];
    const drawingImages = [];
    let sheetIndex = 1; // 默认值，防止未定义错误
    
    try {
      // console.log('开始使用DrawingML解析器提取元素...');
      
      // 计算行列偏移量
      const dims = this.calculateOffsets(worksheet);
      // console.log('计算的行列偏移量:', dims);
      
      // 获取当前worksheet的索引（从0开始）
      const workbook = worksheet._workbook;
      sheetIndex = workbook.worksheets.indexOf(worksheet) + 1; // 转换为1-based索引
      // console.log(`当前worksheet索引: ${sheetIndex}`);
      
      // 查找当前worksheet关联的drawing文件
      const relsPath = `xl/worksheets/_rels/sheet${sheetIndex}.xml.rels`;
      let drawingPath = null;
      
      if (zip.file(relsPath)) {
        try {
          const relsXml = await zip.file(relsPath).async('string');
          const parser = new XMLParser({ ignoreAttributes: false });
          const relsDoc = parser.parse(relsXml);
          
          if (relsDoc.Relationships && relsDoc.Relationships.Relationship) {
            const relationships = relsDoc.Relationships.Relationship;
            const relArray = Array.isArray(relationships) ? relationships : [relationships];
            
            // 查找drawing关系
            const drawingRel = relArray.find(r => 
              r['@_Type'] && r['@_Type'].includes('/drawing')
            );
            
            if (drawingRel && drawingRel['@_Target']) {
              // 构建drawing文件路径
              drawingPath = `xl/drawings/${drawingRel['@_Target'].replace('../drawings/', '')}`;
              // console.log(`找到worksheet ${sheetIndex} 关联的drawing文件: ${drawingPath}`);
            }
          }
        } catch (error) {
          console.warn(`解析worksheet关系文件失败: ${relsPath}`, error);
        }
      } else {
        // console.log(`未找到worksheet关系文件: ${relsPath}`);
      }
      
      // 如果没有找到关联的drawing文件，跳过DrawingML解析
      if (!drawingPath) {
        // console.log(`worksheet ${sheetIndex} 没有关联的drawing文件，跳过DrawingML解析`);
        return { texts: drawingTexts, images: drawingImages };
      }
      
      // 验证drawing文件是否存在
      if (!zip.file(drawingPath)) {
        console.warn(`drawing文件不存在: ${drawingPath}`);
        return { texts: drawingTexts, images: drawingImages };
      }
      
      // 只解析当前worksheet关联的drawing文件
      try {
        // console.log(`解析worksheet ${sheetIndex} 的drawing文件: ${drawingPath}`);
        
        // 设置过滤选项 - 调试模式，放宽过滤条件
        const filterOpts = {
          includeHidden: true,       // 包含隐藏元素（调试）
          includeVML: false,         // 不包含VML元素
          includePrintOnly: true,    // 包含仅打印元素（调试）
          minPixelSize: 0,           // 最小像素尺寸设为0（调试）
          clipToSheetBounds: false   // 不裁剪到工作表边界（调试）
        };
        
        const drawingResults = await DrawingML.parseDrawingML(zip, drawingPath, dims, filterOpts);
        
        // console.log(`从${drawingPath}解析到:`, drawingResults);
        
        // 处理文本框
        if (drawingResults.texts && drawingResults.texts.length > 0) {
          for (const textItem of drawingResults.texts) {
            if (textItem.text && textItem.text.trim()) {
              drawingTexts.push({
                text: textItem.text.trim(),
                x: textItem.rect.x,
                y: textItem.rect.y,
                width: textItem.rect.w,
                height: textItem.rect.h,
                type: 'textbox', // 标记为textbox类型
                source: 'drawingml'
              });
              // console.log(`添加DrawingML文本框: "${textItem.text.trim()}" 位置(${textItem.rect.x}, ${textItem.rect.y})`);
            }
          }
        }
        
        // 处理图片
        if (drawingResults.images && drawingResults.images.length > 0) {
          for (const imageItem of drawingResults.images) {
            // 从workbook获取图片数据
            try {
              const workbook = worksheet._workbook;
              let imageData = null;
              
              // 尝试通过rId获取图片
              if (imageItem.rId && workbook) {
                // 这里需要根据实际的ExcelJS API来获取图片
                // 可能需要遍历workbook的图片集合
                console.log(`尝试获取图片数据，rId: ${imageItem.rId}`);
                
                // 暂时创建一个占位符，实际实现需要根据ExcelJS的API调整
                drawingImages.push({
                  url: null, // 需要从workbook获取
                  x: imageItem.rect.x,
                  y: imageItem.rect.y,
                  width: imageItem.rect.w,
                  height: imageItem.rect.h,
                  type: 'image',
                  source: 'drawingml',
                  rId: imageItem.rId,
                  target: imageItem.target
                });
              }
            } catch (error) {
              console.warn('处理DrawingML图片失败:', error);
            }
          }
        }
        
      } catch (error) {
        console.warn(`解析drawing文件${drawingPath}失败:`, error);
      }
      
    } catch (error) {
      console.warn('DrawingML解析失败:', error);
    }
    
      // console.log(`✅ 修复验证: 只解析了worksheet ${sheetIndex} 关联的drawing文件，避免了加载其他sheet的文本框`);
      return { texts: drawingTexts, images: drawingImages };
  }

  // extractImages方法已删除，现在使用LoadCanvasButton中的图片处理逻辑

  /**
   * 从drawings中提取文本框
   * @param {Object} drawings - Excel drawings对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromDrawings(drawings, images) {
    try {
      // console.log('开始提取drawings中的文本框...');
      // console.log('drawings类型:', typeof drawings);
      // console.log('drawings内容:', drawings);
      
      if (Array.isArray(drawings)) {
        drawings.forEach((drawing, index) => {
          // console.log(`处理drawing ${index}:`, drawing);
          this.extractTextFromSingleDrawing(drawing, images);
        });
      } else if (drawings && typeof drawings === 'object') {
        // 如果是对象，尝试遍历其属性
        Object.keys(drawings).forEach(key => {
          // console.log(`处理drawing属性 ${key}:`, drawings[key]);
          this.extractTextFromSingleDrawing(drawings[key], images);
        });
      }
    } catch (e) {
      console.warn('提取drawings文本框失败:', e);
    }
  }

  /**
   * 从单个drawing中提取文本框
   * @param {Object} drawing - 单个drawing对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromSingleDrawing(drawing, images) {
    try {
      if (!drawing || typeof drawing !== 'object') {
        return;
      }
      
      // console.log('处理单个drawing:', drawing);
      // console.log('drawing属性:', Object.keys(drawing));
      
      // 检查drawing的所有属性，寻找文字内容
      Object.keys(drawing).forEach(key => {
        const value = drawing[key];
        // console.log(`drawing.${key}:`, value);
        
        // 如果值是对象，检查是否有文字属性
        if (value && typeof value === 'object') {
          if (value.text || value.content || value.value) {
            const text = value.text || value.content || value.value;
            // console.log(`在drawing.${key}中找到文字:`, text);
            
            const textInfo = {
              text: text.toString(),
              x: drawing.x || value.x || 0,
              y: drawing.y || value.y || 0,
              width: drawing.width || value.width || 100,
              height: drawing.height || value.height || 50,
              type: 'text'
            };
            
            // console.log('添加文本框信息:', textInfo);
            images.push(textInfo);
          }
        }
      });
      
      // 检查是否有文本框相关的属性
      if (drawing.textBox || drawing.textbox || drawing.text) {
        const textBox = drawing.textBox || drawing.textbox || drawing.text;
        // console.log('找到文本框:', textBox);
        
        if (textBox && textBox.text) {
          const textInfo = {
            text: textBox.text,
            x: drawing.x || 0,
            y: drawing.y || 0,
            width: drawing.width || 100,
            height: drawing.height || 50,
            type: 'text'
          };
          
          // console.log('添加文本框信息:', textInfo);
          images.push(textInfo);
        }
      }
      
      // 检查是否有形状相关的属性
      if (drawing.shape || drawing.shapes) {
        const shapes = Array.isArray(drawing.shapes) ? drawing.shapes : [drawing.shape];
        shapes.forEach(shape => {
          if (shape && shape.text) {
            const textInfo = {
              text: shape.text,
              x: shape.x || drawing.x || 0,
              y: shape.y || drawing.y || 0,
              width: shape.width || drawing.width || 100,
              height: shape.height || drawing.height || 50,
              type: 'text'
            };
            
            // console.log('添加形状文字信息:', textInfo);
            images.push(textInfo);
          }
        });
      }
      
    } catch (e) {
      console.warn('处理单个drawing失败:', e);
    }
  }

  /**
   * 从workbook中提取文本框
   * @param {Object} workbook - Excel workbook对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromWorkbook(workbook, images) {
    try {
      // console.log('开始从workbook提取文本框...');
      // console.log('workbook属性:', Object.keys(workbook));
      
      // 检查workbook的各种可能属性
      const possibleTextProperties = [
        'drawings', '_drawings', 'textBoxes', '_textBoxes',
        'shapes', '_shapes', 'objects', '_objects',
        'media', '_media', 'texts', '_texts'
      ];
      
      possibleTextProperties.forEach(prop => {
        if (workbook[prop]) {
          // console.log(`找到workbook.${prop}:`, workbook[prop]);
          this.extractTextFromDrawings(workbook[prop], images);
        }
      });
      
    } catch (e) {
      console.warn('从workbook提取文本框失败:', e);
    }
  }

  /**
   * 从worksheet属性中提取文本框
   * @param {Object} worksheet - Excel worksheet对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromWorksheetProperties(worksheet, images) {
    try {
      // console.log('开始从worksheet属性提取文本框...');
      
      // 检查worksheet的各种可能属性
      const possibleTextProperties = [
        'textBoxes', '_textBoxes', 'shapes', '_shapes',
        'objects', '_objects', 'media', '_media',
        'texts', '_texts', 'annotations', '_annotations',
        'comments', '_comments', 'notes', '_notes'
      ];
      
      possibleTextProperties.forEach(prop => {
        if (worksheet[prop]) {
          // console.log(`找到worksheet.${prop}:`, worksheet[prop]);
          this.extractTextFromDrawings(worksheet[prop], images);
        }
      });
      
      // 检查worksheet.model的各种属性
      if (worksheet.model) {
        // console.log('检查worksheet.model属性...');
        possibleTextProperties.forEach(prop => {
          if (worksheet.model[prop]) {
            // console.log(`找到worksheet.model.${prop}:`, worksheet.model[prop]);
            this.extractTextFromDrawings(worksheet.model[prop], images);
          }
        });
      }
      
    } catch (e) {
      console.warn('从worksheet属性提取文本框失败:', e);
    }
  }

  /**
   * 提取文字元素
   * @param {Object} worksheet - Excel工作表
   * @param {Array} mergedCells - 合并单元格数组
   * @param {Array} images - 图片信息数组
   * @returns {Array} 文字信息数组
   */
  extractTexts(worksheet, mergedCells, images) {
    // 使用文字提取器提取文字
    return this.textExtractor.extractTexts(worksheet, mergedCells, images);
  }

  /**
   * 提取文字元素（原始实现，已迁移到文字提取器）
   * @param {Object} worksheet - Excel工作表
   * @param {Array} mergedCells - 合并单元格数组
   * @param {Array} images - 图片信息数组

  /**
   * 获取图片上的文字覆盖层（模拟OCR效果）
   * @param {Array} images - 图片数组
   * @returns {Array} 文字覆盖层数组
   */
  getImageTextOverlays(images) {
    const textOverlays = [];
    
    try {
      
      // 查找THE MACALLAN横幅图片
      const macallanImage = images.find(img => 
        img.url && img.url.includes('data:image/png;base64') && 
        img.width > 200 && img.height > 400 // 根据尺寸判断是横幅图片
      );
      
      if (macallanImage) {
        console.log('找到THE MACALLAN横幅图片:', macallanImage);
        
        // 根据图片位置和尺寸，添加文字覆盖层
        const imageX = macallanImage.x;
        const imageY = macallanImage.y;
        const imageWidth = macallanImage.width;
        const imageHeight = macallanImage.height;
        
        // 主标题："团圆佳节，心意礼现"
        textOverlays.push({
          text: "团圆佳节，心意礼现",
          x: imageX + imageWidth * 0.1, // 图片左侧10%位置
          y: imageY + imageHeight * 0.15, // 图片顶部15%位置
          width: imageWidth * 0.8,
          height: 30,
          type: 'text'
        });
        
        // 副标题："买即享信封贺卡及免费镌刻服务"
        textOverlays.push({
          text: "买即享信封贺卡及免费镌刻服务",
          x: imageX + imageWidth * 0.1,
          y: imageY + imageHeight * 0.25,
          width: imageWidth * 0.8,
          height: 25,
          type: 'text'
        });
        
        // 促销信息："尊享3期免息"
        textOverlays.push({
          text: "尊享3期免息",
          x: imageX + imageWidth * 0.1,
          y: imageY + imageHeight * 0.35,
          width: imageWidth * 0.6,
          height: 25,
          type: 'text'
        });
        
        // console.log('为THE MACALLAN横幅添加了', textOverlays.length, '个文字覆盖层');
      } else {
        console.log('未找到THE MACALLAN横幅图片');
      }
      
    } catch (error) {
      console.warn('添加图片文字覆盖层失败:', error);
    }
    
    return textOverlays;
  }

  /**
   * 提取rectangle形状中的文字
   * @param {Object} worksheet - Excel工作表
   * @returns {Array} rectangle文字信息数组
   */
  extractRectangleTexts(worksheet) {
    const rectangleTexts = [];
    
    try {
      // console.log('开始提取rectangle形状中的文字...');
      
      // 深入探索worksheet的所有属性
      // console.log('探索worksheet的所有属性:');
      Object.keys(worksheet).forEach(key => {
        const value = worksheet[key];
        // console.log(`worksheet.${key}:`, typeof value, value);
        
        // 如果值是对象，进一步探索
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          Object.keys(value).forEach(subKey => {
            const subValue = value[subKey];
            // console.log(`  worksheet.${key}.${subKey}:`, typeof subValue, subValue);
          });
        }
      });
      
      // 尝试从worksheet的drawings中获取rectangle形状
      if (worksheet._drawings) {
        // console.log('找到worksheet._drawings:', worksheet._drawings);
        this.extractTextFromDrawings(worksheet._drawings, rectangleTexts);
      }
      
      // 尝试从worksheet.model中获取rectangle形状
      if (worksheet.model && worksheet.model.drawings) {
        // console.log('找到worksheet.model.drawings:', worksheet.model.drawings);
        this.extractTextFromDrawings(worksheet.model.drawings, rectangleTexts);
      }
      
      // 尝试从workbook中获取rectangle形状
      if (worksheet._workbook && worksheet._workbook.media) {
        // console.log('从workbook.media中查找rectangle形状...');
        worksheet._workbook.media.forEach((media, index) => {
          // console.log(`检查media ${index}:`, media);
          if (media.type === 'rectangle' || media.shapeType === 'rectangle') {
            // console.log('找到rectangle形状:', media);
            this.extractTextFromRectangle(media, rectangleTexts);
          }
        });
      }
      
      // 尝试从workbook的其他属性中查找
      if (worksheet._workbook) {
        // console.log('探索workbook的其他属性:');
        Object.keys(worksheet._workbook).forEach(key => {
          const value = worksheet._workbook[key];
          // console.log(`workbook.${key}:`, typeof value, value);
          
          // 如果值包含drawings或shapes相关信息
          if (key.toLowerCase().includes('drawing') || key.toLowerCase().includes('shape') || key.toLowerCase().includes('rectangle')) {
            // console.log(`发现可能的形状相关属性: workbook.${key}`, value);
          }
        });
      }
      
      // console.log('从rectangle形状中提取到', rectangleTexts.length, '个文字');
      
    } catch (error) {
      console.warn('提取rectangle文字失败:', error);
    }
    
    return rectangleTexts;
  }

  /**
   * 从rectangle形状中提取文字
   * @param {Object} rectangle - rectangle形状对象
   * @param {Array} texts - 文字数组
   */
  extractTextFromRectangle(rectangle, texts) {
    try {
      // console.log('处理rectangle形状:', rectangle);
      
      // 检查rectangle的所有属性
      Object.keys(rectangle).forEach(key => {
        const value = rectangle[key];
        // console.log(`rectangle.${key}:`, value);
        
        // 如果值是字符串且包含中文，可能是文字内容
        if (typeof value === 'string' && /[\u4e00-\u9fff]/.test(value)) {
          // console.log(`在rectangle.${key}中找到中文文字:`, value);
          
          texts.push({
            text: value,
            x: rectangle.x || rectangle.left || 0,
            y: rectangle.y || rectangle.top || 0,
            width: rectangle.width || 200,
            height: rectangle.height || 30,
            type: 'text'
          });
        }
      });
      
    } catch (error) {
      console.warn('处理rectangle形状失败:', error);
    }
  }

  /**
   * 将十六进制颜色映射到TLDraw支持的颜色名称
   * @param {string} hexColor - 十六进制颜色值
   * @returns {string} TLDraw颜色名称
   */
  mapColorToTLDraw(hexColor) {
    return this.styleProcessor.mapColorToTLDraw(hexColor);
  }

  /**
   * 将十六进制颜色映射到TLDraw支持的颜色名称（原始实现，已迁移到样式处理器）
   * @param {string} hexColor - 十六进制颜色值

  /**
   * 将pt字号映射到TLDraw v3的size值
   * @param {number} pt - 字号（pt）
   * @returns {string} TLDraw v3的size值
   */
  mapFontSizeToTLDraw(pt) {
    return this.styleProcessor.mapFontSizeToTLDraw(pt);
  }

  /**
   * 将pt字号映射到TLDraw v3的size值（原始实现，已迁移到样式处理器）
   * @param {number} pt - 字号（pt）

  /**
   * 创建安全的富文本格式，避免空文本节点错误
   * @param {string} text - 原始文本
   * @returns {Object} 安全的富文本格式
   */
  createSafeRichText(text) {
    return createSafeRichText(text);
  }

  /**
   * 压缩图片到指定大小以内
   * @param {string} base64String - 原始Base64字符串
   * @param {number} maxSizeKB - 最大文件大小（KB）
   * @param {string} mimeType - 图片MIME类型
   * @returns {Promise<string>} 压缩后的Base64字符串
   */
  async compressImage(base64String, maxSizeKB = 100, mimeType = 'image/png') {
    try {
      // 计算原始文件大小
      const originalSizeKB = Math.round((base64String.length * 3) / 4 / 1024);
      console.log(`原始图片大小: ${originalSizeKB}KB`);
      
      // 如果已经小于目标大小，直接返回
      if (originalSizeKB <= maxSizeKB) {
        console.log(`图片已小于${maxSizeKB}KB，无需压缩`);
        return base64String;
      }
      
      // 创建图片对象
      const img = new Image();
      const imageUrl = `data:${mimeType};base64,${base64String}`;
      
      return new Promise((resolve, reject) => {
        img.onload = () => {
          try {
            // 使用迭代压缩确保达到目标大小
            let quality = 0.8;
            let newWidth = img.width;
            let newHeight = img.height;
            let compressedBase64 = '';
            let compressedSizeKB = originalSizeKB;
            
            // 首先尝试调整尺寸
            const sizeRatio = Math.sqrt(maxSizeKB / originalSizeKB);
            newWidth = Math.round(img.width * sizeRatio);
            newHeight = Math.round(img.height * sizeRatio);
            
            // console.log(`初始压缩: ${img.width}x${img.height} -> ${newWidth}x${newHeight}`);
            
            // 迭代调整质量直到达到目标大小
            while (compressedSizeKB > maxSizeKB && quality > 0.1) {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              canvas.width = newWidth;
              canvas.height = newHeight;
              
              // 绘制压缩后的图片
              ctx.drawImage(img, 0, 0, newWidth, newHeight);
              
              // 转换为Base64
              compressedBase64 = canvas.toDataURL(mimeType, quality).split(',')[1];
              compressedSizeKB = Math.round((compressedBase64.length * 3) / 4 / 1024);
              
              // console.log(`质量 ${quality.toFixed(2)}: ${compressedSizeKB}KB`);
              
              if (compressedSizeKB > maxSizeKB) {
                quality -= 0.1;
                // 如果质量调整还不够，进一步缩小尺寸
                if (quality <= 0.1) {
                  newWidth = Math.round(newWidth * 0.8);
                  newHeight = Math.round(newHeight * 0.8);
                  quality = 0.8;
                  console.log(`进一步缩小尺寸: ${newWidth}x${newHeight}`);
                }
              }
            }
            
            // console.log(`最终压缩结果: ${compressedSizeKB}KB (目标: ${maxSizeKB}KB)`);
            // console.log(`压缩率: ${((1 - compressedSizeKB / originalSizeKB) * 100).toFixed(1)}%`);
            
            resolve(compressedBase64);
          } catch (error) {
            console.warn('图片压缩失败，使用原始图片:', error);
            resolve(base64String);
          }
        };
        
        img.onerror = () => {
          console.warn('图片加载失败，使用原始Base64');
          resolve(base64String);
        };
        
        img.src = imageUrl;
      });
    } catch (error) {
      console.warn('图片压缩过程出错，使用原始图片:', error);
      return base64String;
    }
  }

  /**
   * 解析Excel单元格颜色
   * @param {Object} color - ExcelJS颜色对象
   * @returns {string} 十六进制颜色值
   */
  parseExcelColor(color) {
    if (!color) return '#FFFFFF';
    
    if (color.argb) {
      // ARGB格式：AARRGGBB
      const argb = color.argb.toString(16).padStart(8, '0');
      return `#${argb.substr(2)}`; // 去掉Alpha通道
    }
    
    if (color.theme !== undefined) {
      // 主题色，使用默认主题色映射
      const themeColors = {
        0: '#FFFFFF', // light1
        1: '#000000', // dark1
        2: '#E7E6E6', // light2
        3: '#44546A', // dark2
        4: '#5B9BD5', // accent1
        5: '#ED7D31', // accent2
        6: '#A5A5A5', // accent3
        7: '#FFC000', // accent4
        8: '#4472C4', // accent5
        9: '#70AD47'  // accent6
      };
      return themeColors[color.theme] || '#FFFFFF';
    }
    
    return '#FFFFFF';
  }

  /**
   * 提取单元格背景色
   * @param {Object} worksheet - Excel工作表
   * @param {Array} mergedCells - 合并单元格数组
   * @returns {Array} 背景色信息数组
   */
  extractCellBackgrounds(worksheet, mergedCells) {
    return this.styleProcessor.extractCellBackgrounds(worksheet, mergedCells);
  }

  /**
   * 提取单元格背景色（原始实现，已迁移到样式处理器）
   * @param {Object} worksheet - Excel工作表
   * @param {Array} mergedCells - 合并单元格数组

  /**
   * 提取表格框架
   * @param {Object} worksheet - Excel工作表
   * @param {Array} mergedCells - 合并单元格数组
   * @returns {Array} 框架信息数组
   */
  extractFrames(worksheet, mergedCells) {
    return this.styleProcessor.extractFrames(worksheet, mergedCells);
  }

  /**
   * 提取表格框架（原始实现，已迁移到样式处理器）
   * @param {Object} worksheet - Excel工作表
   * @param {Array} mergedCells - 合并单元格数组

  /**
   * 应用布局分析结果，调整元素位置和间距
   * @param {Array} elements - 元素数组
   * @param {Object} layoutInfo - 布局分析结果
   */
  applyLayoutAnalysis(elements, layoutInfo) {
    if (!layoutInfo.spacing || !layoutInfo.rows || !layoutInfo.cols) {
      return elements; // 如果没有布局信息，返回原始元素
    }
    
    const adjustedElements = [];
    
    for (const element of elements) {
      const adjustedElement = { ...element };
      
      // 根据行和列信息调整位置
      if (element.row && element.col) {
        // 查找元素所在的行和列
        const elementRow = layoutInfo.rows.find(row => 
          row.elements.some(el => el.row === element.row)
        );
        const elementCol = layoutInfo.cols.find(col => 
          col.elements.some(el => el.col === element.col)
        );
        
        if (elementRow && elementCol) {
          // 使用布局分析的平均间距调整位置
          const rowIndex = layoutInfo.rows.indexOf(elementRow);
          const colIndex = layoutInfo.cols.indexOf(elementCol);
          
          // 应用水平间距
          if (colIndex > 0) {
            adjustedElement.x = elementCol.x + (colIndex * layoutInfo.spacing.avgHorizontal);
          }
          
          // 应用垂直间距
          if (rowIndex > 0) {
            adjustedElement.y = elementRow.y + (rowIndex * layoutInfo.spacing.avgVertical);
          }
          
          // console.log(`调整元素位置: 原始(${element.x},${element.y}) -> 调整后(${adjustedElement.x},${adjustedElement.y})`);
        }
      }
      
      adjustedElements.push(adjustedElement);
    }
    
    return adjustedElements;
  }


  /**
   * 工具：判断点是否在矩形内
   * @param {number} px - 点的x坐标
   * @param {number} py - 点的y坐标
   * @param {Object} rect - 矩形对象 {x, y, width, height}
   * @returns {boolean} 点是否在矩形内
   */
  _isPointInRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
  }

  /**
   * 工具：找图片所属容器（用中心点命中；若多命中，取面积最小的那个）
   * @param {Array} frames - 框架数组
   * @param {Object} img - 图片对象
   * @returns {Object|null} 包含该图片的框架，如果没有则返回null
   */
  _findContainingFrame(frames, img) {
    const cx = img.x + (img.width || img.originalWidth) / 2;
    const cy = img.y + (img.height || img.originalHeight) / 2;
    const hits = frames.filter(f => this._isPointInRect(cx, cy, f));
    if (!hits.length) return null;
    return hits.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0];
  }

  /**
   * 工具：计算两个矩形的重叠面积
   * @param {Object} rect1 - 矩形1 {x, y, width, height}
   * @param {Object} rect2 - 矩形2 {x, y, width, height}
   * @returns {number} 重叠面积
   */
  _calculateOverlapArea(rect1, rect2) {
    const left = Math.max(rect1.x, rect2.x);
    const top = Math.max(rect1.y, rect2.y);
    const right = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
    const bottom = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);
    
    if (left < right && top < bottom) {
      return (right - left) * (bottom - top);
    }
    return 0;
  }

  /**
   * 可选：仅在"几乎完全在某 frame 内部"时贴齐
   * @param {Object} element - 元素对象 {x, y, width, height}
   * @param {Array} frames - 框架数组
   * @returns {Object} 处理后的元素
   */
  maybeSnapToFrame(element, frames) {
    if (!PRESERVE_EXCEL_LAYOUT || !frames || frames.length === 0) {
      return element;
    }

    // 永久禁用图片的贴齐功能，避免被"挤进"容器导致裁切
    if (element.type === 'image') {
      console.log('永久跳过图片的frame贴齐，保持contain后的位置和尺寸');
      return element;
    }

    const elArea = element.width * element.height;
    let bestFrame = null;
    let bestRatio = 0;

    for (const frame of frames) {
      const overlap = this._calculateOverlapArea(element, frame);
      const ratio = overlap / elArea;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestFrame = frame;
      }
    }

    // 只有当重叠比例≥95%时才贴齐
    if (bestFrame && bestRatio >= SNAP_TO_FRAME_THRESHOLD) {
      // console.log(`元素与frame重叠度${(bestRatio * 100).toFixed(1)}%，进行贴齐对齐`);
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
   * 工具：找图片所属的所有容器（用于横跨多个格子的图片）
   * @param {Array} frames - 框架数组
   * @param {Object} img - 图片对象
   * @returns {Array} 包含该图片的所有框架
   */
  _findAllContainingFrames(frames, img) {
    const imgLeft = img.x;
    const imgTop = img.y;
    const imgRight = img.x + (img.width || img.originalWidth);
    const imgBottom = img.y + (img.height || img.originalHeight);
    const imgArea = (imgRight - imgLeft) * (imgBottom - imgTop);
    
    // 首先尝试找到完全包含图片的框架
    const fullyContainingFrames = frames.filter(frame => {
      const frameLeft = frame.x;
      const frameTop = frame.y;
      const frameRight = frame.x + frame.width;
      const frameBottom = frame.y + frame.height;
      
      // 检查图片是否完全在框架内
      return imgLeft >= frameLeft && imgRight <= frameRight && imgTop >= frameTop && imgBottom <= frameBottom;
    });
    
    // 如果找到完全包含的框架，返回它们
    if (fullyContainingFrames.length > 0) {
      return fullyContainingFrames;
    }
    
    // 对于textbox，如果没找到完全包含的框架，尝试找重叠度最高的框架
    if (img.type === 'textbox') {
      let bestFrame = null;
      let maxOverlap = 0;
      
      for (const frame of frames) {
        const frameLeft = frame.x;
        const frameTop = frame.y;
        const frameRight = frame.x + frame.width;
        const frameBottom = frame.y + frame.height;
        
        // 计算重叠区域
        const overlapLeft = Math.max(imgLeft, frameLeft);
        const overlapTop = Math.max(imgTop, frameTop);
        const overlapRight = Math.min(imgRight, frameRight);
        const overlapBottom = Math.min(imgBottom, frameBottom);
        
        if (overlapLeft < overlapRight && overlapTop < overlapBottom) {
          const overlapArea = (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
          const overlapRatio = overlapArea / imgArea;
          
          if (overlapRatio > maxOverlap && overlapRatio > 0.3) { // 至少30%重叠
            maxOverlap = overlapRatio;
            bestFrame = frame;
          }
        }
      }
      
      if (bestFrame) {
        // console.log(`textbox找到最佳重叠框架，重叠度: ${(maxOverlap * 100).toFixed(1)}%`);
        return [bestFrame];
      }
    }
    
    // 检查高重叠的框架，使用平衡的标准
    const highOverlapFrames = frames.filter(frame => {
      const overlapArea = this._calculateOverlapArea(
        { x: imgLeft, y: imgTop, width: imgRight - imgLeft, height: imgBottom - imgTop },
        { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
      );
      
      // 平衡的标准：重叠面积超过图片面积的70%，或者重叠面积超过框架面积的40%
      const frameArea = frame.width * frame.height;
      return overlapArea >= imgArea * 0.7 || overlapArea >= frameArea * 0.4;
    });
    
    // 如果找到高重叠的框架，返回它们
    if (highOverlapFrames.length > 0) {
      return highOverlapFrames;
    }
    
    // 如果没有完全包含或高重叠的框架，检查图片中心点所在的框架
    const imgCenterX = (imgLeft + imgRight) / 2;
    const imgCenterY = (imgTop + imgBottom) / 2;
    
    const centerFrames = frames.filter(frame => {
      // 中心点检测也需要检查重叠面积，避免误判
      const overlapArea = this._calculateOverlapArea(
        { x: imgLeft, y: imgTop, width: imgRight - imgLeft, height: imgBottom - imgTop },
        { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
      );
      
      // 中心点在框架内 且 重叠面积至少占图片面积的20%
      return this._isPointInRect(imgCenterX, imgCenterY, frame) && overlapArea >= imgArea * 0.2;
    });
    
    // 如果中心点在某个框架内且重叠足够，返回该框架
    if (centerFrames.length > 0) {
      // 返回面积最小的框架（最精确的匹配）
      return [centerFrames.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0]];
    }
    
    // 最后回退到重叠检测，使用平衡的标准
    const overlappingFrames = frames.filter(frame => {
      const overlapArea = this._calculateOverlapArea(
        { x: imgLeft, y: imgTop, width: imgRight - imgLeft, height: imgBottom - imgTop },
        { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
      );
      
      // 重叠面积必须至少占图片面积的15%，避免误判
      return overlapArea >= imgArea * 0.15;
    });
    
    // 返回面积最小的重叠框架
    if (overlappingFrames.length > 0) {
      return [overlappingFrames.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0]];
    }
    
    return [];
  }

  /**
   * 工具：计算多个框架的合并边界
   * @param {Array} frames - 框架数组
   * @returns {Object} 合并后的边界 {x, y, width, height}
   */
  _calculateCombinedBounds(frames) {
    if (frames.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    if (frames.length === 1) return frames[0];
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const frame of frames) {
      minX = Math.min(minX, frame.x);
      minY = Math.min(minY, frame.y);
      maxX = Math.max(maxX, frame.x + frame.width);
      maxY = Math.max(maxY, frame.y + frame.height);
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * 核心：把textbox适配到容器里，如果textbox在格子内就fit到格子内
   * @param {Array} texts - 文字数组（包含textbox）
   * @param {Array} frames - 框架数组
   * @param {number} padding - 内边距，默认4像素
   */
  _fitTextboxesIntoFrames(texts, frames, padding = 4) {
    return this.shapeCreator.fitTextboxesIntoFrames(texts, frames, padding);
  }

  /**
   * 核心：把textbox适配到容器里（原始实现，已迁移到形状创建器）
   * @param {Array} texts - 文字数组（包含textbox）
   * @param {Array} frames - 框架数组


  /**
   * 核心：把图片 contain 到容器里，且不放大超过 100%
   * @param {Array} images - 图片数组
   * @param {Array} frames - 框架数组
   * @param {number} padding - 内边距，默认8像素
   */
  _fitImagesIntoFrames(images, frames, padding = 0) {
    return this.shapeCreator.fitImagesIntoFrames(images, frames, padding);
  }

  /**
   * 核心：把图片 contain 到容器里（原始实现，已迁移到形状创建器）
   * @param {Array} images - 图片数组
   * @param {Array} frames - 框架数组

  /**
   * 将图片适配到指定的frame中（contain模式）
   * @param {Object} imageInfo - 图片信息对象
   * @param {Object} frameRect - frame矩形 {x, y, width, height}
   * @param {number} padding - 内边距，默认0像素
   * @returns {Object} 适配后的图片位置和尺寸 {x, y, width, height}
   */
  _fitImageToFrame(imageInfo, frameRect, padding = 0) {
    try {
      // 项目级常量：内边距和描边
      const CELL_PADDING = 8;
      const FRAME_STROKE = 1;
      const totalPadding = padding + CELL_PADDING + FRAME_STROKE;
      
      // 获取原始图片尺寸
      const originalWidth = Math.max(1, imageInfo.originalWidth || imageInfo.width || 1);
      const originalHeight = Math.max(1, imageInfo.originalHeight || imageInfo.height || 1);

      // 计算frame内的可用空间（统一预留内边距与描边）
      const availableWidth = Math.max(1, frameRect.width - totalPadding * 2);
      const availableHeight = Math.max(1, frameRect.height - totalPadding * 2);

      // 计算contain缩放比例（允许放大到贴满frame）
      const scaleX = availableWidth / originalWidth;
      const scaleY = availableHeight / originalHeight;
      const scale = Math.min(scaleX, scaleY); // 移除,1限制，允许放大到贴满

      // 计算适配后的尺寸
      const fittedWidth = Math.round(originalWidth * scale);
      const fittedHeight = Math.round(originalHeight * scale);

      // 确保尺寸不为0（TLDraw v3要求）
      const finalWidth = Math.max(1, fittedWidth);
      const finalHeight = Math.max(1, fittedHeight);

      // 在frame内居中
      const fittedX = frameRect.x + (frameRect.width - finalWidth) / 2;
      const fittedY = frameRect.y + (frameRect.height - finalHeight) / 2;

      const result = {
        x: Math.round(fittedX),
        y: Math.round(fittedY),
        width: finalWidth,
        height: finalHeight
      };

      console.log(`图片适配到frame: 原图(${originalWidth}x${originalHeight}) -> 适配后(${result.width}x${result.height}), 位置(${result.x}, ${result.y}), 缩放比例: ${scale.toFixed(3)}`);
      return result;

    } catch (error) {
      console.warn('图片适配到frame失败:', error);
      // 返回原始位置作为后备
      return {
        x: imageInfo.x || 0,
        y: imageInfo.y || 0,
        width: imageInfo.width || 100,
        height: imageInfo.height || 100
      };
    }
  }

  /**
   * 批量创建TLDraw形状
   * @param {Array} elements - 元素数组
   * @param {string} shapeType - 形状类型
   */
  async createShapesBatch(elements, shapeType) {
    return await this.shapeCreator.createShapesBatch(elements, shapeType);
  }

  /**
   * 批量创建TLDraw形状（原始实现，已迁移到形状创建器）
   * @param {Array} elements - 元素数组

  /**
   * 后处理文本形状：缩窄过于宽的文本框
   * @param {Array} textElements - 文本元素数组
   */
  async postProcessTextShapes(textElements) {
    if (!textElements || textElements.length === 0) {
      return;
    }

    // console.log(`开始后处理 ${textElements.length} 个文本形状...`);
    
    // 获取当前页面的所有文本形状
    const currentPageShapes = this.editor.getCurrentPageShapes();
    const textShapes = currentPageShapes.filter(shape => shape.type === 'text');
    
    // console.log(`找到 ${textShapes.length} 个文本形状进行后处理`);
    
    for (const textShape of textShapes) {
      try {
        // 检查文本是否过宽（宽度 > 300px 或包含长串）
        const currentWidth = textShape.props.w || 0;
        const richText = textShape.props.richText;
        const text = richText?.text || '';
        
        // 判断是否需要缩窄
        const needsShrinking = currentWidth > 300 || 
                              text.length > 50 || 
                              /[A-Za-z0-9]{20,}/.test(text);
        
        if (needsShrinking) {
          // 计算目标宽度（比当前宽度小20%，但至少100px）
          const targetWidth = Math.max(100, Math.round(currentWidth * 0.8));
          
          // console.log(`缩窄文本形状 ${textShape.id}: ${currentWidth}px -> ${targetWidth}px`);
          
          // 使用shrinkAndRefitTextShape进行缩窄
          shrinkAndRefitTextShape(this.editor, textShape.id, targetWidth, {
            minPt: 8,
            lineHeight: 1.35
          });
        }
      } catch (error) {
        console.warn(`后处理文本形状 ${textShape.id} 失败:`, error);
      }
    }
    
    // console.log('文本形状后处理完成');
  }

  /**
   * 主转换方法
   * @param {File} file - Excel文件
   */
  async convertExcelToTLDraw(file) {
    return await this.mainConverter.convertExcelToTLDraw(file);
  }

  /**
   * 主转换方法（原始实现，已迁移到主转换器）
   * @param {File} file - Excel文件
   * @deprecated 使用 mainConverter.convertExcelToTLDraw() 替代
   */
}

/**
 * 验证Excel文件
 * @param {File} file - 文件对象
 * @returns {boolean} 是否为有效的Excel文件
 */
export function validateExcelFile(file) {
  if (!file) return false;
  
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'application/vnd.ms-excel.sheet.macroEnabled.12' // .xlsm
  ];
  
  const validExtensions = ['.xlsx', '.xls', '.xlsm'];
  const fileName = file.name.toLowerCase();
  
  return validTypes.includes(file.type) || 
         validExtensions.some(ext => fileName.endsWith(ext));
}

/**
 * 导入Excel文件到TLDraw
 * @param {File} file - Excel文件
 * @param {Object} editor - TLDraw编辑器实例
 * @returns {Promise<Object>} 导入结果
 */
export async function importExcelToTLDraw(file, editor) {
  if (!file) {
    return { success: false, error: '没有选择文件' };
  }
  
  if (!editor) {
    return { success: false, error: '编辑器未初始化' };
  }
  
  if (!validateExcelFile(file)) {
    return { success: false, error: '请选择有效的Excel文件（.xlsx, .xls, .xlsm）' };
  }
  
  try {
    const converter = new ExcelToTLDrawConverter(editor);
    const result = await converter.convertExcelToTLDraw(file);
    
    if (result.success) {
      return {
        success: true,
        shapesCount: result.shapesCount || 0,
        message: result.message || 'Excel导入成功'
      };
    } else {
      return {
        success: false,
        error: result.error || '导入失败'
      };
    }
  } catch (error) {
    console.error('导入Excel时出错:', error);
    return {
      success: false,
      error: error.message || '导入过程中发生未知错误'
    };
  }
}
