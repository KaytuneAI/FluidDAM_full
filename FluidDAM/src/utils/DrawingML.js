// DrawingML.js
// 负责解析 Excel .xlsx 中的 DrawingML (xl/drawings/drawing*.xml)
// 提取文本框、形状、图片的锚点和文字，返回可以直接生成 TLDraw shape 的数据

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

// EMU → 像素换算 (1 px = 9525 EMU at 96dpi)
const EMU_PER_PIXEL = 9525;
const EMU_PER_INCH = 914400;
const PX_PER_INCH = 96;

function emuToPx(value) {
  if (isNaN(value) || value === null || value === undefined) {
    return 0;
  }
  return Math.round(value / EMU_PER_PIXEL);
}

// 新增：EMU转像素的工具函数（支持undefined）
export function emuToPxSafe(emu) {
  return typeof emu === 'number' ? emu / EMU_PER_PIXEL : undefined;
}

// 新增：从网格坐标计算像素矩形
export function gridToPxRect(
  from, to, colWidthsPx, rowHeightsPx
) {
  // 累加列宽得到整列像素；行高同理
  const colOffsetPx = (col) => colWidthsPx.slice(0, Math.floor(col)).reduce((a,b)=>a+b,0);
  const rowOffsetPx = (row) => rowHeightsPx.slice(0, Math.floor(row)).reduce((a,b)=>a+b,0);

  const x1 = colOffsetPx(from.col) + (emuToPxSafe(from.oxEMU) ?? 0);
  const y1 = rowOffsetPx(from.row) + (emuToPxSafe(from.oyEMU) ?? 0);
  const x2 = colOffsetPx(to.col)   + (emuToPxSafe(to.oxEMU)   ?? 0);
  const y2 = rowOffsetPx(to.row)   + (emuToPxSafe(to.oyEMU)   ?? 0);

  return { 
    x: Math.round(x1), 
    y: Math.round(y1), 
    w: Math.max(1, Math.round(x2 - x1)), 
    h: Math.max(1, Math.round(y2 - y1)) 
  };
}

// 默认主题色（如果无法解析theme1.xml时使用）
const DEFAULT_THEME_COLORS = {
  'accent1': '#5B9BD5',
  'accent2': '#ED7D31', 
  'accent3': '#A5A5A5',
  'accent4': '#FFC000',
  'accent5': '#4472C4',
  'accent6': '#70AD47',
  'dark1': '#000000',
  'dark2': '#44546A',
  'light1': '#FFFFFF',
  'light2': '#E7E6E6',
  'tx1': '#000000',
  'tx2': '#44546A',
  'bg1': '#FFFFFF',
  'bg2': '#E7E6E6'
};

/**
 * 解析DrawingML的填充样式
 * @param {Object} spPr - 形状属性节点
 * @param {Object} theme - 主题色对象
 * @returns {Object} { fill: 'solid'|'none', color: '#rrggbb', opacity: 0-1 }
 */
function parseFillStyle(spPr, theme = {}) {
  if (!spPr) return { fill: 'none', color: '#FFFFFF', opacity: 1 };
  
  // 检查填充类型
  if (spPr['a:noFill']) {
    return { fill: 'none', color: '#FFFFFF', opacity: 0 };
  }
  
  if (spPr['a:solidFill']) {
    return parseSolidFill(spPr['a:solidFill'], theme);
  }
  
  if (spPr['a:gradFill']) {
    // 渐变填充，取第一个颜色作为主色
    const gradFill = spPr['a:gradFill'];
    if (gradFill['a:gsLst'] && gradFill['a:gsLst']['a:gs']) {
      const firstGs = Array.isArray(gradFill['a:gsLst']['a:gs']) 
        ? gradFill['a:gsLst']['a:gs'][0] 
        : gradFill['a:gsLst']['a:gs'];
      if (firstGs['a:srgbClr'] || firstGs['a:schemeClr']) {
        return parseSolidFill(firstGs, theme);
      }
    }
  }
  
  if (spPr['a:blipFill']) {
    // 图片填充，使用默认背景色
    return { fill: 'solid', color: '#F0F0F0', opacity: 1 };
  }
  
  return { fill: 'none', color: '#FFFFFF', opacity: 1 };
}

/**
 * 解析DrawingML的描边样式
 * @param {Object} spPr - 形状属性节点
 * @param {Object} theme - 主题色对象
 * @returns {Object} { stroke: 'solid'|'none', color: '#rrggbb', width: number }
 */
function parseStrokeStyle(spPr, theme = {}) {
  if (!spPr || !spPr['a:ln']) {
    return { stroke: 'none', color: '#000000', width: 0 };
  }
  
  const line = spPr['a:ln'];
  const width = line['@_w'] ? emuToPx(parseInt(line['@_w'], 10)) : 1;
  
  if (line['a:noFill']) {
    return { stroke: 'none', color: '#000000', width: 0 };
  }
  
  if (line['a:solidFill']) {
    const fillStyle = parseSolidFill(line['a:solidFill'], theme);
    return { 
      stroke: 'solid', 
      color: fillStyle.color, 
      width: Math.max(1, width)
    };
  }
  
  return { stroke: 'solid', color: '#000000', width: Math.max(1, width) };
}

/**
 * 解析DrawingML的实心填充
 * @param {Object} solidFill - a:solidFill节点
 * @param {Object} theme - 主题色对象
 * @returns {Object} { fill: 'solid', color: '#rrggbb', opacity: 0-1 }
 */
function parseSolidFill(solidFill, theme = {}) {
  if (!solidFill) return { fill: 'solid', color: '#FFFFFF', opacity: 1 };
  
  let color = '#FFFFFF';
  let opacity = 1;
  
  // 检查颜色类型
  if (solidFill['a:srgbClr']) {
    const srgb = solidFill['a:srgbClr'];
    color = `#${srgb['@_val'] || 'FFFFFF'}`;
    
    // 检查透明度
    if (srgb['a:alpha']) {
      opacity = parseInt(srgb['a:alpha']['@_val'] || '100000', 10) / 100000;
    }
  } else if (solidFill['a:schemeClr']) {
    const scheme = solidFill['a:schemeClr'];
    const schemeName = scheme['@_val'];
    
    // 获取主题色
    const baseColor = theme[schemeName] || DEFAULT_THEME_COLORS[schemeName] || '#FFFFFF';
    color = applyColorTransforms(baseColor, scheme);
    
    // 检查透明度
    if (scheme['a:alpha']) {
      opacity = parseInt(scheme['a:alpha']['@_val'] || '100000', 10) / 100000;
    }
  }
  
  return { fill: 'solid', color, opacity };
}

/**
 * 应用颜色变换（tint/shade/lumMod/lumOff）
 * @param {string} baseColor - 基础颜色 #rrggbb
 * @param {Object} schemeNode - schemeClr节点
 * @returns {string} 变换后的颜色 #rrggbb
 */
function applyColorTransforms(baseColor, schemeNode) {
  if (!schemeNode) return baseColor;
  
  // 简化的颜色变换实现
  // 实际项目中可以使用更精确的HSL变换
  
  let color = baseColor;
  
  // 处理tint（向白色靠拢）
  if (schemeNode['a:tint']) {
    const tint = parseInt(schemeNode['a:tint']['@_val'] || '0', 10) / 100000;
    color = blendColors(color, '#FFFFFF', tint);
  }
  
  // 处理shade（向黑色靠拢）
  if (schemeNode['a:shade']) {
    const shade = parseInt(schemeNode['a:shade']['@_val'] || '0', 10) / 100000;
    color = blendColors(color, '#000000', shade);
  }
  
  return color;
}

/**
 * 颜色混合（简化实现）
 * @param {string} color1 - 颜色1 #rrggbb
 * @param {string} color2 - 颜色2 #rrggbb  
 * @param {number} ratio - 混合比例 0-1
 * @returns {string} 混合后的颜色 #rrggbb
 */
function blendColors(color1, color2, ratio) {
  const hex1 = color1.replace('#', '');
  const hex2 = color2.replace('#', '');
  
  const r1 = parseInt(hex1.substr(0, 2), 16);
  const g1 = parseInt(hex1.substr(2, 2), 16);
  const b1 = parseInt(hex1.substr(4, 2), 16);
  
  const r2 = parseInt(hex2.substr(0, 2), 16);
  const g2 = parseInt(hex2.substr(2, 2), 16);
  const b2 = parseInt(hex2.substr(4, 2), 16);
  
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * 把 anchor (from/to + offset 或 ext) 转换成像素矩形
 */
export function anchorToPixels(anchor, dims) {
  if (!anchor || !dims || !dims.colOffsets || !dims.rowOffsets) return null;

  if (anchor['xdr:from'] && anchor['xdr:to']) {
    const from = anchor['xdr:from'];
    const to = anchor['xdr:to'];

    const colFrom = parseInt(from['xdr:col'], 10);
    const rowFrom = parseInt(from['xdr:row'], 10);
    const colTo = parseInt(to['xdr:col'], 10);
    const rowTo = parseInt(to['xdr:row'], 10);

    // 检查索引是否有效
    if (isNaN(colFrom) || isNaN(rowFrom) || isNaN(colTo) || isNaN(rowTo)) {
      console.warn('无效的行列索引:', { colFrom, rowFrom, colTo, rowTo });
      return null;
    }

    // 检查数组边界 - 添加容错处理
    const maxCol = Math.max(colFrom, colTo);
    const maxRow = Math.max(rowFrom, rowTo);
    
    if (maxCol >= dims.colOffsets.length || maxRow >= dims.rowOffsets.length) {
      console.warn('行列索引超出范围，尝试容错处理:', { colFrom, rowFrom, colTo, rowTo, 
        colOffsetsLength: dims.colOffsets.length, rowOffsetsLength: dims.rowOffsets.length });
      
      // 容错：如果索引超出范围，使用最后一个有效偏移
      const safeColFrom = Math.min(colFrom, dims.colOffsets.length - 1);
      const safeRowFrom = Math.min(rowFrom, dims.rowOffsets.length - 1);
      const safeColTo = Math.min(colTo, dims.colOffsets.length - 1);
      const safeRowTo = Math.min(rowTo, dims.rowOffsets.length - 1);
      
      // console.log('使用容错后的索引:', { safeColFrom, safeRowFrom, safeColTo, safeRowTo });
      
      // 使用容错后的索引继续处理
      const colOffFrom = parseInt(from['xdr:colOff'] || 0, 10);
      const rowOffFrom = parseInt(from['xdr:rowOff'] || 0, 10);
      const colOffTo = parseInt(to['xdr:colOff'] || 0, 10);
      const rowOffTo = parseInt(to['xdr:rowOff'] || 0, 10);

      const x = (dims.colOffsets[safeColFrom] || 0) + (isNaN(colOffFrom) ? 0 : colOffFrom / EMU_PER_PIXEL);
      const y = (dims.rowOffsets[safeRowFrom] || 0) + (isNaN(rowOffFrom) ? 0 : rowOffFrom / EMU_PER_PIXEL);
      const w = ((dims.colOffsets[safeColTo] || 0) - (dims.colOffsets[safeColFrom] || 0)) + (isNaN(colOffTo) ? 0 : colOffTo / EMU_PER_PIXEL);
      const h = ((dims.rowOffsets[safeRowTo] || 0) - (dims.rowOffsets[safeRowFrom] || 0)) + (isNaN(rowOffTo) ? 0 : rowOffTo / EMU_PER_PIXEL);

      // 检查计算结果是否为有效数字
      if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) {
        console.warn('容错计算结果包含NaN:', { x, y, w, h });
        return null;
      }

      return { x, y, w, h };
    }

    const colOffFrom = parseInt(from['xdr:colOff'] || 0, 10);
    const rowOffFrom = parseInt(from['xdr:rowOff'] || 0, 10);
    const colOffTo = parseInt(to['xdr:colOff'] || 0, 10);
    const rowOffTo = parseInt(to['xdr:rowOff'] || 0, 10);

    const x = (dims.colOffsets[colFrom] || 0) + (isNaN(colOffFrom) ? 0 : colOffFrom / EMU_PER_PIXEL);
    const y = (dims.rowOffsets[rowFrom] || 0) + (isNaN(rowOffFrom) ? 0 : rowOffFrom / EMU_PER_PIXEL);
    const w = ((dims.colOffsets[colTo] || 0) - (dims.colOffsets[colFrom] || 0)) + (isNaN(colOffTo) ? 0 : colOffTo / EMU_PER_PIXEL);
    const h = ((dims.rowOffsets[rowTo] || 0) - (dims.rowOffsets[rowFrom] || 0)) + (isNaN(rowOffTo) ? 0 : rowOffTo / EMU_PER_PIXEL);

    // 检查计算结果是否为有效数字
    if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) {
      console.warn('计算结果包含NaN:', { x, y, w, h });
      return null;
    }

    return { x, y, w, h };
  }

  if (anchor['xdr:from'] && anchor['xdr:ext']) {
    const from = anchor['xdr:from'];
    const col = parseInt(from['xdr:col'], 10);
    const row = parseInt(from['xdr:row'], 10);

    // 检查索引是否有效
    if (isNaN(col) || isNaN(row)) {
      console.warn('无效的行列索引:', { col, row });
      return null;
    }

    // 检查数组边界
    if (col >= dims.colOffsets.length || row >= dims.rowOffsets.length) {
      console.warn('行列索引超出范围:', { col, row, 
        colOffsetsLength: dims.colOffsets.length, rowOffsetsLength: dims.rowOffsets.length });
      return null;
    }

    const colOff = parseInt(from['xdr:colOff'] || 0, 10);
    const rowOff = parseInt(from['xdr:rowOff'] || 0, 10);

    const x = (dims.colOffsets[col] || 0) + (isNaN(colOff) ? 0 : colOff / EMU_PER_PIXEL);
    const y = (dims.rowOffsets[row] || 0) + (isNaN(rowOff) ? 0 : rowOff / EMU_PER_PIXEL);

    const ext = anchor['xdr:ext'];
    const w = emuToPx(parseInt(ext['@_cx'], 10));
    const h = emuToPx(parseInt(ext['@_cy'], 10));

    // 检查计算结果是否为有效数字
    if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) {
      console.warn('计算结果包含NaN:', { x, y, w, h });
      return null;
    }

    return { x, y, w, h };
  }

  return null;
}

// 新增：读取from锚点信息
function readFrom(fromNode) {
  if (!fromNode) return null;
  return {
    col: parseInt(fromNode['xdr:col'] || 0, 10),
    row: parseInt(fromNode['xdr:row'] || 0, 10),
    oxEMU: parseInt(fromNode['xdr:colOff'] || 0, 10),
    oyEMU: parseInt(fromNode['xdr:rowOff'] || 0, 10)
  };
}

// 新增：读取to锚点信息
function readTo(toNode) {
  if (!toNode) return null;
  return {
    col: parseInt(toNode['xdr:col'] || 0, 10),
    row: parseInt(toNode['xdr:row'] || 0, 10),
    oxEMU: parseInt(toNode['xdr:colOff'] || 0, 10),
    oyEMU: parseInt(toNode['xdr:rowOff'] || 0, 10)
  };
}

// 新增：读取ext扩展信息
function readExt(extNode) {
  if (!extNode) return null;
  const cx = parseInt(extNode['@_cx'] || 0, 10);
  const cy = parseInt(extNode['@_cy'] || 0, 10);
  if (cx > 0 && cy > 0) {
    return { cx, cy };
  }
  return null;
}

// 新增：将单个锚点解析为统一对象
function parseAnchorToRectPx(node, ctx) {
  const base = { 
    sheetName: ctx.sheetName, 
    drawingPath: ctx.drawingPath 
  };

  if (node.twoCellAnchor) {
    const from = readFrom(node.twoCellAnchor.from);
    const to = readTo(node.twoCellAnchor.to);
    if (from && to) {
      const rect = gridToPxRect(from, to, ctx.colWidthsPx, ctx.rowHeightsPx);
      return { 
        ...base, 
        anchorType: 'twoCell', 
        from, 
        to, 
        rectPx: rect, 
        sizeSource: 'anchor_twoCell' 
      };
    }
  }

  if (node.oneCellAnchor) {
    const from = readFrom(node.oneCellAnchor.from);
    if (from) {
      const ext = readExt(node.oneCellAnchor.ext);
      if (ext) {
        const w = emuToPxSafe(ext.cx);
        const h = emuToPxSafe(ext.cy);
        const xy = gridToPxRect(from, { ...from }, ctx.colWidthsPx, ctx.rowHeightsPx);
        return { 
          ...base, 
          anchorType: 'oneCell_ext', 
          from, 
          extEMU: ext, 
          rectPx: { x: xy.x, y: xy.y, w, h }, 
          sizeSource: 'anchor_ext' 
        };
      } else {
        const xy = gridToPxRect(from, { ...from }, ctx.colWidthsPx, ctx.rowHeightsPx);
        return { 
          ...base, 
          anchorType: 'oneCell_noext', 
          from, 
          rectPx: { x: xy.x, y: xy.y }, 
          sizeSource: 'anchor_oneCell_noext' 
        };
      }
    }
  }

  return null;
}

// 新增：构建图片锚点条目
function buildPicAnchorEntry(anchorNode, picNode, ctx) {
  const base = parseAnchorToRectPx(anchorNode, ctx);
  if (!base) return null;

  // 提取rId
  const rId = picNode?.blipfill?.blip?.r_embed || 
              picNode?.['a:blip']?.['_r:embed'] ||
              picNode?.blipfill?.['a:blip']?.['_r:embed'];
  
  // 从rels映射获取target
  const relTarget = rId ? ctx.relsMap.get(rId) : undefined;

  // 提取editAs属性（图片编辑模式）
  const editAs = picNode?.editAs || anchorNode?.editAs || 'oneCell';

  return { ...base, rId, relTarget, editAs };
}

/**
 * 提取文本框的纯文本 (拼接所有 a:t)
 */
export function extractPlainText(spNode) {
  if (!spNode || !spNode['xdr:txBody']) return '';
  const paragraphs = spNode['xdr:txBody']['a:p'];
  if (!paragraphs) return '';

  let text = '';
  const ps = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
  for (const p of ps) {
    if (p['a:r']) {
      const runs = Array.isArray(p['a:r']) ? p['a:r'] : [p['a:r']];
      for (const r of runs) {
        if (r['a:t']) text += r['a:t'];
      }
    } else if (p['a:t']) {
      text += p['a:t'];
    }
    text += '\n';
  }

  return text.trim();
}

/**
 * 检查形状是否应该被跳过（过滤幽灵元素）
 * @param {Object} anchor - 锚点对象
 * @param {Object} rect - 计算出的矩形 {x, y, w, h}
 * @param {Object} opts - 过滤选项
 * @returns {Object} { skip: boolean, reason: string }
 */
function shouldSkipElement(anchor, rect, opts = {}) {
  const defaultOpts = {
    includeHidden: false,
    includeVML: false,
    includePrintOnly: false,
    minPixelSize: 1,
    clipToSheetBounds: true
  };
  const options = { ...defaultOpts, ...opts };

  // 1. 检查是否被隐藏
  if (anchor['xdr:sp']) {
    const sp = anchor['xdr:sp'];
    const nvSpPr = sp['xdr:nvSpPr'];
    if (nvSpPr && nvSpPr['xdr:cNvPr'] && nvSpPr['xdr:cNvPr']['@_hidden'] === '1') {
      return { skip: true, reason: 'hidden' };
    }
  }
  
  if (anchor['xdr:pic']) {
    const pic = anchor['xdr:pic'];
    const nvPicPr = pic['xdr:nvPicPr'];
    if (nvPicPr && nvPicPr['xdr:cNvPr'] && nvPicPr['xdr:cNvPr']['@_hidden'] === '1') {
      return { skip: true, reason: 'hidden' };
    }
  }

  // 2. 检查尺寸是否过小
  if (rect.w < options.minPixelSize || rect.h < options.minPixelSize) {
    return { skip: true, reason: 'too_small' };
  }

  // 3. 检查是否在画布外
  if (options.clipToSheetBounds) {
    // 这里可以添加画布边界检查，暂时跳过
    if (rect.x < -1000 || rect.y < -1000 || rect.x > 10000 || rect.y > 10000) {
      return { skip: true, reason: 'off_canvas' };
    }
  }

  // 4. 检查透明形状（无填充、无线框、无文字）
  if (anchor['xdr:sp']) {
    const sp = anchor['xdr:sp'];
    const spPr = sp['xdr:spPr'];
    const hasText = sp['xdr:txBody'] && extractPlainText(sp).trim().length > 0;
    
    if (spPr) {
      const hasFill = spPr['a:solidFill'] || spPr['a:gradFill'] || spPr['a:pattFill'] || spPr['a:blipFill'];
      const hasLine = spPr['a:ln'];
      
      // 如果既没有填充，也没有线条，也没有文字，则跳过
      if (!hasFill && !hasLine && !hasText) {
        return { skip: true, reason: 'transparent' };
      }
    }
  }

  return { skip: false, reason: 'visible' };
}

/**
 * 解析某个工作表关联的 DrawingML
 * @param {JSZip} zip 解压后的 xlsx zip
 * @param {string} drawingPath 相对路径，比如 "xl/drawings/drawing1.xml"
 * @param {Object} dims { colOffsets:[], rowOffsets:[] } 来自 excelUtils 的换算
 * @param {Object} opts - 过滤选项
 * @returns {Object} { texts:[], images:[], shapes:[], skipped:[] }
 */
async function parseDrawingML(zip, drawingPath, dims, opts = {}) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const xml = await zip.file(drawingPath).async('string');
  const doc = parser.parse(xml);

  // 加载 drawing 的关系文件
  const relsPath = `xl/drawings/_rels/${drawingPath.split('/').pop()}.rels`;
  let rels = {};
  const relsMap = new Map();
  if (zip.file(relsPath)) {
    const relsXml = await zip.file(relsPath).async('string');
    const relsDoc = parser.parse(relsXml);
    rels = relsDoc.Relationships.Relationship;
    
    // 构建rId到target的映射
    if (Array.isArray(rels)) {
      rels.forEach(rel => {
        if (rel['@_Id'] && rel['@_Target']) {
          relsMap.set(rel['@_Id'], rel['@_Target']);
        }
      });
    }
  }

  const anchors = [];
  const wsDr = doc['xdr:wsDr'];
  if (wsDr['xdr:twoCellAnchor']) anchors.push(...[].concat(wsDr['xdr:twoCellAnchor']));
  if (wsDr['xdr:oneCellAnchor']) anchors.push(...[].concat(wsDr['xdr:oneCellAnchor']));

  // 构建上下文对象
  const ctx = {
    sheetName: opts.sheetName || 'Sheet1',
    drawingPath,
    colWidthsPx: dims.colOffsets || [],
    rowHeightsPx: dims.rowOffsets || [],
    relsMap
  };

  const results = { texts: [], images: [], shapes: [], skipped: [], picAnchors: [] };

  for (const a of anchors) {
    const rect = anchorToPixels(a, dims);
    if (!rect) {
      results.skipped.push({ reason: 'invalid_anchor', anchor: a });
      continue;
    }

    // 应用过滤规则
    const filterResult = shouldSkipElement(a, rect, opts);
    if (filterResult.skip) {
      results.skipped.push({ 
        reason: filterResult.reason, 
        anchor: a, 
        rect: rect,
        type: a['xdr:pic'] ? 'image' : a['xdr:sp'] ? 'text' : 'shape'
      });
      continue;
    }

    // 图片 - 解析锚点信息但不渲染
    if (a['xdr:pic']) {
      const picAnchor = buildPicAnchorEntry(a, a['xdr:pic'], ctx);
      if (picAnchor) {
        results.picAnchors.push(picAnchor);
        
        // 打印锚点信息日志
        const fromInfo = `(${picAnchor.from.col},${picAnchor.from.row},${picAnchor.from.oxEMU || 0},${picAnchor.from.oyEMU || 0})`;
        const toInfo = picAnchor.to ? `(${picAnchor.to.col},${picAnchor.to.row},${picAnchor.to.oxEMU || 0},${picAnchor.to.oyEMU || 0})` : 'NA';
        const extInfo = picAnchor.extEMU ? `${picAnchor.extEMU.cx},${picAnchor.extEMU.cy} emu` : 'NA';
        const rectInfo = picAnchor.rectPx ? 
          `(${Math.round(picAnchor.rectPx.x)},${Math.round(picAnchor.rectPx.y)},${Math.round(picAnchor.rectPx.w || 0)},${Math.round(picAnchor.rectPx.h || 0)})` : 
          'w/h=NA';
        
        console.log(`[DML] pic rId=${picAnchor.rId || 'N/A'} target=${picAnchor.relTarget || 'N/A'}`);
        console.log(`      anchor=${picAnchor.anchorType}`);
        console.log(`      from=${fromInfo} to=${toInfo} ext=${extInfo}`);
        console.log(`      → rectPx=${rectInfo} sizeSource=${picAnchor.sizeSource}`);
      }
      continue;
    }

    // 文本框
    if (a['xdr:sp']) {
      const sp = a['xdr:sp'];
      const text = extractPlainText(sp);
      const spPr = sp['xdr:spPr'];
      
      // 解析样式
      const fillStyle = parseFillStyle(spPr, opts.theme || {});
      const strokeStyle = parseStrokeStyle(spPr, opts.theme || {});
      
      if (text) {
        results.texts.push({ 
          rect, 
          text, 
          fill: fillStyle,
          stroke: strokeStyle,
          type: 'textbox'
        });
      } else {
        // 没有文字内容的形状，但仍然可见
        results.shapes.push({ 
          rect, 
          kind: 'shape',
          fill: fillStyle,
          stroke: strokeStyle,
          type: 'shape'
        });
      }
      continue;
    }

    // 其它形状（可选）
    results.shapes.push({ rect, kind: 'rect' });
  }

  
  // 显示跳过的元素统计
  const skipStats = {};
  results.skipped.forEach(item => {
    skipStats[item.reason] = (skipStats[item.reason] || 0) + 1;
  });
  // console.log('跳过统计:', skipStats);

  return results;
}

// 默认导出
export default {
  parseDrawingML,
  anchorToPixels,
  extractPlainText,
  parseFillStyle,
  parseStrokeStyle,
  parseSolidFill,
  applyColorTransforms,
  blendColors
};