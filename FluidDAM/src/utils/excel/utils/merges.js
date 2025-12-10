/**
 * 合并单元格相关工具函数
 */

import { getCellPixelBoundsPrecise } from './geometry.js';

/**
 * 将列字母转换为数字
 * @param {string} columnLetter - 列字母（如'A', 'AB'）
 * @returns {number} 列号（1-based）
 */
export function columnLetterToNumber(columnLetter) {
  let result = 0;
  for (let i = 0; i < columnLetter.length; i++) {
    result = result * 26 + (columnLetter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return result;
}

/**
 * 获取合并单元格信息
 * @param {Object} worksheet - Excel工作表
 * @returns {Array} 合并单元格数组
 */
export function getMergedCells(worksheet) {
  const mergedCells = [];
  
  try {
    // 尝试从worksheet.model.merges获取
    if (worksheet.model && worksheet.model.merges) {
      let merges = [];
      
      // 处理不同的merges格式
      if (Array.isArray(worksheet.model.merges)) {
        merges = worksheet.model.merges;
      } else if (worksheet.model.merges.merges && Array.isArray(worksheet.model.merges.merges)) {
        merges = worksheet.model.merges.merges;
      }
      
      if (merges && merges.length > 0) {
        for (const merge of merges) {
          try {
            let top, left, bottom, right;
            
            if (typeof merge === 'string') {
              // 处理字符串格式的合并范围，如 "A1:C3"
              const match = merge.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
              if (match) {
                const [, leftCol, topRow, rightCol, bottomRow] = match;
                left = columnLetterToNumber(leftCol);
                top = parseInt(topRow);
                right = columnLetterToNumber(rightCol);
                bottom = parseInt(bottomRow);
              } else {
                continue; // 跳过无法解析的格式
              }
            } else if (typeof merge === 'object' && merge.top !== undefined) {
              // 处理对象格式的合并范围
              top = merge.top;
              left = merge.left;
              bottom = merge.bottom;
              right = merge.right;
            } else {
              continue; // 跳过无法识别的格式
            }
            
            // 验证合并范围的有效性
            if (top && left && bottom && right && 
                top <= bottom && left <= right &&
                top > 0 && left > 0 && bottom > 0 && right > 0) {
              
              // 计算合并单元格的像素边界
              const topLeft = getCellPixelBoundsPrecise(top, left, worksheet);
              const bottomRight = getCellPixelBoundsPrecise(bottom + 1, right + 1, worksheet);
              
              mergedCells.push({
                top,
                left,
                bottom,
                right,
                width: bottomRight.x - topLeft.x,
                height: bottomRight.y - topLeft.y,
                x: topLeft.x,
                y: topLeft.y
              });
            }
          } catch (mergeError) {
            console.warn('解析合并单元格时出错:', mergeError, merge);
            continue;
          }
        }
      }
    }
  } catch (error) {
    console.warn('获取合并单元格信息时出错:', error);
  }
  
  return mergedCells;
}

/**
 * 检查指定位置是否在合并单元格中
 * @param {number} row - 行号（1-based）
 * @param {number} col - 列号（1-based）
 * @param {Array} mergedCells - 合并单元格数组
 * @returns {Object|null} 合并单元格信息或null
 */
export function isInMergedCell(row, col, mergedCells) {
  return mergedCells.find(m => 
    row >= m.top && row <= m.bottom && col >= m.left && col <= m.right
  ) || null;
}
