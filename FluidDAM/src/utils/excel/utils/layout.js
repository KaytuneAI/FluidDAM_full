/**
 * 布局分析相关工具函数
 */

/**
 * 分析布局结构
 * @param {Object} worksheet - Excel工作表
 * @param {Array} images - 图片数组
 * @returns {Object} 布局信息
 */
export function analyzeLayoutStructure(worksheet, images = []) {
  const layoutInfo = {
    rowCount: 0,
    colCount: 0,
    avgRowHeight: 0,
    avgColWidth: 0,
    largeRows: [],
    largeCols: [],
    imagePositions: [],
    rows: [],
    cols: [],
    spacing: null,
    clusters: [],
    scaleFactors: null
  };

  try {
    // 获取基本行列信息
    const rowCount = worksheet.rowCount || 100;
    const colCount = worksheet.columnCount || 50;
    layoutInfo.rowCount = rowCount;
    layoutInfo.colCount = colCount;

    // 分析行列尺寸
    const rowHeights = [];
    const colWidths = [];

    // 收集行高信息
    for (let row = 1; row <= rowCount; row++) {
      const rowHeight = worksheet.getRow(row)?.height || 15;
      rowHeights.push({ row, height: rowHeight });
    }

    // 收集列宽信息
    for (let col = 1; col <= colCount; col++) {
      const colWidth = worksheet.getColumn(col)?.width || 64;
      colWidths.push({ col, width: colWidth });
    }

    // 计算平均尺寸
    const avgRowHeight = rowHeights.reduce((sum, r) => sum + r.height, 0) / rowHeights.length;
    const avgColWidth = colWidths.reduce((sum, c) => sum + c.width, 0) / colWidths.length;
    layoutInfo.avgRowHeight = avgRowHeight;
    layoutInfo.avgColWidth = avgColWidth;

    // 识别大尺寸行列
    const largeRows = rowHeights.filter(r => r.height > avgRowHeight * 1.5);
    const largeCols = colWidths.filter(c => c.width > avgColWidth * 1.5);
    layoutInfo.largeRows = largeRows;
    layoutInfo.largeCols = largeCols;

    // 如果有图片，分析图片布局
    if (images.length > 0) {
      // 转换图片位置信息
      const imagePositions = images.map(img => ({
        x: img.x || 0,
        y: img.y || 0,
        width: img.width || 0,
        height: img.height || 0,
        type: 'image'
      }));
      layoutInfo.imagePositions = imagePositions;

      // 按行分组
      const rows = groupElementsByRow(imagePositions);
      layoutInfo.rows = rows;

      // 按列分组
      const cols = groupElementsByColumn(imagePositions);
      layoutInfo.cols = cols;

      // 计算间距
      const spacing = calculateElementSpacing(imagePositions, rows, cols);
      layoutInfo.spacing = spacing;

      // 识别聚类
      const clusters = identifyElementClusters(imagePositions);
      layoutInfo.clusters = clusters;

      // 计算缩放因子
      const scaleFactors = calculateScaleFactors(imagePositions, avgRowHeight, avgColWidth);
      layoutInfo.scaleFactors = scaleFactors;
    }
  } catch (error) {
    console.warn('分析布局结构时出错:', error);
  }

  return layoutInfo;
}

/**
 * 按行分组元素
 * @param {Array} elements - 元素数组
 * @returns {Array} 按行分组的元素
 */
export function groupElementsByRow(elements) {
  const rows = [];
  const tolerance = 50; // 容差范围

  for (const element of elements) {
    let foundRow = false;
    
    // 检查是否属于现有行
    for (const row of rows) {
      if (Math.abs(element.y - row.y) <= tolerance) {
        row.elements.push(element);
        row.avgHeight = (row.avgHeight + element.height) / 2;
        foundRow = true;
        break;
      }
    }
    
    // 如果不属于任何现有行，创建新行
    if (!foundRow) {
      rows.push({
        y: element.y,
        avgHeight: element.height,
        elements: [element]
      });
    }
  }

  // 按Y坐标排序
  rows.sort((a, b) => a.y - b.y);
  return rows;
}

/**
 * 按列分组元素
 * @param {Array} elements - 元素数组
 * @returns {Array} 按列分组的元素
 */
export function groupElementsByColumn(elements) {
  const cols = [];
  const tolerance = 50; // 容差范围

  for (const element of elements) {
    let foundCol = false;
    
    // 检查是否属于现有列
    for (const col of cols) {
      if (Math.abs(element.x - col.x) <= tolerance) {
        col.elements.push(element);
        col.avgWidth = (col.avgWidth + element.width) / 2;
        foundCol = true;
        break;
      }
    }
    
    // 如果不属于任何现有列，创建新列
    if (!foundCol) {
      cols.push({
        x: element.x,
        avgWidth: element.width,
        elements: [element]
      });
    }
  }

  // 按X坐标排序
  cols.sort((a, b) => a.x - b.x);
  return cols;
}

/**
 * 计算元素间距
 * @param {Array} elements - 元素数组
 * @param {Array} rows - 行分组
 * @param {Array} cols - 列分组
 * @returns {Object} 间距信息
 */
export function calculateElementSpacing(elements, rows, cols) {
  const spacing = {
    horizontal: [],
    vertical: []
  };

  // 计算水平间距（同行内元素间距）
  for (const row of rows) {
    if (row.elements.length > 1) {
      for (let i = 0; i < row.elements.length - 1; i++) {
        const current = row.elements[i];
        const next = row.elements[i + 1];
        const gap = next.x - (current.x + current.width);
        if (gap > 0) {
          spacing.horizontal.push(gap);
        }
      }
    }
  }

  // 计算垂直间距（行间间距）
  for (let i = 0; i < rows.length - 1; i++) {
    const currentRow = rows[i];
    const nextRow = rows[i + 1];
    const gap = nextRow.y - (currentRow.y + currentRow.avgHeight);
    if (gap > 0) {
      spacing.vertical.push(gap);
    }
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
 * 识别元素聚类
 * @param {Array} elements - 元素数组
 * @returns {Array} 聚类数组
 */
export function identifyElementClusters(elements) {
  const clusters = [];
  const visited = new Set();
  const clusterThreshold = 100; // 聚类阈值

  for (let i = 0; i < elements.length; i++) {
    if (visited.has(i)) continue;
    
    const cluster = [elements[i]];
    visited.add(i);
    
    // 查找相邻元素
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
    
    // 如果聚类包含多个元素，添加到结果中
    if (cluster.length > 1) {
      clusters.push(cluster);
    }
  }

  return clusters;
}

/**
 * 计算缩放因子
 * @param {Array} elements - 元素数组
 * @param {number} avgRowHeight - 平均行高
 * @param {number} avgColWidth - 平均列宽
 * @returns {Object} 缩放因子信息
 */
export function calculateScaleFactors(elements, avgRowHeight, avgColWidth) {
  // 计算元素尺寸与平均单元格尺寸的比例
  const sizeRatios = elements.map(el => ({
    widthRatio: el.width / avgColWidth,
    heightRatio: el.height / avgRowHeight
  }));

  // 计算平均比例
  const avgWidthRatio = sizeRatios.reduce((sum, r) => sum + r.widthRatio, 0) / sizeRatios.length;
  const avgHeightRatio = sizeRatios.reduce((sum, r) => sum + r.heightRatio, 0) / sizeRatios.length;

  return {
    avgWidthRatio,
    avgHeightRatio,
    sizeRatios
  };
}
