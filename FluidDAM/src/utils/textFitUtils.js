// textFitUtils.js
// 文本自适应换行和字号缩放工具
import { toRichText } from 'tldraw';

// 把 pt 转 px（Excel 常用 pt）
export const pt2px = (pt) => Math.round(pt * (96 / 72));

// 把 px 转 pt
export const px2pt = (px) => Math.round(px * (72 / 96));

/**
 * 创建安全的富文本格式，避免空文本节点错误
 * @param {string} text - 原始文本
 * @returns {Object} 安全的富文本格式
 */
export function createSafeRichText(text) {
  // 确保文本不为空或无效
  const safeText = (text && typeof text === 'string' && text.trim()) ? text.trim() : ' ';
  
  // 使用TLDraw官方的toRichText函数
  try {
    return toRichText(safeText);
  } catch (error) {
    console.warn('toRichText失败，使用备用格式:', error);
    // 备用格式：确保至少有一个非空字符
    return {
      type: 'text',
      text: safeText || ' '
    };
  }
}

// 获取度量上下文（复用同一个canvas）
let measureContext = null;
function getMeasureContext(fontPx) {
  if (!measureContext) {
    const canvas = document.createElement('canvas');
    measureContext = canvas.getContext('2d');
  }
  measureContext.font = `${fontPx}px Arial, Helvetica, "Microsoft YaHei", "微软雅黑", "PingFang SC", "Hiragino Sans GB", "WenQuanYi Micro Hei", sans-serif`;
  return measureContext;
}

/**
 * 软换行点插入（解决长英文/驼峰/数字串不换行）
 * @param {string} text - 原始文本
 * @returns {string} 插入软换行点后的文本
 */
export function softenLongTokens(text) {
  if (!text || typeof text !== 'string') return text;
  
  return text
    // 驼峰边界：aA 或 A1 之间
    .replace(/([a-z])([A-Z])/g, '$1\u200B$2')
    .replace(/([A-Za-z])([0-9])/g, '$1\u200B$2')
    .replace(/([0-9])([A-Za-z])/g, '$1\u200B$2')
    // 连续20个以上的字母或数字，强行每10个插入 \u200B
    .replace(/([A-Za-z0-9]{20,})/g, (m) => m.replace(/(.{10})/g, '$1\u200B'));
}

/**
 * 布局文本行（逐词断行，中文按字、英文按词）
 * @param {string} text - 文本内容
 * @param {number} width - 容器宽度
 * @param {CanvasRenderingContext2D} ctx - 度量上下文
 * @returns {Array} 行数组
 */
export function layoutLines(text, width, ctx) {
  if (!text || !width || !ctx) return [text];
  
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width <= width) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // 单个词太长，强制换行
        lines.push(word);
        currentLine = '';
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

/**
 * 度量段落高度
 * @param {string} text - 文本内容
 * @param {number} width - 容器宽度
 * @param {number} fontPx - 字体大小（像素）
 * @param {number} lineHeight - 行高倍数
 * @returns {Object} { height, lines, linePx }
 */
export function measureParagraphHeight(text, width, fontPx, lineHeight = 1.35) {
  if (!text || !width || fontPx <= 0) {
    return { height: 0, lines: [], linePx: 0 };
  }
  
  // 1) 预处理：给"长英文/驼峰/数字串"插入软换行点
  const softened = softenLongTokens(text);
  
  // 2) 逐词断行，用 canvas measureText 量每行宽度
  const ctx = getMeasureContext(fontPx);
  const lines = layoutLines(softened, width, ctx);
  const linePx = Math.ceil(fontPx * lineHeight);
  
  return { 
    height: lines.length * linePx, 
    lines, 
    linePx 
  };
}

/**
 * 适配字号到容器
 * @param {string} text - 文本内容
 * @param {number} boxW - 容器宽度
 * @param {number} boxH - 容器高度
 * @param {number} basePt - 基础字号（pt）
 * @param {number} minPt - 最小字号（pt）
 * @param {number} lineHeight - 行高倍数
 * @returns {number} 适配后的字号（pt）
 */
export function fitFontSizeToBox(text, boxW, boxH, basePt, minPt = 8, lineHeight = 1.35) {
  if (!text || !boxW || !boxH || basePt <= 0) {
    return Math.max(minPt, 12); // 默认使用12px字体
  }
  
  let lo = minPt;
  let hi = basePt;
  let ok = minPt;
  
  // 添加一些容错空间，确保文本不会超出容器
  const tolerance = 2; // 2px容错
  const adjustedBoxH = boxH - tolerance;
  
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const fontPx = pt2px(mid);
    const { height } = measureParagraphHeight(text, boxW, fontPx, lineHeight);
    
    if (height <= adjustedBoxH) {
      ok = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  
  return ok; // 返回能装下的最大 pt
}

/**
 * 创建文本适配配置
 * @param {Object} element - 文本元素 {x, y, width, height, text, fontSize}
 * @param {Object} options - 选项 {basePt, minPt, lineHeight}
 * @returns {Object} 适配配置 {fontPx, linePx, softenedText, lines}
 */
export function createTextFitConfig(element, options = {}) {
  const {
    basePt = 12,  // 改为12px字体
    minPt = 8,
    lineHeight = 1.35
  } = options;
  
  const boxW = element.width;
  const boxH = element.height;
  const text = element.text || '';
  
  // 计算适配字号
  const fitPt = fitFontSizeToBox(text, boxW, boxH, basePt, minPt, lineHeight);
  const fontPx = pt2px(fitPt);
  const linePx = Math.ceil(fontPx * lineHeight);
  
  // 预处理文本
  const softenedText = softenLongTokens(text);
  
  // 计算行布局
  const ctx = getMeasureContext(fontPx);
  const lines = layoutLines(softenedText, boxW, ctx);
  
  return {
    fontPx,
    linePx,
    softenedText,
    lines,
    fitPt,
    originalPt: basePt
  };
}

/**
 * 后处理：缩窄并重新适配文本形状
 * @param {Object} editor - TLDraw编辑器实例
 * @param {string} shapeId - 形状ID
 * @param {number} targetW - 目标宽度
 * @param {Object} options - 选项
 */
export function shrinkAndRefitTextShape(editor, shapeId, targetW, options = {}) {
  const shape = editor.getShape(shapeId);
  if (!shape || shape.type !== 'text') {
    console.warn('形状不是文本类型或不存在:', shapeId);
    return;
  }
  
  // 从richText中提取文本内容
  const richText = shape.props.richText;
  const text = richText?.text || '';
  
  // 从TLDraw v3的size值反推pt值
  const sizeMap = { 's': 10, 'm': 14, 'l': 18, 'xl': 22 };
  const currentSize = shape.props.size || 'm';
  const basePt = sizeMap[currentSize] || 14;
  
  const { minPt = 8, lineHeight = 1.35 } = options;
  
  // 计算适配字号（不限制高度，给大值）
  const fitPt = fitFontSizeToBox(text, targetW, 1e6, basePt, minPt, lineHeight);
  
  // 映射pt值到TLDraw v3的size值
  const mapFontSizeToTLDraw = (pt) => {
    if (!pt || pt <= 0) return 's';
    if (pt <= 10) return 's';
    if (pt <= 14) return 'm';
    if (pt <= 18) return 'l';
    return 'xl';
  };
  
  // 更新形状
  editor.updateShape({
    id: shapeId,
    type: 'text',
    props: { 
      w: targetW, 
      size: mapFontSizeToTLDraw(fitPt),
      richText: createSafeRichText(softenLongTokens(text))
    }
  });
  
  // console.log(`文本形状 ${shapeId} 已缩窄到 ${targetW}px，字号从 ${basePt}pt 调整到 ${fitPt}pt`);
}
