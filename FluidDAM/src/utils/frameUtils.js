/**
 * Frame工具函数
 * 从imageFrameUtils.js迁移过来的必要函数
 */

/**
 * 创建图片frame的形状对象（用于调试显示）
 * @param {Object} frameInfo - frame信息
 * @param {number} scale - 缩放比例
 * @returns {Object} TLDraw形状对象
 */
export function createImageFrameShape(frameInfo, scale = 1) {
  const frameX = frameInfo.x * scale;
  const frameY = frameInfo.y * scale;
  const frameW = frameInfo.width * scale;
  const frameH = frameInfo.height * scale;
  
  if (isNaN(frameX) || isNaN(frameY) || isNaN(frameW) || isNaN(frameH)) {
    console.warn('frame元素坐标无效，跳过:', { 
      frameInfo, 
      frameX, 
      frameY, 
      frameW, 
      frameH,
      scale 
    });
    return null;
  }
  
  // 判断是否为图片frame（通过ID判断）
  const isImageFrame = frameInfo.id && frameInfo.id.startsWith('frame:image');
  
  return {
    type: 'geo',
    x: frameX,
    y: frameY,
    props: {
      geo: 'rectangle',
      w: frameW,
      h: frameH,
      fill: 'none',
      color: isImageFrame ? 'red' : 'black', // 图片frame用红色，表格frame用黑色
      dash: isImageFrame ? 'dashed' : 'solid' // 图片frame用虚线，表格frame用实线
    }
  };
}

/**
 * 获取frame的边界信息
 * @param {Object} editor - TLDraw编辑器实例
 * @param {Object} frame - frame形状对象
 * @returns {Object} frame边界信息 {minX, minY, width, height}
 */
export function getFrameBounds(editor, frame) {
  if (!frame || !frame.x !== undefined || !frame.y !== undefined) {
    return null;
  }
  
  return {
    minX: frame.x,
    minY: frame.y,
    width: frame.props?.w || 100,
    height: frame.props?.h || 100
  };
}

/**
 * 计算contain-fit的尺寸和偏移
 * @param {number} imgW - 图片宽度
 * @param {number} imgH - 图片高度
 * @param {number} frameW - frame宽度
 * @param {number} frameH - frame高度
 * @param {number} padding - 内边距
 * @returns {Object} {w, h, ox, oy} 适配后的尺寸和偏移
 */
export function fitContain(imgW, imgH, frameW, frameH, padding = 0) {
  const availableW = Math.max(1, frameW - padding * 2);
  const availableH = Math.max(1, frameH - padding * 2);
  
  const scale = Math.min(availableW / imgW, availableH / imgH);
  const w = Math.max(1, imgW * scale);
  const h = Math.max(1, imgH * scale);
  
  const ox = (frameW - w) / 2;
  const oy = (frameH - h) / 2;
  
  return { w, h, ox, oy };
}

/**
 * 从frame中获取SKU代码
 * @param {Object} editor - TLDraw编辑器实例
 * @param {Object} frame - frame形状对象
 * @returns {string|null} SKU代码或null
 */
export function getSKUFromFrame(editor, frame) {
  if (!frame || !frame.id) {
    return null;
  }
  
  try {
    // 获取frame下方的文本形状
    const allShapes = editor.getCurrentPageShapes();
    const frameBounds = getFrameBounds(editor, frame);
    
    if (!frameBounds) {
      return null;
    }
    
    // 查找frame下方的文本形状
    const textShapes = allShapes.filter(shape => 
      shape.type === 'text' && 
      shape.x >= frameBounds.minX && 
      shape.x <= frameBounds.minX + frameBounds.width &&
      shape.y > frameBounds.minY + frameBounds.height &&
      shape.y < frameBounds.minY + frameBounds.height + 50 // 在frame下方50px内
    );
    
    // 返回第一个文本形状的内容作为SKU
    if (textShapes.length > 0) {
      const textShape = textShapes[0];
      // 从richText中提取纯文本
      if (textShape.props?.richText) {
        return textShape.props.richText.map(item => item.text).join('').trim();
      }
    }
    
    return null;
  } catch (error) {
    console.warn('获取frame SKU失败:', error);
    return null;
  }
}