/**
 * 几何计算相关工具函数
 */

import { pointsToPx, columnWidthToPx } from './units.js';

/**
 * 计算行列偏移量数组，用于DrawingML解析
 * @param {Object} worksheet - Excel工作表
 * @returns {Object} { colOffsets: [], rowOffsets: [] }
 */
export function calculateOffsets(worksheet) {
  const colOffsets = [0]; // 第0列偏移为0
  const rowOffsets = [0]; // 第0行偏移为0
  
  // 计算列偏移量
  for (let col = 1; col <= (worksheet.columnCount || 50); col++) {
    const colObj = worksheet.getColumn(col);
    const colWidth = (colObj && colObj.width) ? colObj.width : 8.43;
    const prevOffset = colOffsets[colOffsets.length - 1];
    colOffsets.push(prevOffset + columnWidthToPx(colWidth));
  }
  
  // 计算行偏移量
  for (let row = 1; row <= (worksheet.rowCount || 100); row++) {
    const rowObj = worksheet.getRow(row);
    const rowHeight = (rowObj && rowObj.height) ? rowObj.height : 15;
    const prevOffset = rowOffsets[rowOffsets.length - 1];
    rowOffsets.push(prevOffset + pointsToPx(rowHeight));
  }
  
  return { colOffsets, rowOffsets };
}

/**
 * 更精确的单元格像素边界计算
 * @param {number} row - 行号（1-based）
 * @param {number} col - 列号（1-based）
 * @param {Object} worksheet - Excel工作表
 * @returns {Object} {x, y, width, height}
 */
export function getCellPixelBoundsPrecise(row, col, worksheet) {
  let x = 0;
  let y = 0;

  // 计算X坐标（累加前面所有列的宽度）
  for (let c = 1; c < col; c++) {
    const colObj = worksheet.getColumn(c);
    // 安全获取列宽，使用更精确的换算
    const colWidth = (colObj && colObj.width) ? colObj.width : 8.43;
    x += columnWidthToPx(colWidth);
  }

  // 计算Y坐标（累加前面所有行的高度）
  for (let r = 1; r < row; r++) {
    const rowObj = worksheet.getRow(r);
    // 安全获取行高，使用更精确的换算
    const rowHeight = (rowObj && rowObj.height) ? rowObj.height : 15;
    y += pointsToPx(rowHeight);
  }

  // 当前单元格的宽高
  const currentCol = worksheet.getColumn(col);
  const currentRow = worksheet.getRow(row);
  const width = columnWidthToPx((currentCol && currentCol.width) ? currentCol.width : 8.43);
  const height = pointsToPx((currentRow && currentRow.height) ? currentRow.height : 15);

  return { x, y, width, height };
}

/**
 * 获取单元格像素边界（简化版本）
 * @param {number} row - 行号（1-based）
 * @param {number} col - 列号（1-based）
 * @param {Object} worksheet - Excel工作表
 * @returns {Object} {x, y, width, height}
 */
export function getCellPixelBounds(row, col, worksheet) {
  let x = 0;
  let y = 0;
  let width = 0;
  let height = 0;

  // 计算X坐标（累加前面所有列的宽度）
  for (let c = 1; c < col; c++) {
    const colObj = worksheet.getColumn(c);
    // 安全获取列宽，使用更精确的换算
    const colWidth = (colObj && colObj.width) ? colObj.width : 8.43;
    x += columnWidthToPx(colWidth);
  }

  // 计算Y坐标（累加前面所有行的高度）
  for (let r = 1; r < row; r++) {
    const rowObj = worksheet.getRow(r);
    // 安全获取行高，使用更精确的换算
    const rowHeight = (rowObj && rowObj.height) ? rowObj.height : 15;
    y += pointsToPx(rowHeight);
  }

  // 当前单元格的宽高
  const currentCol = worksheet.getColumn(col);
  const currentRow = worksheet.getRow(row);
  width = columnWidthToPx((currentCol && currentCol.width) ? currentCol.width : 8.43);
  height = pointsToPx((currentRow && currentRow.height) ? currentRow.height : 15);

  return { x, y, width, height };
}
