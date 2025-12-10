/**
 * 布局分析工具
 * 处理Excel布局分析和元素分组功能
 */

/**
 * 动态分析Excel布局结构，自动识别元素间的关系和比例
 * @param {Object} worksheet - Excel工作表对象
 * @param {Array} images - 图片元素数组
 */
export function analyzeLayoutStructure(worksheet, images = []) {
  const layoutInfo = {
    cellDimensions: {},
    elementClusters: [],
    spacing: {},
    scaleFactors: {}
  };
  
  try {
    // 1. 分析单元格尺寸分布
    const rowCount = worksheet.rowCount || 100;
    const colCount = worksheet.columnCount || 50;
    
    const rowHeights = [];
    const colWidths = [];
    
    // 收集所有行高和列宽
    for (let row = 1; row <= Math.min(rowCount, 100); row++) {
      const rowHeight = worksheet.getRow(row)?.height || 15;
      rowHeights.push({ row, height: rowHeight });
    }
    
    for (let col = 1; col <= Math.min(colCount, 50); col++) {
      const colWidth = worksheet.getColumn(col)?.width || 64;
      colWidths.push({ col, width: colWidth });
    }
    
    // 计算统计信息
    const avgRowHeight = rowHeights.reduce((sum, r) => sum + r.height, 0) / rowHeights.length;
    const avgColWidth = colWidths.reduce((sum, c) => sum + c.width, 0) / colWidths.length;
    
    // 识别异常大小的行/列（可能是图片区域）
    const largeRows = rowHeights.filter(r => r.height > avgRowHeight * 1.5);
    const largeCols = colWidths.filter(c => c.width > avgColWidth * 1.5);
    
    layoutInfo.cellDimensions = {
      avgRowHeight,
      avgColWidth,
      totalRows: rowCount,
      totalCols: colCount,
      largeRows,
      largeCols
    };
    
    // 2. 分析图片元素的空间分布
    if (images.length > 0) {
      const imagePositions = images.map(img => ({
        x: img.x,
        y: img.y,
        width: img.width,
        height: img.height,
        row: img.row || 0,
        col: img.col || 0
      }));
      
      // 按Y坐标分组（识别水平行）
      const rows = groupElementsByRow(imagePositions);
      
      // 按X坐标分组（识别垂直列）
      const cols = groupElementsByColumn(imagePositions);
      
      // 计算元素间的间距
      const spacing = calculateElementSpacing(imagePositions, rows, cols);
      
      // 识别元素簇（相近的元素）
      const clusters = identifyElementClusters(imagePositions);
      
      layoutInfo.elementClusters = clusters;
      layoutInfo.spacing = spacing;
      layoutInfo.rows = rows;
      layoutInfo.cols = cols;
      
      // 3. 计算缩放因子
      layoutInfo.scaleFactors = calculateScaleFactors(imagePositions, avgRowHeight, avgColWidth);
    }
    
    console.log('动态布局分析完成:', layoutInfo);
    
  } catch (error) {
    console.warn('动态布局分析失败:', error);
  }
  
  return layoutInfo;
}

/**
 * 按Y坐标分组元素（识别水平行）
 */
export function groupElementsByRow(elements) {
  const rows = [];
  const tolerance = 50; // 容差范围
  
  elements.sort((a, b) => a.y - b.y);
  
  for (const element of elements) {
    let foundRow = false;
    for (const row of rows) {
      if (Math.abs(element.y - row.y) <= tolerance) {
        row.elements.push(element);
        foundRow = true;
        break;
      }
    }
    if (!foundRow) {
      rows.push({
        y: element.y,
        elements: [element],
        avgHeight: element.height
      });
    }
  }
  
  // 计算每行的统计信息
  rows.forEach(row => {
    row.elements.sort((a, b) => a.x - b.x);
    row.avgHeight = row.elements.reduce((sum, el) => sum + el.height, 0) / row.elements.length;
    row.width = Math.max(...row.elements.map(el => el.x + el.width)) - Math.min(...row.elements.map(el => el.x));
  });
  
  return rows;
}

/**
 * 按X坐标分组元素（识别垂直列）
 */
export function groupElementsByColumn(elements) {
  const cols = [];
  const tolerance = 50; // 容差范围
  
  elements.sort((a, b) => a.x - b.x);
  
  for (const element of elements) {
    let foundCol = false;
    for (const col of cols) {
      if (Math.abs(element.x - col.x) <= tolerance) {
        col.elements.push(element);
        foundCol = true;
        break;
      }
    }
    if (!foundCol) {
      cols.push({
        x: element.x,
        elements: [element],
        avgWidth: element.width
      });
    }
  }
  
  // 计算每列的统计信息
  cols.forEach(col => {
    col.elements.sort((a, b) => a.y - b.y);
    col.avgWidth = col.elements.reduce((sum, el) => sum + el.width, 0) / col.elements.length;
    col.height = Math.max(...col.elements.map(el => el.y + el.height)) - Math.min(...col.elements.map(el => el.y));
  });
  
  return cols;
}

/**
 * 计算元素间的间距
 */
export function calculateElementSpacing(elements, rows, cols) {
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
export function identifyElementClusters(elements) {
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
export function calculateScaleFactors(elements, avgRowHeight, avgColWidth) {
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
 * 应用布局分析结果到元素
 */
export function applyLayoutAnalysis(elements, layoutInfo) {
  if (!layoutInfo.spacing || !layoutInfo.rows || !layoutInfo.cols) {
    return elements;
  }
  
  const adjustedElements = [];
  
  for (const element of elements) {
    const adjustedElement = { ...element };
    
    // 根据行列信息调整位置
    if (element.row && element.col) {
      const elementRow = layoutInfo.rows.find(row => 
        row.elements.some(el => el.row === element.row)
      );
      const elementCol = layoutInfo.cols.find(col => 
        col.elements.some(el => el.col === element.col)
      );
      
      if (elementRow && elementCol) {
        const rowIndex = layoutInfo.rows.indexOf(elementRow);
        const colIndex = layoutInfo.cols.indexOf(elementCol);
        
        // 应用间距调整
        if (colIndex > 0) {
          adjustedElement.x += layoutInfo.spacing.avgHorizontal * colIndex;
        }
        if (rowIndex > 0) {
          adjustedElement.y += layoutInfo.spacing.avgVertical * rowIndex;
        }
      }
    }
    
    adjustedElements.push(adjustedElement);
  }
  
  return adjustedElements;
}
