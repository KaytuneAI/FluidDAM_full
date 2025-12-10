import { columnLetterToNumber, getCellPixelBoundsPrecise } from './unitConversion.js';

/**
 * 处理合并单元格
 * @param {Object} worksheet - Excel工作表
 * @returns {Array} 合并单元格信息数组
 */
export function getMergedCells(worksheet) {
  const mergedCells = [];
  
  try {
    // 尝试不同的方式获取合并单元格信息
    let merges = [];
    
    if (worksheet.model && worksheet.model.merges) {
      merges = worksheet.model.merges;
      console.log('从worksheet.model.merges获取合并单元格:', merges);
    } else if (worksheet.merges) {
      merges = worksheet.merges;
      console.log('从worksheet.merges获取合并单元格:', merges);
    } else if (worksheet._merges) {
      merges = worksheet._merges;
      console.log('从worksheet._merges获取合并单元格:', merges);
    }
    
    console.log('找到的合并单元格数量:', merges.length);
    
    if (merges && merges.length > 0) {
      merges.forEach((merge, index) => {
        try {
          let top, left, bottom, right;
          
          // 处理字符串格式的合并单元格 (如 'D11:G12')
          if (typeof merge === 'string') {
            console.log(`处理字符串格式合并单元格: ${merge}`);
            const match = merge.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
            if (match) {
              const [, startCol, startRow, endCol, endRow] = match;
              left = columnLetterToNumber(startCol);
              top = parseInt(startRow);
              right = columnLetterToNumber(endCol);
              bottom = parseInt(endRow);
              console.log(`解析结果: 行${top}-${bottom}, 列${left}-${right}`);
            } else {
              console.warn(`无法解析合并单元格字符串: ${merge}`);
              return;
            }
          } else if (typeof merge === 'object' && merge.top !== undefined) {
            // 处理对象格式的合并单元格
            ({ top, left, bottom, right } = merge);
          } else {
            console.warn(`未知的合并单元格格式:`, merge);
            return;
          }
          
          console.log(`合并单元格 ${index}: 行${top}-${bottom}, 列${left}-${right}`);
          
          // 计算合并单元格的像素边界
          const topLeft = getCellPixelBoundsPrecise(top, left, worksheet);
          const bottomRight = getCellPixelBoundsPrecise(bottom + 1, right + 1, worksheet);
          
          mergedCells.push({
            top,
            left,
            bottom,
            right,
            x: topLeft.x,
            y: topLeft.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y,
            isMerged: true
          });
        } catch (error) {
          console.warn('处理合并单元格失败:', error);
        }
      });
    } else {
      console.log('未找到合并单元格信息');
    }
  } catch (error) {
    console.warn('获取合并单元格信息失败:', error);
  }
  
  console.log('最终合并单元格数组:', mergedCells);
  return mergedCells;
}

/**
 * 检查单元格是否在合并区域内
 * @param {number} row - 行号
 * @param {number} col - 列号
 * @param {Array} mergedCells - 合并单元格数组
 * @returns {Object|null} 合并单元格信息或null
 */
export function isInMergedCell(row, col, mergedCells) {
  return mergedCells.find(merge => 
    row >= merge.top && row <= merge.bottom &&
    col >= merge.left && col <= merge.right
  );
}

/**
 * 提取单元格背景色
 * @param {Object} worksheet - Excel工作表
 * @param {Array} mergedCells - 合并单元格数组
 * @returns {Array} 背景色元素数组
 */
export function extractCellBackgrounds(worksheet, mergedCells) {
  const backgrounds = [];
  
  try {
    // 遍历所有有内容的单元格
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        try {
          // 检查是否有背景色
          if (cell.fill && cell.fill.type === 'pattern' && cell.fill.pattern === 'solid') {
            const color = cell.fill.fgColor;
            if (color && color.argb && color.argb !== 'FFFFFFFF') {
              // 检查是否在合并单元格内
              const mergedCell = isInMergedCell(rowNumber, colNumber, mergedCells);
              
              if (mergedCell) {
                // 使用合并单元格的边界
                backgrounds.push({
                  type: 'background',
                  x: mergedCell.x,
                  y: mergedCell.y,
                  width: mergedCell.width,
                  height: mergedCell.height,
                  color: color.argb,
                  row: mergedCell.top,
                  col: mergedCell.left,
                  isMerged: true
                });
              } else {
                // 使用单个单元格的边界
                const bounds = getCellPixelBoundsPrecise(rowNumber, colNumber, worksheet);
                backgrounds.push({
                  type: 'background',
                  x: bounds.x,
                  y: bounds.y,
                  width: bounds.width,
                  height: bounds.height,
                  color: color.argb,
                  row: rowNumber,
                  col: colNumber,
                  isMerged: false
                });
              }
            }
          }
        } catch (error) {
          console.warn(`处理单元格背景失败 (${rowNumber}, ${colNumber}):`, error);
        }
      });
    });
  } catch (error) {
    console.warn('提取单元格背景失败:', error);
  }
  
  return backgrounds;
}

/**
 * 提取边框框架
 * @param {Object} worksheet - Excel工作表
 * @param {Array} mergedCells - 合并单元格数组
 * @returns {Array} 框架元素数组
 */
export function extractFrames(worksheet, mergedCells) {
  const frames = [];
  
  try {
    // 遍历所有有内容的单元格
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        try {
          // 检查是否有边框
          const hasBorder = cell.border && (
            cell.border.top || cell.border.bottom || 
            cell.border.left || cell.border.right
          );
          
          if (hasBorder) {
            // 检查是否在合并单元格内
            const mergedCell = isInMergedCell(rowNumber, colNumber, mergedCells);
            
            if (mergedCell) {
              // 使用合并单元格的边界
              frames.push({
                type: 'frame',
                x: mergedCell.x,
                y: mergedCell.y,
                width: mergedCell.width,
                height: mergedCell.height,
                row: mergedCell.top,
                col: mergedCell.left,
                isMerged: true,
                border: cell.border
              });
            } else {
              // 使用单个单元格的边界
              const bounds = getCellPixelBoundsPrecise(rowNumber, colNumber, worksheet);
              frames.push({
                type: 'frame',
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
                row: rowNumber,
                col: colNumber,
                isMerged: false,
                border: cell.border
              });
            }
          }
        } catch (error) {
          console.warn(`处理单元格边框失败 (${rowNumber}, ${colNumber}):`, error);
        }
      });
    });
  } catch (error) {
    console.warn('提取单元格边框失败:', error);
  }
  
  return frames;
}
