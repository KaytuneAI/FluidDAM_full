/**
 * 颜色与字号映射相关工具函数
 */

import { createSafeRichText } from '../../textFitUtils.js';

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
    'ff00ff': 'magenta',
    '00ffff': 'cyan',
    '800000': 'red',
    '008000': 'green',
    '000080': 'blue',
    '808000': 'yellow',
    '800080': 'magenta',
    '008080': 'cyan',
    'c0c0c0': 'light-gray',
    '808080': 'gray',
    'ffa500': 'orange',
    'ffc0cb': 'pink',
    'a52a2a': 'brown',
    '000000': 'black',
    'ffffff': 'white'
  };
  
  // 直接匹配
  if (colorMap[hex]) {
    return colorMap[hex];
  }
  
  // 近似匹配（简化版）
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // 根据RGB值判断颜色
  if (r > 200 && g < 100 && b < 100) return 'red';
  if (r < 100 && g > 200 && b < 100) return 'green';
  if (r < 100 && g < 100 && b > 200) return 'blue';
  if (r > 200 && g > 200 && b < 100) return 'yellow';
  if (r > 200 && g < 100 && b > 200) return 'magenta';
  if (r < 100 && g > 200 && b > 200) return 'cyan';
  if (r > 150 && g > 150 && b > 150) return 'light-gray';
  if (r < 100 && g < 100 && b < 100) return 'black';
  
  // 默认返回黑色
  return 'black';
}

/**
 * 将pt字号映射到TLDraw v3的size值
 * @param {number} pt - 字号（pt）
 * @returns {string} TLDraw v3的size值
 */
export function mapFontSizeToTLDraw(pt) {
  // 强制所有字体都使用中号(m) - 对应12px
  return 'm';
}

// 重新导出createSafeRichText函数
export { createSafeRichText };
