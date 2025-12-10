// SKU同步相关工具函数
import { getSKUFromFrame } from './frameUtils.js';

// SKU同步功能：根据SKU代码同步相同产品的图片到所有相关frame
export function syncImagesBySKU(editor, targetFrame, assetId, scaledWidth, scaledHeight, initialX, initialY) {
  try {
    // 1. 获取目标frame下方的SKU文字
    const targetSKU = getSKUFromFrame(editor, targetFrame);
    if (!targetSKU) {
      return;
    }
    
    // 2. 扫描画布上所有frame，找到相同SKU的frame
    const allFrames = editor.getCurrentPageShapes().filter(shape => shape.type === 'frame');
    const sameSKUFrames = [];
    
    for (const frame of allFrames) {
      const frameSKU = getSKUFromFrame(editor, frame);
      if (frameSKU === targetSKU && frame.id !== targetFrame.id) {
        sameSKUFrames.push(frame);
      }
    }
    
    // 3. 为每个相同SKU的frame创建相同的图片
    for (const frame of sameSKUFrames) {
      try {
        // 计算frame中的图片位置（使用相同的逻辑）
        const fw = frame.props.w, fh = frame.props.h;
        const scale = Math.min(fw / (scaledWidth / 0.9), fh / (scaledHeight / 0.9)) * 0.9;
        const fitW = Math.max(1, (scaledWidth / 0.9) * scale);
        const fitH = Math.max(1, (scaledHeight / 0.9) * scale);
        
        const frameX = frame.x + (fw - fitW) / 2;
        const frameY = frame.y + (fh - fitH) * 0.25;
        
        // 创建新的图片形状（使用相同的assetId）
        const newImageShape = {
          type: "image",
          x: frameX,
          y: frameY,
          props: {
            w: fitW,
            h: fitH,
            assetId: assetId
          }
        };
        
        // 使用Tldraw v3语法创建图片
        const newShapeId = editor.createShape(newImageShape);
        
        // 图片同步成功
      } catch (error) {
        // 同步图片时出错，静默处理
      }
    }
    
  } catch (error) {
    // SKU同步功能出错，静默处理
  }
}
