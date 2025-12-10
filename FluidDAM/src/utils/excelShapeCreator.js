/**
 * Excel形状创建模块
 * 负责创建TLDraw形状和处理元素适配
 */

import { createTextFitConfig, shrinkAndRefitTextShape, createSafeRichText } from './textFitUtils.js';
import { createImageFrameShape } from './frameUtils.js';

/**
 * Excel形状创建器类
 */
export class ExcelShapeCreator {
  constructor(editor, scale = 1, dependencies = {}) {
    this.editor = editor;
    this.scale = scale;
    this.dependencies = dependencies;
  }

  // 统一的 contain-fit：等比包含 + 居中；无向上放大；对极端比例做微补偿
  computeContainFit(x, y, wCell, hCell, wNat, hNat, paddingPx = 2) {
    // --- 1) 动态 padding：避免紧贴容器边缘引发"被切一刀"的错觉 ---
    const containerArea = wCell * hCell;
    const basePadding = Math.max(2, Math.min(8, Math.sqrt(containerArea) / 50));
    const ratio = wNat / hNat;
    const isTooWide = ratio > 3;       // 超宽（例如 3:1 以上）
    const isTooTall = ratio < 1 / 3;   // 超高（例如 1:3 以上）
    const aspectFactor = (isTooWide || isTooTall) ? 1.4 : 1.0;
    const pad = Math.round(Math.max(paddingPx, basePadding * aspectFactor));

    const innerW = Math.max(0, wCell - pad * 2);
    const innerH = Math.max(0, hCell - pad * 2);

    // --- 2) 计算 contain 缩放：禁止任何"额外放大" ---
    // 重要：不要再乘以 renderSafetyMargin (>1)；那会把图像变成 cover 效果！
    const s = Math.min(innerW / wNat, innerH / hNat);

    // --- 3) 尺寸取整策略：w/h 用 floor，避免 1px 溢出导致被 mask 裁切 ---
    let wImg = Math.max(1, Math.floor(wNat * s));
    let hImg = Math.max(1, Math.floor(hNat * s));

    // --- 4) 极端比例微补偿（只做"减小"，绝不放大），防止边缘抗锯齿误差 ---
    if (isTooWide) {
      wImg = Math.max(1, wImg - Math.max(1, Math.round(wCell * 0.002))); // 减 0.2% 宽
    }
    if (isTooTall) {
      hImg = Math.max(1, hImg - Math.max(1, Math.round(hCell * 0.002))); // 减 0.2% 高
    }

    // --- 5) 居中定位：x/y 用 round（防亚像素锯齿）；并确保不为负 ---
    const xImg = Math.max(x, Math.round(x + (wCell - wImg) / 2));
    const yImg = Math.max(y, Math.round(y + (hCell - hImg) / 2));

    // 调试输出（可保留，便于定位问题）
    console.log(
      `🧩 contain-fit: 容器${wCell}×${hCell}, 原图${wNat}×${hNat}, 比例=${ratio.toFixed(3)}, pad=${pad}, ` +
      `绘制=${wImg}×${hImg}, 位置=(${xImg},${yImg})`
    );

    return { x: xImg, y: yImg, w: wImg, h: hImg };
  }

  /**
   * 核心：把textbox适配到容器里，如果textbox在格子内就fit到格子内
   * @param {Array} texts - 文字数组（包含textbox）
   * @param {Array} frames - 框架数组
   * @param {number} padding - 内边距，默认4像素
   */
  fitTextboxesIntoFrames(texts, frames, padding = 4) {
    // Fidelity-first 模式：直接返回原始文本框，不做任何适配处理
    if (this.dependencies.PRESERVE_EXCEL_LAYOUT) {
      return texts.map(text => this.maybeSnapToFrame(text, frames));
    }

    console.log(`开始处理 ${texts.length} 个文字元素，${frames.length} 个框架`);
    
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      
      // 只处理textbox类型的文字
      if (text.type !== 'textbox') {
        continue;
      }
      
      console.log(`处理textbox ${i + 1}: 当前位置 (${text.x}, ${text.y}), 当前尺寸 ${text.width}x${text.height}`);
      
      // 查找所有包含此textbox的框架
      const containingFrames = this.findAllContainingFrames(frames, text);
      
      console.log(`textbox ${i + 1}: 查找包含框架，textbox位置 (${text.x}, ${text.y}, ${text.width}x${text.height})`);
      console.log(`textbox ${i + 1}: 找到 ${containingFrames.length} 个包含的框架`);
      
      if (containingFrames.length === 0) {
        console.log(`textbox ${i + 1}: 未找到包含的框架，保持原始位置和尺寸`);
        console.log(`textbox ${i + 1}: 可用框架数量: ${frames.length}`);
        if (frames.length > 0) {
          console.log(`textbox ${i + 1}: 第一个框架位置: (${frames[0].x}, ${frames[0].y}, ${frames[0].width}x${frames[0].height})`);
        }
        // 不在任何格子内的textbox，保持原始位置和尺寸
        text.x = Math.round(text.x);
        text.y = Math.round(text.y);
        text.width = Math.round(text.width);
        text.height = Math.round(text.height);
        continue;
      }
      
      // 如果textbox在格子内，适配到格子内
      const frame = containingFrames[0]; // 使用第一个包含的框架
      console.log(`textbox ${i + 1}: 适配到框架 (${frame.x}, ${frame.y}, ${frame.width}x${frame.height})`);
      
      // 计算适配后的位置和尺寸
      const newX = frame.x + padding;
      const newY = frame.y + padding;
      const newWidth = Math.max(20, frame.width - padding * 2); // 最小宽度20px
      const newHeight = Math.max(20, frame.height - padding * 2); // 最小高度20px
      
      // 更新textbox的位置和尺寸
      text.x = Math.round(newX);
      text.y = Math.round(newY);
      text.width = Math.round(newWidth);
      text.height = Math.round(newHeight);
      
      console.log(`textbox ${i + 1}: 适配后位置 (${text.x}, ${text.y}), 尺寸 ${text.width}x${text.height}`);
    }
    
    console.log('textbox适配完成');
    return texts; // 返回处理后的文本框数组
  }

  /**
   * 图片处理已移至VBA路径(LoadCanvasButton.jsx)
   * 这里保持空实现，避免混淆
   * @param {Array} images - 图片数组
   * @param {Array} frames - 框架数组
   * @param {number} padding - 内边距，默认8像素
   */
  fitImagesIntoFrames(images, frames, padding = 0) {
    return images;
  }

  // 原始函数已删除，避免混淆
  // 如需查看原始实现，请参考git历史
  fitImagesIntoFrames_original(images, frames, padding = 0) {
    // Fidelity-first 模式：直接返回原始图片，不做任何适配处理
    if (this.dependencies.PRESERVE_EXCEL_LAYOUT) {
      return images.map(img => this.maybeSnapToFrame(img, frames));
    }

    
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      // 原图像素
      const ow = Math.max(1, img.originalWidth || img.width || 1);
      const oh = Math.max(1, img.originalHeight || img.height || 1);


      // 查找所有包含此图片的框架（可能横跨多个格子）
      const containingFrames = this.findAllContainingFrames(frames, img);
      
      if (containingFrames.length === 0) {
        // 不在任何格子内的图片，保持原始位置和尺寸，只应用缩放
        img.x = Math.round(img.x);
        img.y = Math.round(img.y);
        img.width = Math.round(img.width);
        img.height = Math.round(img.height);
        continue;
      }

      // 如果图片横跨多个框架，计算合并后的边界
      const combinedBounds = this.calculateCombinedBounds(containingFrames);

      const maxW = Math.max(0, combinedBounds.width - padding * 2);
      const maxH = Math.max(0, combinedBounds.height - padding * 2);

      // 检查是否为横幅图片（横跨多个格子且尺寸较大）
      const excelBoxW = img.width || ow;
      const excelBoxH = img.height || oh;
      // 更严格的横幅检测：必须横跨多个格子 且 图片尺寸明显大于单个格子
      const isBanner = containingFrames.length > 1 && 
                      (excelBoxW > maxW * 1.5 || excelBoxH > maxH * 1.5) &&
                      (excelBoxW > 200 || excelBoxH > 200); // 绝对尺寸也要足够大
      
      
      if (isBanner) {
        // 横幅图片：保持原始Excel尺寸，但确保不超出合并边界
        const scaleX = maxW / excelBoxW;
        const scaleY = maxH / excelBoxH;
        const scale = Math.min(scaleX, scaleY, 1); // 不超过100%原图像素
        
        const dw = Math.round(excelBoxW * scale);
        const dh = Math.round(excelBoxH * scale);
        
        // 在合并边界内居中
        const nx = combinedBounds.x + (combinedBounds.width - dw) / 2;
        const ny = combinedBounds.y + (combinedBounds.height - dh) / 2;
        
        
        img.x = Math.round(nx);
        img.y = Math.round(ny);
        img.width = Math.round(dw);
        img.height = Math.round(dh);
      } else {
        // 单格子图片：创建真正的TLDraw frame shape并使用fit to frame功能
        
        // 创建真正的TLDraw frame shape
        const frameShape = {
          type: 'frame',
          x: combinedBounds.x * this.scale,
          y: combinedBounds.y * this.scale,
          props: {
            w: combinedBounds.width * this.scale,
            h: combinedBounds.height * this.scale,
            name: `图片Frame ${i + 1}`
          }
        };
        
        // 使用TLDraw创建真正的frame shape
        const frameId = this.editor.createShape(frameShape);
        
        // 创建frame信息对象用于后续处理
        const cellFrame = {
          x: combinedBounds.x,
          y: combinedBounds.y,
          width: combinedBounds.width,
          height: combinedBounds.height,
          type: 'frame',
          id: frameId, // 使用TLDraw生成的真正ID
          tldrawId: frameId,
          name: `图片Frame ${i + 1}`
        };
        
        // 将frame添加到frames数组中
        const existingFrame = frames.find(f => f.id === frameId);
        if (!existingFrame) {
          frames.push(cellFrame);
        }
        
        // 使用fit to frame功能将图片适配到frame中
        const fittedImage = this.fitImageToFrame(img, cellFrame, padding);
        
        // 更新图片信息，记录frame关联
        img.x = fittedImage.x;
        img.y = fittedImage.y;
        img.width = fittedImage.width;
        img.height = fittedImage.height;
        img.frameId = frameId; // 记录真正的TLDraw frame ID
        img.parentId = frameId; // 设置parent关系
        
      }
    }
    
    return images; // 返回处理后的图片数组
  }

  /**
   * 图片适配已移至VBA路径(LoadCanvasButton.jsx)
   * 这里保持空实现，避免混淆
   */
  fitImageToFrame(imageInfo, frameRect, padding = 0) {
    console.log(`⚠️ ExcelJS路径的图片适配已禁用，请使用VBA路径`);
    return {
      x: imageInfo.x || 0,
      y: imageInfo.y || 0,
      width: imageInfo.width || 100,
      height: imageInfo.height || 100
    };
  }

  // 原始函数已删除，避免混淆
  // 如需查看原始实现，请参考git历史
  fitImageToFrame_original(imageInfo, frameRect, padding = 0) {
    try {
      // 项目级常量：内边距和描边（改为0以避免图片被裁剪）
      const CELL_PADDING = 0;
      const FRAME_STROKE = 0;
      const totalPadding = padding + CELL_PADDING + FRAME_STROKE;
      
      // 获取原始图片尺寸
      const originalWidth = Math.max(1, imageInfo.originalWidth || imageInfo.width || 1);
      const originalHeight = Math.max(1, imageInfo.originalHeight || imageInfo.height || 1);

      // 计算frame内的可用空间（统一预留内边距与描边）
      const availableWidth = Math.max(1, frameRect.width - totalPadding * 2);
      const availableHeight = Math.max(1, frameRect.height - totalPadding * 2);

      // 计算contain缩放比例（允许放大到贴满frame）
      const scaleX = availableWidth / originalWidth;
      const scaleY = availableHeight / originalHeight;
      const scale = Math.min(scaleX, scaleY); // 移除,1限制，允许放大到贴满

      // 计算适配后的尺寸
      const fittedWidth = Math.round(originalWidth * scale);
      const fittedHeight = Math.round(originalHeight * scale);

      // 确保尺寸不为0（TLDraw v3要求）
      const finalWidth = Math.max(1, fittedWidth);
      const finalHeight = Math.max(1, fittedHeight);

      // 在frame内居中
      const fittedX = frameRect.x + (frameRect.width - finalWidth) / 2;
      const fittedY = frameRect.y + (frameRect.height - finalHeight) / 2;

      const result = {
        x: Math.round(fittedX),
        y: Math.round(fittedY),
        width: finalWidth,
        height: finalHeight
      };

      console.log(`图片适配到frame: 原图(${originalWidth}x${originalHeight}) -> 适配后(${result.width}x${result.height}), 位置(${result.x}, ${result.y}), 缩放比例: ${scale.toFixed(3)}`);
      return result;

    } catch (error) {
      console.warn('图片适配到frame失败:', error);
      // 返回原始位置作为后备
      return {
        x: imageInfo.x || 0,
        y: imageInfo.y || 0,
        width: imageInfo.width || 100,
        height: imageInfo.height || 100
      };
    }
  }

  /**
   * 批量创建TLDraw形状
   * @param {Array} elements - 元素数组
   * @param {string} shapeType - 形状类型
   */
  async createShapesBatch(elements, shapeType) {
    const shapes = [];
    let frameCounter = 0; // 用于生成唯一的frame名称
    
    for (const element of elements) {
      try {
        let shape;
        
        switch (shapeType) {
          case 'image':
            // 图片：强制contain到锚点矩形，不允许超框
            // 先创建资产，再创建形状
            try {
              // 如果图片有关联的frame，frame已经在fitImagesIntoFrames中创建了
              // 这里只需要查找对应的frame信息
              let parentId = this.editor.getCurrentPageId(); // 默认在页面根
              if (element.frameId) {
                const frameInfo = this.dependencies.frames?.find(f => f.id === element.frameId);
                if (frameInfo && frameInfo.tldrawId) {
                  parentId = frameInfo.tldrawId;
                  console.log(`图片将放置在已创建的frame内: ${parentId}`);
                }
              }
              
              const assetId = `asset:${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}`;
              
              // 1) Asset使用原图尺寸
              const naturalW = element.originalWidth || element.width;
              const naturalH = element.originalHeight || element.height;
              
              // 创建资产 - 使用原图天然尺寸
              this.editor.store.put([
                {
                  id: assetId,
                  type: "image",
                  typeName: "asset",
                  meta: {},
                  props: {
                    w: naturalW,
                    h: naturalH,
                    src: element.url,
                    name: `Excel图片_${Date.now()}`,
                    mimeType: element.mimeType || 'image/png',
                    isAnimated: false
                  }
                }
              ]);
              
              // 2) 使用contain-fit模式确保图片完整显示
              const drawX = element.x * this.scale;
              const drawY = element.y * this.scale;
              const drawW = element.width * this.scale;
              const drawH = element.height * this.scale;
              
              // 获取图片的原始尺寸
              const naturalWidth = element.naturalWidth || element.width;
              const naturalHeight = element.naturalHeight || element.height;
              
              // 计算contain-fit模式下的显示坐标
              const { x: finalX, y: finalY, w: finalW, h: finalH } = this.computeContainFit(
                drawX,
                drawY,
                drawW,
                drawH,
                naturalWidth,
                naturalHeight,
                2 // padding: 2px
              );
              
              
              if (isNaN(finalX) || isNaN(finalY) || isNaN(finalW) || isNaN(finalH) || finalW <= 0 || finalH <= 0) {
                console.warn('图片元素坐标无效，跳过:', { 
                  element, 
                  finalX, 
                  finalY, 
                  finalW, 
                  finalH,
                  scale: this.scale 
                });
                continue;
              }
              
              // 3) 创建图片shape，使用contain-fit后的尺寸和位置
              shape = {
                type: 'image',
                parentId: parentId,
                x: finalX,
                y: finalY,
                props: {
                  w: finalW,
                  h: finalH,
                  assetId: assetId,
                  crop: { 
                    topLeft: { x: 0, y: 0 }, 
                    bottomRight: { x: 1, y: 1 } 
                  } // 确保无裁剪
                }
              };
            } catch (error) {
              console.warn('创建图片资产失败:', error);
              continue; // 跳过这个图片
            }
            break;
            
          case 'text':
            // 文本：保留锚点矩形宽度触发换行，必要时跑shrink-and-refit字号逻辑
            // 验证坐标和尺寸是否为有效数字
            const textX = element.x * this.scale;
            const textY = element.y * this.scale;
            const textW = element.width * this.scale;
            const textH = element.height * this.scale;
            
            if (isNaN(textX) || isNaN(textY) || isNaN(textW) || isNaN(textH)) {
              console.warn('文字元素坐标无效，跳过:', { 
                element, 
                textX, 
                textY, 
                textW,
                textH,
                scale: this.scale 
              });
              continue;
            }
            
            // 检查是否是textbox类型
            if (element.type === 'textbox') {
              // 为textbox创建自适应文本
              const textElement = {
                x: textX,
                y: textY,
                width: textW,
                height: textH,
                text: element.text,
                fontSize: element.fontSize || 12
              };
              
              // 计算文本适配配置
              const fitConfig = createTextFitConfig(textElement, {
                basePt: element.fontSize || 12,
                minPt: 8,
                lineHeight: 1.35
              });
              
              
              // 创建白底矩形（可选）
              const backgroundColor = element.fill?.color || '#FFFFFF';
              const backgroundShape = {
                type: 'geo',
                x: textX,
                y: textY,
                props: {
                  geo: 'rectangle',
                  w: textW,
                  h: textH,
                  fill: 'solid',
                  color: this.dependencies.mapColorToTLDraw(backgroundColor)
                }
              };
              
              // 创建自适应文本
              const textShape = {
                type: 'text',
                x: textX + 4, // 稍微偏移避免贴边
                y: textY + 4,
                parentId: this.editor.getCurrentPageId(), // 不入frame，避免被裁剪
                props: {
                  w: Math.max(4, Math.round(textW - 8)), // 固定宽度触发换行，至少4px
                  richText: createSafeRichText(fitConfig.softenedText), // 使用安全的富文本格式
                  size: this.dependencies.mapFontSizeToTLDraw(fitConfig.fitPt), // 映射到TLDraw v3的size值
                  color: 'black'
                }
              };
              
              // 先创建背景，再创建文字
              shapes.push(backgroundShape);
              shapes.push(textShape);
              continue;
            } else {
              // 普通单元格文字（无背景，但也要适配）
              const textElement = {
                x: textX,
                y: textY,
                width: textW,
                height: textH,
                text: element.text,
                fontSize: element.fontSize || 12
              };
              
              // 计算文本适配配置
              const fitConfig = createTextFitConfig(textElement, {
                basePt: element.fontSize || 12,
                minPt: 8,
                lineHeight: 1.35
              });
              
              shape = {
                type: 'text',
                x: textX,
                y: textY,
                parentId: this.editor.getCurrentPageId(), // 不入frame，避免被裁剪
                props: {
                  w: Math.max(4, Math.round(textW)), // 固定宽度触发换行，至少4px
                  richText: createSafeRichText(fitConfig.softenedText), // 使用安全的富文本格式
                  size: this.dependencies.mapFontSizeToTLDraw(fitConfig.fitPt), // 映射到TLDraw v3的size值
                  color: 'black'
                }
              };
            }
            break;
            
          case 'frame':
            // 使用新的工具函数创建frame形状
            shape = createImageFrameShape(element, this.scale);
            if (shape) {
              frameCounter++;
            }
            break;
            
          case 'background':
            // 验证背景坐标和尺寸
            const bgX = element.x * this.scale;
            const bgY = element.y * this.scale;
            const bgW = element.width * this.scale;
            const bgH = element.height * this.scale;
            
            if (isNaN(bgX) || isNaN(bgY) || isNaN(bgW) || isNaN(bgH)) {
              console.warn('背景元素坐标无效，跳过:', { 
                element, 
                bgX, 
                bgY, 
                bgW, 
                bgH,
                scale: this.scale 
              });
              continue;
            }
            
            shape = {
              type: 'geo',
              x: bgX,
              y: bgY,
              props: {
                geo: 'rectangle',
                w: bgW,
                h: bgH,
                fill: 'solid',
                color: this.dependencies.mapColorToTLDraw(element.color)
              }
            };
            break;
        }
        
        if (shape) {
          shapes.push(shape);
        }
      } catch (error) {
        console.warn(`创建${shapeType}形状失败:`, error);
      }
    }
    
    // 批量添加到画布
    if (shapes.length > 0) {
      try {
        // 尝试批量创建
        if (typeof this.editor.batch === 'function') {
          await this.editor.batch(() => {
            shapes.forEach(shape => {
              this.editor.createShape(shape);
            });
          });
        } else {
          // 如果batch方法不存在，逐个创建
          shapes.forEach(shape => {
            this.editor.createShape(shape);
          });
        }
      } catch (error) {
        console.error('批量创建形状失败:', error);
        // 尝试逐个创建
        try {
          shapes.forEach(shape => {
            this.editor.createShape(shape);
          });
        } catch (fallbackError) {
          console.error('逐个创建形状也失败:', fallbackError);
        }
      }
    }
  }

  /**
   * 后处理文本形状：缩窄过于宽的文本框
   * @param {Array} textElements - 文本元素数组
   */
  async postProcessTextShapes(textElements) {
    if (!textElements || textElements.length === 0) {
      return;
    }

    
    // 获取当前页面的所有文本形状
    const currentPageShapes = this.editor.getCurrentPageShapes();
    const textShapes = currentPageShapes.filter(shape => shape.type === 'text');
    
    
    for (const textShape of textShapes) {
      try {
        // 检查文本是否过宽（宽度 > 300px 或包含长串）
        const currentWidth = textShape.props.w || 0;
        const richText = textShape.props.richText;
        const text = richText?.text || '';
        
        // 判断是否需要缩窄
        const needsShrinking = currentWidth > 300 || 
                              text.length > 50 || 
                              /[A-Za-z0-9]{20,}/.test(text);
        
        if (needsShrinking) {
          // 计算目标宽度（比当前宽度小20%，但至少100px）
          const targetWidth = Math.max(100, Math.round(currentWidth * 0.8));
          
          // console.log(`缩窄文本形状 ${textShape.id}: ${currentWidth}px -> ${targetWidth}px`);
          
          // 使用shrinkAndRefitTextShape进行缩窄
          shrinkAndRefitTextShape(this.editor, textShape.id, targetWidth, {
            minPt: 8,
            lineHeight: 1.35
          });
        }
      } catch (error) {
        console.warn(`后处理文本形状 ${textShape.id} 失败:`, error);
      }
    }
    
  }

  // 工具方法
  findAllContainingFrames(frames, img) {
    if (this.dependencies.findAllContainingFrames) {
      return this.dependencies.findAllContainingFrames(frames, img);
    }
    throw new Error('findAllContainingFrames方法未提供');
  }

  calculateCombinedBounds(frames) {
    if (this.dependencies.calculateCombinedBounds) {
      return this.dependencies.calculateCombinedBounds(frames);
    }
    throw new Error('calculateCombinedBounds方法未提供');
  }

  maybeSnapToFrame(element, frames) {
    if (this.dependencies.maybeSnapToFrame) {
      return this.dependencies.maybeSnapToFrame(element, frames);
    }
    return element;
  }
}
