/**
 * Excel样式处理模块
 * 负责处理Excel样式到TLDraw的映射和转换
 */

/**
 * Excel样式处理器类
 */
export class ExcelStyleProcessor {
  constructor(dependencies = {}) {
    this.dependencies = dependencies;
  }

  /**
   * 将十六进制颜色映射到TLDraw支持的颜色名称
   * @param {string} hexColor - 十六进制颜色值
   * @returns {string} TLDraw颜色名称
   */
  mapColorToTLDraw(hexColor) {
    if (!hexColor || typeof hexColor !== 'string') return 'black';
    
    // 移除#号并转换为小写
    const hex = hexColor.replace('#', '').toLowerCase();
    
    // 常见颜色映射
    const colorMap = {
      '000000': 'black',
      'ffffff': 'white',
      'ff0000': 'red',
      '00ff00': 'green',
      '0000ff': 'blue',
      'ffff00': 'yellow',
      'ffa500': 'orange',
      '800080': 'violet',
      'ffc0cb': 'light-red',
      '90ee90': 'light-green',
      'add8e6': 'light-blue',
      'dda0dd': 'light-violet',
      '808080': 'grey'
    };
    
    // 精确匹配
    if (colorMap[hex]) {
      return colorMap[hex];
    }
    
    // 根据颜色值进行近似匹配
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // 计算亮度
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    
    if (brightness < 50) return 'black';
    if (brightness > 200) return 'white';
    
    // 根据RGB值判断主要颜色
    if (r > g && r > b) return 'red';
    if (g > r && g > b) return 'green';
    if (b > r && b > g) return 'blue';
    if (r > 200 && g > 200 && b < 100) return 'yellow';
    if (r > 200 && g > 100 && b < 100) return 'orange';
    
    return 'black'; // 默认返回黑色
  }

  /**
   * 将pt字号映射到TLDraw v3的size值
   * @param {number} pt - 字号（pt）
   * @returns {string} TLDraw v3的size值
   */
  mapFontSizeToTLDraw(pt) {
    if (!pt || pt <= 0) return 's';
    
    // TLDraw v3的size映射规则
    // 根据TLDraw官方文档，size值对应的大致字号：
    // s: 小号 (约8-10pt)
    // m: 中号 (约12-14pt) 
    // l: 大号 (约16-18pt)
    // xl: 超大号 (约20pt+)
    
    if (pt <= 10) return 's';
    if (pt <= 14) return 'm';
    if (pt <= 18) return 'l';
    return 'xl';
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
    const backgrounds = [];
    const processedCells = new Set();
    
    try {
      worksheet.eachRow((row, rowNumber) => {
        try {
          row.eachCell((cell, colNumber) => {
            try {
              const cellKey = `${rowNumber}-${colNumber}`;
              
              if (processedCells.has(cellKey)) {
                return;
              }
              
              // 检查是否有背景色
              if (cell.fill && cell.fill.type === 'pattern' && cell.fill.pattern === 'solid') {
                const fillColor = this.parseExcelColor(cell.fill.fgColor);
                
                // 检查是否在合并单元格内
                const mergedCell = this.isInMergedCell(rowNumber, colNumber, mergedCells);
                
                if (mergedCell) {
                  const mergedCellKey = `${mergedCell.top}-${mergedCell.left}`;
                  if (processedCells.has(mergedCellKey)) {
                    return;
                  }
                  processedCells.add(mergedCellKey);
                  
                  // 标记合并单元格范围内的所有单元格为已处理
                  for (let r = mergedCell.top; r <= mergedCell.bottom; r++) {
                    for (let c = mergedCell.left; c <= mergedCell.right; c++) {
                      const cellKey = `${r}-${c}`;
                      processedCells.add(cellKey);
                    }
                  }
                  
                  backgrounds.push({
                    x: mergedCell.x,
                    y: mergedCell.y,
                    width: mergedCell.width,
                    height: mergedCell.height,
                    color: fillColor,
                    type: 'background'
                  });
                } else {
                  processedCells.add(cellKey);
                  const cellBounds = this.getCellPixelBoundsPrecise(rowNumber, colNumber, worksheet);
                  
                  backgrounds.push({
                    x: cellBounds.x,
                    y: cellBounds.y,
                    width: cellBounds.width,
                    height: cellBounds.height,
                    color: fillColor,
                    type: 'background'
                  });
                }
              }
            } catch (error) {
              console.warn(`处理单元格背景 ${rowNumber}-${colNumber} 失败:`, error);
            }
          });
        } catch (error) {
          console.warn(`处理行背景 ${rowNumber} 失败:`, error);
        }
      });
    } catch (error) {
      console.warn('提取单元格背景失败:', error);
    }
    
    return backgrounds;
  }

  /**
   * 提取表格框架
   * @param {Object} worksheet - Excel工作表
   * @param {Array} mergedCells - 合并单元格数组
   * @returns {Array} 框架信息数组
   */
  extractFrames(worksheet, mergedCells) {
    const frames = [];
    const processedCells = new Set();
    
    try {
      worksheet.eachRow((row, rowNumber) => {
        try {
          row.eachCell((cell, colNumber) => {
            try {
              const cellKey = `${rowNumber}-${colNumber}`;
              
              if (processedCells.has(cellKey)) {
                return;
              }
              
              // 检查是否有边框
              const hasBorder = cell && cell.border && (
                cell.border.top || cell.border.bottom || 
                cell.border.left || cell.border.right
              );
              
              if (hasBorder) {
                // 检查是否在合并单元格内
                const mergedCell = this.isInMergedCell(rowNumber, colNumber, mergedCells);
                
                if (mergedCell) {
                  const mergedCellKey = `${mergedCell.top}-${mergedCell.left}`;
                  if (processedCells.has(mergedCellKey)) {
                    return;
                  }
                  processedCells.add(mergedCellKey);
                  
                  frames.push({
                    x: mergedCell.x,
                    y: mergedCell.y,
                    width: mergedCell.width,
                    height: mergedCell.height,
                    type: 'frame'
                  });
                } else {
                  processedCells.add(cellKey);
                  const cellBounds = this.getCellPixelBoundsPrecise(rowNumber, colNumber, worksheet);
                  
                  frames.push({
                    x: cellBounds.x,
                    y: cellBounds.y,
                    width: cellBounds.width,
                    height: cellBounds.height,
                    type: 'frame'
                  });
                }
              }
            } catch (error) {
              console.warn(`处理单元格边框 ${rowNumber}-${colNumber} 失败:`, error);
            }
          });
        } catch (error) {
          console.warn(`处理行边框 ${rowNumber} 失败:`, error);
        }
      });
    } catch (error) {
      console.warn('提取表格框架失败:', error);
    }
    
    return frames;
  }

  /**
   * 创建安全的富文本格式，避免空文本节点错误
   * @param {string} text - 原始文本
   * @returns {Object} 安全的富文本格式
   */
  createSafeRichText(text) {
    if (!text || text.trim() === '') {
      return {
        text: ' ',
        children: []
      };
    }
    
    return {
      text: text.trim(),
      children: []
    };
  }

  // 使用依赖注入的方法
  isInMergedCell(row, col, mergedCells) {
    if (this.dependencies.isInMergedCell) {
      return this.dependencies.isInMergedCell(row, col, mergedCells);
    }
    throw new Error('isInMergedCell方法未提供');
  }

  getCellPixelBoundsPrecise(row, col, worksheet) {
    if (this.dependencies.getCellPixelBoundsPrecise) {
      return this.dependencies.getCellPixelBoundsPrecise(row, col, worksheet);
    }
    throw new Error('getCellPixelBoundsPrecise方法未提供');
  }
}
