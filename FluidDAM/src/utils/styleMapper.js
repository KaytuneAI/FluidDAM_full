import { createSafeRichText } from './textFitUtils.js';

/**
 * 将十六进制颜色映射到TLDraw支持的颜色名称
 * @param {string} hexColor - 十六进制颜色值
 * @returns {string} TLDraw颜色名称
 */
export function mapColorToTLDraw(hexColor) {
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
export function mapFontSizeToTLDraw(pt) {
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
 * 创建安全的富文本格式，避免空文本节点错误
 * @param {string} text - 原始文本
 * @returns {Object} 安全的富文本格式
 */
export function createSafeRichTextStyle(text) {
  return createSafeRichText(text);
}

/**
 * 压缩图片到指定大小以内
 * @param {string} base64String - 原始Base64字符串
 * @param {number} maxSizeKB - 最大文件大小（KB）
 * @param {string} mimeType - 图片MIME类型
 * @returns {Promise<string>} 压缩后的Base64字符串
 */
export async function compressImage(base64String, maxSizeKB = 100, mimeType = 'image/png') {
  try {
    // 计算原始文件大小
    const originalSizeKB = Math.round((base64String.length * 3) / 4 / 1024);
    console.log(`原始图片大小: ${originalSizeKB}KB`);
    
    // 如果已经小于目标大小，直接返回
    if (originalSizeKB <= maxSizeKB) {
      console.log(`图片已小于${maxSizeKB}KB，无需压缩`);
      return base64String;
    }
    
    // 创建图片对象
    const img = new Image();
    const imageUrl = `data:${mimeType};base64,${base64String}`;
    
    return new Promise((resolve, reject) => {
      img.onload = () => {
        try {
          // 使用迭代压缩确保达到目标大小
          let quality = 0.8;
          let newWidth = img.width;
          let newHeight = img.height;
          let compressedBase64 = '';
          let compressedSizeKB = originalSizeKB;
          
          // 首先尝试调整尺寸
          const sizeRatio = Math.sqrt(maxSizeKB / originalSizeKB);
          newWidth = Math.round(img.width * sizeRatio);
          newHeight = Math.round(img.height * sizeRatio);
          
          console.log(`初始压缩: ${img.width}x${img.height} -> ${newWidth}x${newHeight}`);
          
          // 迭代调整质量直到达到目标大小
          while (compressedSizeKB > maxSizeKB && quality > 0.1) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = newWidth;
            canvas.height = newHeight;
            
            // 绘制压缩后的图片
            ctx.drawImage(img, 0, 0, newWidth, newHeight);
            
            // 转换为Base64
            compressedBase64 = canvas.toDataURL(mimeType, quality).split(',')[1];
            compressedSizeKB = Math.round((compressedBase64.length * 3) / 4 / 1024);
            
            console.log(`质量 ${quality.toFixed(2)}: ${compressedSizeKB}KB`);
            
            if (compressedSizeKB > maxSizeKB) {
              quality -= 0.1;
              // 如果质量调整还不够，进一步缩小尺寸
              if (quality <= 0.1) {
                newWidth = Math.round(newWidth * 0.8);
                newHeight = Math.round(newHeight * 0.8);
                quality = 0.8;
                console.log(`进一步缩小尺寸: ${newWidth}x${newHeight}`);
              }
            }
          }
          
          console.log(`最终压缩结果: ${compressedSizeKB}KB (目标: ${maxSizeKB}KB)`);
          console.log(`压缩率: ${((1 - compressedSizeKB / originalSizeKB) * 100).toFixed(1)}%`);
          
          resolve(compressedBase64);
        } catch (error) {
          console.warn('图片压缩失败，使用原始图片:', error);
          resolve(base64String);
        }
      };
      
      img.onerror = () => {
        console.warn('图片加载失败，使用原始Base64');
        resolve(base64String);
      };
      
      img.src = imageUrl;
    });
  } catch (error) {
    console.warn('图片压缩过程出错，使用原始图片:', error);
    return base64String;
  }
}

/**
 * 解析Excel单元格颜色
 * @param {Object} color - ExcelJS颜色对象
 * @returns {string} 十六进制颜色值
 */
export function parseExcelColor(color) {
  if (!color) return '#FFFFFF';
  
  // 处理ARGB格式
  if (color.argb) {
    const argb = color.argb;
    if (argb.length === 8) {
      // 移除alpha通道，只保留RGB
      return '#' + argb.substr(2);
    } else if (argb.length === 6) {
      return '#' + argb;
    }
  }
  
  // 处理主题颜色
  if (color.theme !== undefined) {
    // 这里可以根据Excel主题颜色映射表进行转换
    // 暂时返回默认颜色
    return '#000000';
  }
  
  // 处理RGB格式
  if (color.rgb) {
    return '#' + color.rgb;
  }
  
  // 处理其他格式
  if (typeof color === 'string') {
    return color.startsWith('#') ? color : '#' + color;
  }
  
  return '#FFFFFF'; // 默认白色
}

/**
 * 解析Excel字体样式
 * @param {Object} font - ExcelJS字体对象
 * @returns {Object} TLDraw字体样式
 */
export function parseExcelFont(font) {
  const style = {
    size: 'm',
    color: 'black',
    font: 'draw'
  };
  
  if (!font) return style;
  
  // 字号
  if (font.size) {
    style.size = mapFontSizeToTLDraw(font.size);
  }
  
  // 颜色
  if (font.color) {
    const hexColor = parseExcelColor(font.color);
    style.color = mapColorToTLDraw(hexColor);
  }
  
  // 字体族
  if (font.name) {
    // TLDraw支持的字体族有限，这里可以根据需要映射
    const fontName = font.name.toLowerCase();
    if (fontName.includes('serif')) {
      style.font = 'serif';
    } else if (fontName.includes('mono')) {
      style.font = 'mono';
    } else {
      style.font = 'draw'; // 默认字体
    }
  }
  
  return style;
}

/**
 * 解析Excel边框样式
 * @param {Object} border - ExcelJS边框对象
 * @returns {Object} TLDraw边框样式
 */
export function parseExcelBorder(border) {
  const style = {
    color: 'black',
    size: 's',
    dash: 'draw'
  };
  
  if (!border) return style;
  
  // 颜色
  if (border.color) {
    const hexColor = parseExcelColor(border.color);
    style.color = mapColorToTLDraw(hexColor);
  }
  
  // 线宽
  if (border.style) {
    // 根据Excel边框样式映射到TLDraw线宽
    switch (border.style) {
      case 'thin':
        style.size = 's';
        break;
      case 'medium':
        style.size = 'm';
        break;
      case 'thick':
        style.size = 'l';
        break;
      default:
        style.size = 's';
    }
  }
  
  return style;
}

/**
 * 解析Excel填充样式
 * @param {Object} fill - ExcelJS填充对象
 * @returns {Object} TLDraw填充样式
 */
export function parseExcelFill(fill) {
  const style = {
    color: 'white',
    type: 'solid'
  };
  
  if (!fill) return style;
  
  // 填充类型
  if (fill.type) {
    style.type = fill.type;
  }
  
  // 填充颜色
  if (fill.fgColor) {
    const hexColor = parseExcelColor(fill.fgColor);
    style.color = mapColorToTLDraw(hexColor);
  }
  
  return style;
}
