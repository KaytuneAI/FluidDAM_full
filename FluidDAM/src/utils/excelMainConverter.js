/**
 * Excel主转换器模块
 * 负责核心的Excel到TLDraw转换逻辑
 */

import * as ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import DrawingML from './DrawingML.js';

/**
 * Excel主转换器类
 */
export class ExcelMainConverter {
  constructor(editor, scale = 1, dependencies = {}) {
    this.editor = editor;
    this.scale = scale;
    this.dependencies = dependencies;
  }

  /**
   * 主转换方法
   * @param {File} file - Excel文件
   * @returns {Promise<Object>} 转换结果
   */
  async convertExcelToTLDraw(file) {
    try {
      // console.log('开始转换Excel文件:', file.name);
      
      // 读取Excel文件
      const fileBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileBuffer);
      
      // 同时创建JSZip对象用于DrawingML解析
      const zip = await JSZip.loadAsync(fileBuffer);
      
      // 获取第一个工作表
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('Excel文件中没有找到工作表');
      }
      
      // console.log('工作表名称:', worksheet.name);
      // console.log('工作表尺寸:', worksheet.rowCount, 'x', worksheet.columnCount);
      
      // 先提取图片，然后进行布局分析
      const images = await this.dependencies.extractImages(worksheet);
      
      // 使用DrawingML解析器提取文本框和图片
      // console.log('开始使用DrawingML解析器提取元素...');
      const drawingMLElements = await this.dependencies.extractDrawingMLElements(worksheet, zip);
      // console.log('DrawingML解析结果:', drawingMLElements);
      
      // 显示过滤统计
      if (drawingMLElements.skipped && drawingMLElements.skipped.length > 0) {
        // console.log(`DrawingML过滤了 ${drawingMLElements.skipped.length} 个幽灵元素`);
      }
      
      // 合并DrawingML的文本框到现有文字数组
      const allTexts = [];
      
      // 基于提取的图片进行动态布局分析
      const layoutInfo = this.dependencies.analyzeLayoutStructure(worksheet, images);
      // console.log('动态布局分析结果:', layoutInfo);
      
      // 调试：打印工作表结构
      // console.log('工作表对象:', worksheet);
      // console.log('工作表模型:', worksheet.model);
      
      // 1. 获取合并单元格信息
      const mergedCells = this.dependencies.getMergedCells(worksheet);
      // console.log('合并单元格数量:', mergedCells.length);
      
      // 2. 图片已在上面提取完成
      
      // 3. 提取文字元素
      // console.log('开始提取文字...');
      const cellTexts = this.dependencies.extractTexts(worksheet, mergedCells, images);
      // console.log('提取到单元格文字数量:', cellTexts.length);
      
      // 合并单元格文字和DrawingML文本框
      allTexts.push(...cellTexts);
      allTexts.push(...drawingMLElements.texts);
      
      // console.log('合并后总文字数量:', allTexts.length);
      // console.log('其中单元格文字:', cellTexts.length, 'DrawingML文本框:', drawingMLElements.texts.length);
      
      // 调试：显示所有提取的文字内容
      // console.log('=== 单元格文字内容 ===');
      // cellTexts.forEach((text, index) => {
      //   console.log(`${index + 1}. "${text.text}" (${text.x}, ${text.y})`);
      // });
      
      // console.log('=== DrawingML文本框内容 ===');
      // drawingMLElements.texts.forEach((text, index) => {
      //   console.log(`${index + 1}. "${text.text}" (${text.x}, ${text.y})`);
      // });
      
      // 去重：移除重复的文字（相同内容和相近位置）
      const uniqueTexts = [];
      const seenTexts = new Set();
      
      for (const text of allTexts) {
        // 创建文字的唯一标识（内容+位置）
        const textKey = `${text.text}_${Math.round(text.x)}_${Math.round(text.y)}`;
        
        if (!seenTexts.has(textKey)) {
          seenTexts.add(textKey);
          uniqueTexts.push(text);
        } else {
          // console.log(`跳过重复文字: "${text.text}" 位置(${text.x}, ${text.y})`);
        }
      }
      
      // console.log(`去重后文字数量: ${uniqueTexts.length} (原来: ${allTexts.length})`);
      allTexts.length = 0; // 清空原数组
      allTexts.push(...uniqueTexts); // 使用去重后的数组
      
      // 4. 提取单元格背景色
      // console.log('开始提取单元格背景色...');
      const backgrounds = this.dependencies.extractCellBackgrounds(worksheet, mergedCells);
      // console.log('提取到背景色数量:', backgrounds.length);
      
      // 5. 提取表格框架
      // console.log('开始提取表格框架...');
      const frames = this.dependencies.extractFrames(worksheet, mergedCells);
      // console.log('提取到框架数量:', frames.length);
      // console.log('框架详情:', frames);
      
      // 5. 清空当前画布
      const currentShapes = this.editor.getCurrentPageShapes();
      if (currentShapes.length > 0) {
        const shapeIds = currentShapes.map(shape => shape.id);
        this.editor.deleteShapes(shapeIds);
      }
      
      // 6. 跳过布局分析，直接使用原始位置
      // console.log('跳过布局分析，使用原始位置...');
      // console.log('images变量:', images, '类型:', typeof images, '长度:', images?.length);
      // console.log('allTexts变量:', allTexts, '类型:', typeof allTexts, '长度:', allTexts?.length);
      // console.log('frames变量:', frames, '类型:', typeof frames, '长度:', frames?.length);
      
      let adjustedImages = images || [];  // 直接使用原始图片位置，提供默认值
      let adjustedTexts = allTexts || []; // 使用合并后的文字位置，提供默认值
      const adjustedFrames = frames || [];  // 直接使用原始框架位置，提供默认值
      
      // 6.5. 跳过frame处理，直接使用原始图片位置
      // console.log('跳过frame处理，直接使用原始图片位置和尺寸');
      
      // 7. 批量创建形状（按正确层级顺序：背景→边框→图片→文本）
      // console.log('开始创建TLDraw形状...');
      
      // 1. 先创建背景色（最底层）
      if (backgrounds.length > 0) {
        // console.log('开始创建背景色形状...');
        await this.dependencies.createShapesBatch(backgrounds, 'background');
      }
      
      // 2. 创建frame（包括表格框和图片frame）
      if (adjustedFrames.length > 0) {
        // console.log('开始创建frame形状...');
        try {
          await this.dependencies.createShapesBatch(adjustedFrames, 'frame');
        } catch (frameError) {
          console.warn('frame创建失败，但不影响其他内容:', frameError);
        }
      }
      
      // 3. 创建图片（放在框之上，不入frame）
      if (adjustedImages.length > 0) {
        await this.dependencies.createShapesBatch(adjustedImages, 'image');
      }
      
      // 4. 最后创建文字（最上层）
      if (adjustedTexts.length > 0) {
        // console.log('开始创建文字形状...');
        await this.dependencies.createShapesBatch(adjustedTexts, 'text');
        
        // 5. 后处理：缩窄过于宽的文本框
        // console.log('开始后处理文本缩窄...');
        await this.dependencies.postProcessTextShapes(adjustedTexts);
      }
      
      // 7. 调整视图
      try {
        // 根据TLDraw官方文档，使用正确的API
        this.editor.selectAll();
        this.editor.zoomToSelection({
          animation: { duration: 1000 }
        });
      } catch (viewError) {
        console.warn('调整视图失败，但不影响转换结果:', viewError);
        // 备用方案：尝试重置缩放
        try {
          this.editor.resetZoom();
        } catch (resetError) {
          console.warn('重置缩放也失败:', resetError);
        }
      }
      
      // console.log('Excel转换完成！');
      // console.log(`创建了 ${backgrounds.length} 个背景色, ${frames.length} 个表格框, ${images.length} 个图片, ${allTexts.length} 个文字`);
      
      return {
        success: true,
        stats: {
          backgrounds: backgrounds.length,
          frames: frames.length, // 使用矩形框代替frame
          images: images.length,
          texts: allTexts.length,
          cellTexts: cellTexts.length,
          drawingMLTexts: drawingMLElements.texts.length,
          mergedCells: mergedCells.length,
          note: '包含DrawingML样式解析、单元格背景色、表格边框和文本框'
        }
      };
      
    } catch (error) {
      console.error('Excel转换失败:', error);
      console.error('错误堆栈:', error.stack);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
