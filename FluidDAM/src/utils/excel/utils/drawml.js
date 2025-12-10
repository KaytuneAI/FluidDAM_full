/**
 * DrawingML解析相关工具函数
 */

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import DrawingML from '../../DrawingML.js';
import { calculateOffsets } from './geometry.js';

/**
 * 提取DrawingML元素（只处理当前worksheet关联的drawing）
 * @param {Object} worksheet - Excel工作表
 * @param {Object} zip - JSZip实例
 * @param {Object} opts - 选项
 * @returns {Promise<Object>} 提取结果
 */
export async function extractDrawingMLElements(worksheet, zip, opts = {}) {
  const drawingTexts = [];
  const drawingImages = [];
  let sheetIndex = 1; // 默认值，防止未定义错误

  try {
    // 计算偏移量
    const dims = calculateOffsets(worksheet);
    
    // 获取工作簿引用
    const workbook = worksheet._workbook;
    
    // 尝试获取当前sheet的drawing关系
    const relsPath = `xl/worksheets/_rels/sheet${sheetIndex}.xml.rels`;
    let drawingPath = null;
    
    try {
      if (zip.file(relsPath)) {
        const relsXml = await zip.file(relsPath).async('string');
        const parser = new XMLParser({ ignoreAttributes: false });
        const relsDoc = parser.parse(relsXml);
        
        if (relsDoc.Relationships && relsDoc.Relationships.Relationship) {
          const relationships = relsDoc.Relationships.Relationship;
          const relArray = Array.isArray(relationships) ? relationships : [relationships];
          
          // 查找drawing关系
          const drawingRel = relArray.find(r => 
            r['@_Type'] === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing'
          );
          
          if (drawingRel && drawingRel['@_Target']) {
            drawingPath = `xl/drawings/${drawingRel['@_Target']}`;
          }
        }
      }
    } catch (relsError) {
      console.warn('解析drawing关系时出错:', relsError);
    }
    
    // 如果没有找到drawing路径，尝试默认路径
    if (!drawingPath) {
      drawingPath = `xl/drawings/drawing${sheetIndex}.xml`;
    }
    
    // 解析DrawingML
    if (zip.file(drawingPath)) {
      const filterOpts = {
        includeText: true,
        includeImages: true,
        includeShapes: true
      };
      
      const drawingResults = await DrawingML.parseDrawingML(zip, drawingPath, dims, filterOpts);
      
      // 处理文本结果
      if (drawingResults.texts && drawingResults.texts.length > 0) {
        for (const textItem of drawingResults.texts) {
          drawingTexts.push({
            text: textItem.text,
            x: textItem.x,
            y: textItem.y,
            width: textItem.width,
            height: textItem.height,
            fontSize: textItem.fontSize,
            fontFamily: textItem.fontFamily,
            color: textItem.color
          });
        }
      }
      
      // 处理图片结果
      if (drawingResults.images && drawingResults.images.length > 0) {
        for (const imageItem of drawingResults.images) {
          // 尝试从工作簿获取图片数据
          if (imageItem.rId && workbook) {
            try {
              const workbook = worksheet._workbook;
              let imageData = null;
              
              // 尝试多种方式获取图片数据
              if (workbook.getImage) {
                imageData = await workbook.getImage(imageItem.rId);
              } else if (workbook.images && workbook.images[imageItem.rId]) {
                imageData = workbook.images[imageItem.rId];
              } else if (workbook._media && workbook._media[imageItem.rId]) {
                imageData = workbook._media[imageItem.rId];
              }
              
              if (imageData) {
                drawingImages.push({
                  ...imageItem,
                  imageData: imageData
                });
              }
            } catch (imageError) {
              console.warn('获取图片数据时出错:', imageError);
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('提取DrawingML元素时出错:', error);
  }

  return {
    texts: drawingTexts,
    images: drawingImages
  };
}
