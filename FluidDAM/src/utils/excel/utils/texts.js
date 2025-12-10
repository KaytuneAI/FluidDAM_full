/**
 * 文本处理相关工具函数
 */

import { isInMergedCell } from './merges.js';
import { getCellPixelBoundsPrecise } from './geometry.js';

/**
 * 提取文本
 * @param {Object} worksheet - Excel工作表
 * @param {Array} mergedCells - 合并单元格数组
 * @param {Array} images - 图片数组
 * @returns {Array} 文本数组
 */
export function extractTexts(worksheet, mergedCells, images) {
  const texts = [];
  const processedCells = new Set(); // 避免重复处理合并单元格

  try {
    // 遍历所有单元格
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        try {
          // 检查是否已经处理过
          const cellKey = `${rowNumber}-${colNumber}`;
          if (processedCells.has(cellKey)) {
            return;
          }

          // 检查单元格是否有值
          if (cell && cell.value) {
            // 检查是否在合并单元格中
            const mergedCell = isInMergedCell(rowNumber, colNumber, mergedCells);
            
            if (mergedCell) {
              // 处理合并单元格
              const mergedCellKey = `${mergedCell.top}-${mergedCell.left}`;
              if (processedCells.has(mergedCellKey)) {
                return;
              }
              processedCells.add(mergedCellKey);
              
              // 标记合并单元格内的所有单元格为已处理
              for (let r = mergedCell.top; r <= mergedCell.bottom; r++) {
                for (let c = mergedCell.left; c <= mergedCell.right; c++) {
                  const cellKey = `${r}-${c}`;
                  processedCells.add(cellKey);
                }
              }
              
              // 获取合并单元格的文本
              const mergedCellObj = worksheet.getCell(mergedCell.top, mergedCell.left);
              if (mergedCellObj && mergedCellObj.value) {
                const mergedText = mergedCellObj.value.toString().trim();
                if (mergedText) {
                  // 计算合并单元格的边界
                  const cellBounds = getCellPixelBoundsPrecise(mergedCell.top, mergedCell.left, worksheet);
                  
                  texts.push({
                    text: mergedText,
                    x: cellBounds.x,
                    y: cellBounds.y,
                    width: mergedCell.width,
                    height: mergedCell.height,
                    row: mergedCell.top,
                    col: mergedCell.left,
                    isMerged: true,
                    mergedRange: {
                      top: mergedCell.top,
                      left: mergedCell.left,
                      bottom: mergedCell.bottom,
                      right: mergedCell.right
                    }
                  });
                }
              }
            } else {
              // 处理普通单元格
              processedCells.add(cellKey);
              
              const cellText = cell.value.toString().trim();
              if (cellText) {
                // 计算单元格边界
                const cellBounds = getCellPixelBoundsPrecise(rowNumber, colNumber, worksheet);
                
                texts.push({
                  text: cellText,
                  x: cellBounds.x,
                  y: cellBounds.y,
                  width: cellBounds.width,
                  height: cellBounds.height,
                  row: rowNumber,
                  col: colNumber,
                  isMerged: false
                });
              }
            }
          }
        } catch (cellError) {
          console.warn(`处理单元格 ${rowNumber}-${colNumber} 时出错:`, cellError);
        }
      });
    });
  } catch (error) {
    console.warn('提取文本时出错:', error);
  }

  return texts;
}

/**
 * 从drawings中提取文本
 * @param {Array} drawings - drawings数组
 * @param {Array} images - 图片数组
 * @returns {Array} 文本数组
 */
export function extractTextFromDrawings(drawings, images) {
  const texts = [];
  
  try {
    for (const drawing of drawings) {
      const drawingTexts = extractTextFromSingleDrawing(drawing, images);
      texts.push(...drawingTexts);
    }
  } catch (error) {
    console.warn('从drawings提取文本时出错:', error);
  }
  
  return texts;
}

/**
 * 从单个drawing中提取文本
 * @param {Object} drawing - drawing对象
 * @param {Array} images - 图片数组
 * @returns {Array} 文本数组
 */
export function extractTextFromSingleDrawing(drawing, images) {
  const texts = [];
  
  try {
    if (!drawing || typeof drawing !== 'object') {
      return texts;
    }
    
    // 遍历drawing的所有属性
    for (const key in drawing) {
      const value = drawing[key];
      if (value && typeof value === 'object') {
        if (value.text || value.content || value.value) {
          const text = value.text || value.content || value.value;
          const textInfo = {
            text: text.toString(),
            x: value.x || 0,
            y: value.y || 0,
            width: value.width || 100,
            height: value.height || 20,
            fontSize: value.fontSize || 12,
            fontFamily: value.fontFamily || 'Arial',
            color: value.color || '#000000',
            source: 'drawing'
          };
          texts.push(textInfo);
        }
      }
    }
    
    // 检查textBox属性
    const textBox = drawing.textBox || drawing.textbox || drawing.text;
    if (textBox && textBox.text) {
      const textInfo = {
        text: textBox.text.toString(),
        x: textBox.x || 0,
        y: textBox.y || 0,
        width: textBox.width || 100,
        height: textBox.height || 20,
        fontSize: textBox.fontSize || 12,
        fontFamily: textBox.fontFamily || 'Arial',
        color: textBox.color || '#000000',
        source: 'textBox'
      };
      texts.push(textInfo);
    }
    
    // 检查shapes属性
    if (drawing.shape || drawing.shapes) {
      const shapes = Array.isArray(drawing.shapes) ? drawing.shapes : [drawing.shape];
      for (const shape of shapes) {
        if (shape && shape.text) {
          const textInfo = {
            text: shape.text.toString(),
            x: shape.x || 0,
            y: shape.y || 0,
            width: shape.width || 100,
            height: shape.height || 20,
            fontSize: shape.fontSize || 12,
            fontFamily: shape.fontFamily || 'Arial',
            color: shape.color || '#000000',
            source: 'shape'
          };
          texts.push(textInfo);
        }
      }
    }
  } catch (error) {
    console.warn('从单个drawing提取文本时出错:', error);
  }
  
  return texts;
}

/**
 * 从workbook中提取文本
 * @param {Object} workbook - workbook对象
 * @param {Array} images - 图片数组
 * @returns {Array} 文本数组
 */
export function extractTextFromWorkbook(workbook, images) {
  const texts = [];
  
  try {
    if (!workbook || typeof workbook !== 'object') {
      return texts;
    }
    
    // 检查可能的文本属性
    const possibleTextProperties = [
      'text', 'content', 'value', 'title', 'name', 'description',
      'header', 'footer', 'comment', 'note'
    ];
    
    for (const prop of possibleTextProperties) {
      if (workbook[prop]) {
        const textInfo = {
          text: workbook[prop].toString(),
          x: 0,
          y: 0,
          width: 200,
          height: 20,
          fontSize: 12,
          fontFamily: 'Arial',
          color: '#000000',
          source: `workbook.${prop}`
        };
        texts.push(textInfo);
      }
    }
  } catch (error) {
    console.warn('从workbook提取文本时出错:', error);
  }
  
  return texts;
}

/**
 * 从worksheet属性中提取文本
 * @param {Object} worksheet - worksheet对象
 * @param {Array} images - 图片数组
 * @returns {Array} 文本数组
 */
export function extractTextFromWorksheetProperties(worksheet, images) {
  const texts = [];
  
  try {
    if (!worksheet || typeof worksheet !== 'object') {
      return texts;
    }
    
    // 检查可能的文本属性
    const possibleTextProperties = [
      'text', 'content', 'value', 'title', 'name', 'description',
      'header', 'footer', 'comment', 'note'
    ];
    
    for (const prop of possibleTextProperties) {
      if (worksheet[prop]) {
        const textInfo = {
          text: worksheet[prop].toString(),
          x: 0,
          y: 0,
          width: 200,
          height: 20,
          fontSize: 12,
          fontFamily: 'Arial',
          color: '#000000',
          source: `worksheet.${prop}`
        };
        texts.push(textInfo);
      }
    }
    
    // 检查worksheet.model属性
    if (worksheet.model) {
      for (const prop of possibleTextProperties) {
        if (worksheet.model[prop]) {
          const textInfo = {
            text: worksheet.model[prop].toString(),
            x: 0,
            y: 0,
            width: 200,
            height: 20,
            fontSize: 12,
            fontFamily: 'Arial',
            color: '#000000',
            source: `worksheet.model.${prop}`
          };
          texts.push(textInfo);
        }
      }
    }
  } catch (error) {
    console.warn('从worksheet属性提取文本时出错:', error);
  }
  
  return texts;
}

/**
 * 提取矩形文本
 * @param {Object} worksheet - Excel工作表
 * @returns {Array} 矩形文本数组
 */
export function extractRectangleTexts(worksheet) {
  const rectangleTexts = [];
  
  try {
    // 遍历worksheet的所有属性
    for (const key in worksheet) {
      const value = worksheet[key];
      
      if (value && typeof value === 'object') {
        // 检查是否有子属性
        for (const subKey in value) {
          const subValue = value[subKey];
          
          if (subValue && typeof subValue === 'object') {
            // 检查是否是矩形对象
            if (subValue.x !== undefined && subValue.y !== undefined && 
                subValue.width !== undefined && subValue.height !== undefined) {
              
              // 检查是否有文本内容
              if (subValue.text || subValue.content || subValue.value) {
                const text = subValue.text || subValue.content || subValue.value;
                const textInfo = {
                  text: text.toString(),
                  x: subValue.x,
                  y: subValue.y,
                  width: subValue.width,
                  height: subValue.height,
                  fontSize: subValue.fontSize || 12,
                  fontFamily: subValue.fontFamily || 'Arial',
                  color: subValue.color || '#000000',
                  source: `worksheet.${key}.${subKey}`
                };
                rectangleTexts.push(textInfo);
              }
            }
          }
        }
      }
    }
    
    // 检查worksheet._workbook属性
    if (worksheet._workbook) {
      for (const key in worksheet._workbook) {
        const value = worksheet._workbook[key];
        
        if (value && typeof value === 'object') {
          // 检查是否有矩形对象
          if (value.x !== undefined && value.y !== undefined && 
              value.width !== undefined && value.height !== undefined) {
            
            // 检查是否有文本内容
            if (value.text || value.content || value.value) {
              const text = value.text || value.content || value.value;
              const textInfo = {
                text: text.toString(),
                x: value.x,
                y: value.y,
                width: value.width,
                height: value.height,
                fontSize: value.fontSize || 12,
                fontFamily: value.fontFamily || 'Arial',
                color: value.color || '#000000',
                source: `workbook.${key}`
              };
              rectangleTexts.push(textInfo);
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('提取矩形文本时出错:', error);
  }
  
  return rectangleTexts;
}

/**
 * 从矩形中提取文本
 * @param {Object} rectangle - 矩形对象
 * @param {Array} texts - 文本数组
 * @returns {Array} 提取的文本数组
 */
export function extractTextFromRectangle(rectangle, texts) {
  const extractedTexts = [];
  
  try {
    if (!rectangle || typeof rectangle !== 'object') {
      return extractedTexts;
    }
    
    // 检查矩形是否有文本内容
    if (rectangle.text || rectangle.content || rectangle.value) {
      const text = rectangle.text || rectangle.content || rectangle.value;
      const textInfo = {
        text: text.toString(),
        x: rectangle.x || 0,
        y: rectangle.y || 0,
        width: rectangle.width || 100,
        height: rectangle.height || 20,
        fontSize: rectangle.fontSize || 12,
        fontFamily: rectangle.fontFamily || 'Arial',
        color: rectangle.color || '#000000',
        source: 'rectangle'
      };
      extractedTexts.push(textInfo);
    }
    
    // 检查矩形内是否有其他文本对象
    for (const text of texts) {
      if (text.x >= rectangle.x && text.y >= rectangle.y &&
          text.x + text.width <= rectangle.x + rectangle.width &&
          text.y + text.height <= rectangle.y + rectangle.height) {
        extractedTexts.push(text);
      }
    }
  } catch (error) {
    console.warn('从矩形提取文本时出错:', error);
  }
  
  return extractedTexts;
}
