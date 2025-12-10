/**
 * 单位换算工具函数
 * 处理Excel单位到像素的转换
 */

/**
 * 单位换算：行高 points -> px
 * @param {number} points - 行高（points）
 * @returns {number} 像素值
 */
export function pointsToPx(points) {
  return points * 96 / 72;
}

/**
 * 单位换算：列宽 Excel width -> px
 * @param {number} width - Excel列宽
 * @returns {number} 像素值
 */
export function columnWidthToPx(width) {
  // Excel列宽近似换算公式（Calibri 11下较稳）
  // 改进：保留浮点数精度以避免累积误差导致图片裁剪
  return (width + 0.12) * 7;
}

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
 * 简化的单元格像素边界计算（使用偏移量数组）
 * @param {number} row - 行号（1-based）
 * @param {number} col - 列号（1-based）
 * @param {Object} worksheet - Excel工作表
 * @returns {Object} {x, y, width, height}
 */
export function getCellPixelBounds(row, col, worksheet) {
  const { colOffsets, rowOffsets } = calculateOffsets(worksheet);
  
  // 使用偏移量数组快速计算
  const x = colOffsets[col - 1] || 0;
  const y = rowOffsets[row - 1] || 0;
  
  // 计算当前单元格的宽高
  const colObj = worksheet.getColumn(col);
  const rowObj = worksheet.getRow(row);
  const width = columnWidthToPx((colObj && colObj.width) ? colObj.width : 8.43);
  const height = pointsToPx((rowObj && rowObj.height) ? rowObj.height : 15);

  return { x, y, width, height };
}

/**
 * 列字母转数字
 * @param {string} columnLetter - 列字母（如 "A", "B", "AA"）
 * @returns {number} 列号（1-based）
 */
export function columnLetterToNumber(columnLetter) {
  let result = 0;
  for (let i = 0; i < columnLetter.length; i++) {
    result = result * 26 + (columnLetter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return result;
}
