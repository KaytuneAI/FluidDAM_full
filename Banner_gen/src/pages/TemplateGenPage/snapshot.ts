/**
 * Template Snapshot Types and Functions
 * 
 * 全量快照式 undo/redo 实现
 */

export type ElementStyleSnap = {
  left?: string;
  top?: string;
  right?: string;
  bottom?: string;
  position?: string;
  width?: string;
  height?: string;
  transform?: string;
  transformOrigin?: string;
  
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  lineHeight?: string;
  letterSpacing?: string;
  color?: string;
  textAlign?: string;
  
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  opacity?: string;
  zIndex?: string;
};

export type ElementSnap = {
  key: string;        // data-field
  tag: string;        // IMG/DIV/SPAN...
  text?: string;      // 非 IMG（纯文本，fallback）
  html?: string;      // 非 IMG（innerHTML，保留 DOM 结构）
  src?: string;       // IMG
  className?: string; // 可选：如果依赖 class
  style: ElementStyleSnap;
};

export type TemplateSnapshot = {
  meta: {
    width: number;
    height: number;
    templateSize: '800x800' | '750x1000' | 'custom';
    customSize?: string;
  };
  background: {
    selected?: string;
    pos: { x: number; y: number };
    size: number;
  };
  elements: Record<string, ElementSnap>; // key=data-field
};

/**
 * 从 iframe 文档中捕获快照
 */
export function captureSnapshot(
  iframeDoc: Document,
  meta: {
    width: number;
    height: number;
    templateSize: '800x800' | '750x1000' | 'custom';
    customSize?: string;
  },
  background: {
    selected?: string | null;
    pos: { x: number; y: number };
    size: number;
  }
): TemplateSnapshot {
  const elements: Record<string, ElementSnap> = {};
  
  // 遍历所有带 data-field 的元素
  const fieldElements = Array.from(iframeDoc.querySelectorAll('[data-field]')) as HTMLElement[];
  
  fieldElements.forEach((element) => {
    const fieldName = element.getAttribute('data-field');
    if (!fieldName) return;
    
    const tag = element.tagName;
    const style: ElementStyleSnap = {};
    
    // 读取关键样式属性
    const computedStyle = iframeDoc.defaultView?.getComputedStyle(element);
    const inlineStyle = element.style;
    
    // 位置和尺寸（参考 save 功能的逻辑）
    // 优先读取 inline style，如果没有则读取 computed style
    const position = inlineStyle.position || computedStyle?.position || '';
    if (position && position !== 'static') style.position = position;
    
    const left = inlineStyle.left || computedStyle?.left || '';
    if (left && left !== 'auto') style.left = left;
    
    const top = inlineStyle.top || computedStyle?.top || '';
    if (top && top !== 'auto') style.top = top;
    
    const right = inlineStyle.right || computedStyle?.right || '';
    if (right && right !== 'auto') style.right = right;
    
    const bottom = inlineStyle.bottom || computedStyle?.bottom || '';
    if (bottom && bottom !== 'auto') style.bottom = bottom;
    
    const width = inlineStyle.width || '';
    if (width) style.width = width;
    
    const height = inlineStyle.height || '';
    if (height) style.height = height;
    
    // transform 是关键：必须捕获，即使没有 inline style
    const transform = inlineStyle.transform || '';
    if (transform && transform !== 'none') {
      // 参考 save 功能：如果是 translate，只保存 translate 部分
      const translateMatch = transform.match(/translate\(([^)]+)\)/);
      if (translateMatch) {
        style.transform = `translate(${translateMatch[1]})`;
      } else {
        // 保留完整的 transform（可能包含 scale, rotate 等）
        style.transform = transform;
      }
    } else if (computedStyle && computedStyle.transform && computedStyle.transform !== 'none') {
      const computedTransform = computedStyle.transform;
      const translateMatch = computedTransform.match(/translate\(([^)]+)\)/);
      if (translateMatch) {
        style.transform = `translate(${translateMatch[1]})`;
      } else {
        style.transform = computedTransform;
      }
    }
    
    const transformOrigin = inlineStyle.transformOrigin || computedStyle?.transformOrigin || '';
    if (transformOrigin) style.transformOrigin = transformOrigin;
    
    // 文本样式（参考 save 功能的逻辑）
    // 优先读取 inline style，如果没有则读取 computed style
    // 注意：过滤掉默认值，避免保存不必要的样式
    const fontSize = inlineStyle.fontSize || computedStyle?.fontSize || '';
    if (fontSize && fontSize !== '16px') style.fontSize = fontSize; // 16px 是默认值，跳过
    
    const fontFamily = inlineStyle.fontFamily || computedStyle?.fontFamily || '';
    if (fontFamily && fontFamily !== 'initial') style.fontFamily = fontFamily;
    
    const fontWeight = inlineStyle.fontWeight || computedStyle?.fontWeight || '';
    if (fontWeight && fontWeight !== 'normal' && fontWeight !== '400') {
      style.fontWeight = fontWeight;
    }
    
    const fontStyle = inlineStyle.fontStyle || computedStyle?.fontStyle || '';
    if (fontStyle && fontStyle !== 'normal') style.fontStyle = fontStyle;
    
    const color = inlineStyle.color || computedStyle?.color || '';
    if (color && color !== 'rgb(0, 0, 0)' && color !== '#000000' && color !== 'initial') {
      style.color = color;
    }
    
    const textAlign = inlineStyle.textAlign || computedStyle?.textAlign || '';
    if (textAlign && textAlign !== 'start' && textAlign !== 'initial') {
      style.textAlign = textAlign;
    }
    
    const lineHeight = inlineStyle.lineHeight || computedStyle?.lineHeight || '';
    if (lineHeight && lineHeight !== 'normal') style.lineHeight = lineHeight;
    
    const letterSpacing = inlineStyle.letterSpacing || computedStyle?.letterSpacing || '';
    if (letterSpacing && letterSpacing !== 'normal') style.letterSpacing = letterSpacing;
    
    const opacity = inlineStyle.opacity || computedStyle?.opacity || '';
    if (opacity && opacity !== '1') style.opacity = opacity;
    
    const zIndex = inlineStyle.zIndex || computedStyle?.zIndex || '';
    if (zIndex && zIndex !== 'auto') style.zIndex = zIndex;
    
    // 背景样式
    if (inlineStyle.backgroundImage) style.backgroundImage = inlineStyle.backgroundImage;
    if (inlineStyle.backgroundSize) style.backgroundSize = inlineStyle.backgroundSize;
    if (inlineStyle.backgroundPosition) style.backgroundPosition = inlineStyle.backgroundPosition;
    
    // 读取内容
    let text: string | undefined;
    let html: string | undefined;
    let src: string | undefined;
    
    if (tag === 'IMG') {
      const img = element as HTMLImageElement;
      src = img.src || img.getAttribute('src') || undefined;
    } else {
      // 优先保存 innerHTML（保留 DOM 结构，如 span/br 等）
      html = element.innerHTML || undefined;
      // 同时保存 textContent 作为 fallback
      text = element.textContent?.trim() || element.innerText?.trim() || undefined;
    }
    
    // 读取 className（如果有）
    const className = element.className || undefined;
    
    elements[fieldName] = {
      key: fieldName,
      tag,
      text,
      html,
      src,
      className,
      style,
    };
  });
  
  return {
    meta,
    background: {
      selected: background.selected || undefined,
      pos: background.pos,
      size: background.size,
    },
    elements,
  };
}

/**
 * 恢复快照到 iframe 文档
 */
export function restoreSnapshot(
  iframeDoc: Document,
  snapshot: TemplateSnapshot,
  onMetaChange?: (meta: TemplateSnapshot['meta']) => void,
  onBackgroundChange?: (background: TemplateSnapshot['background']) => void
): void {
  // 恢复 meta（尺寸信息）
  if (onMetaChange) {
    onMetaChange(snapshot.meta);
  }
  
  // 恢复背景
  if (onBackgroundChange) {
    onBackgroundChange(snapshot.background);
  }
  
  // 恢复容器背景样式
  const container = iframeDoc.querySelector('.container') as HTMLElement;
  if (container && snapshot.background.selected) {
    const bgPosX = `calc(50% + ${snapshot.background.pos.x}px)`;
    const bgPosY = `calc(50% + ${snapshot.background.pos.y}px)`;
    container.style.backgroundImage = `url("${snapshot.background.selected}")`;
    container.style.backgroundPosition = `${bgPosX} ${bgPosY}`;
    container.style.backgroundSize = `${snapshot.background.size}%`;
    container.style.backgroundRepeat = 'no-repeat';
  }
  
  // 恢复所有元素
  Object.values(snapshot.elements).forEach((elementSnap) => {
    // 对于 IMG 元素，需要恢复所有匹配的图片（因为可能有多个图片有相同的 data-field）
    if (elementSnap.tag === 'IMG') {
      const allElements = Array.from(iframeDoc.querySelectorAll(`[data-field="${elementSnap.key}"]`)) as HTMLElement[];
      const imgElements = allElements.filter(el => el.tagName === 'IMG') as HTMLImageElement[];
      
      if (imgElements.length > 0 && elementSnap.src) {
        // 恢复所有图片的 src（使用快照中保存的 src）
        imgElements.forEach((img) => {
          img.src = elementSnap.src!;
        });
      }
      
      // 恢复样式（对所有图片应用相同的样式）
      imgElements.forEach((img) => {
        const style = elementSnap.style;
        
        // 获取当前样式，准备合并
        const currentStyle = img.getAttribute('style') || '';
        const styleParts = currentStyle.split(';').filter(part => {
          const trimmed = part.trim();
          if (!trimmed) return false;
          // 移除我们要恢复的样式属性，避免冲突
          return !trimmed.startsWith('transform') &&
                 !trimmed.startsWith('position') &&
                 !trimmed.startsWith('left') &&
                 !trimmed.startsWith('top') &&
                 !trimmed.startsWith('right') &&
                 !trimmed.startsWith('bottom') &&
                 !trimmed.startsWith('width') &&
                 !trimmed.startsWith('height') &&
                 !trimmed.startsWith('opacity') &&
                 !trimmed.startsWith('z-index');
        });
        
        const newStyleParts: string[] = [...styleParts];
        
        // 位置和尺寸
        if (style.position) newStyleParts.push(`position: ${style.position}`);
        if (style.left) newStyleParts.push(`left: ${style.left}`);
        if (style.top) newStyleParts.push(`top: ${style.top}`);
        if (style.right) newStyleParts.push(`right: ${style.right}`);
        if (style.bottom) newStyleParts.push(`bottom: ${style.bottom}`);
        if (style.width) newStyleParts.push(`width: ${style.width}`);
        if (style.height) newStyleParts.push(`height: ${style.height}`);
        
        // transform
        if (style.transform) newStyleParts.push(`transform: ${style.transform}`);
        if (style.transformOrigin) newStyleParts.push(`transform-origin: ${style.transformOrigin}`);
        
        if (style.opacity) newStyleParts.push(`opacity: ${style.opacity}`);
        if (style.zIndex) newStyleParts.push(`z-index: ${style.zIndex}`);
        
        // 设置新的样式
        const newStyle = newStyleParts.join('; ').trim();
        if (newStyle) {
          img.setAttribute('style', newStyle);
        } else {
          img.removeAttribute('style');
        }
        
        // 恢复 className
        if (elementSnap.className !== undefined) {
          img.className = elementSnap.className;
        }
      });
      
      return; // 已处理完 IMG 元素，继续下一个
    }
    
    // 非 IMG 元素的处理
    const element = iframeDoc.querySelector(`[data-field="${elementSnap.key}"]`) as HTMLElement;
    if (!element) return;
    
    // 恢复内容
    // 优先使用 innerHTML（保留 DOM 结构，如 span/br 等）
    // 只有在 html 不存在时，才 fallback 到 textContent
    if (elementSnap.html !== undefined) {
      element.innerHTML = elementSnap.html;
    } else if (elementSnap.text !== undefined) {
      element.textContent = elementSnap.text;
    }
    
    // 恢复 className
    if (elementSnap.className !== undefined) {
      element.className = elementSnap.className;
    }
    
    // 恢复样式（参考 save 功能的逻辑）
    const style = elementSnap.style;
    
    // 获取当前样式，准备合并
    const currentStyle = element.getAttribute('style') || '';
    const styleParts = currentStyle.split(';').filter(part => {
      const trimmed = part.trim();
      if (!trimmed) return false;
      // 移除我们要恢复的样式属性，避免冲突
      return !trimmed.startsWith('transform') &&
             !trimmed.startsWith('font-size') &&
             !trimmed.startsWith('font-family') &&
             !trimmed.startsWith('font-weight') &&
             !trimmed.startsWith('font-style') &&
             !trimmed.startsWith('color') &&
             !trimmed.startsWith('text-align') &&
             !trimmed.startsWith('line-height') &&
             !trimmed.startsWith('letter-spacing') &&
             !trimmed.startsWith('position') &&
             !trimmed.startsWith('left') &&
             !trimmed.startsWith('top') &&
             !trimmed.startsWith('right') &&
             !trimmed.startsWith('bottom') &&
             !trimmed.startsWith('width') &&
             !trimmed.startsWith('height') &&
             !trimmed.startsWith('opacity') &&
             !trimmed.startsWith('z-index');
    });
    
    const newStyleParts: string[] = [...styleParts];
    
    // 位置和尺寸
    if (style.position) newStyleParts.push(`position: ${style.position}`);
    if (style.left) newStyleParts.push(`left: ${style.left}`);
    if (style.top) newStyleParts.push(`top: ${style.top}`);
    if (style.right) newStyleParts.push(`right: ${style.right}`);
    if (style.bottom) newStyleParts.push(`bottom: ${style.bottom}`);
    if (style.width) {
      newStyleParts.push(`width: ${style.width}`);
      newStyleParts.push(`max-width: ${style.width}`);
      // 如果设置了宽度，确保文字不换行
      newStyleParts.push(`white-space: nowrap`);
      newStyleParts.push(`overflow: hidden`);
      newStyleParts.push(`text-overflow: ellipsis`);
    }
    if (style.height) newStyleParts.push(`height: ${style.height}`);
    
    // transform
    if (style.transform) newStyleParts.push(`transform: ${style.transform}`);
    if (style.transformOrigin) newStyleParts.push(`transform-origin: ${style.transformOrigin}`);
    
    // 字体样式
    if (style.fontSize) newStyleParts.push(`font-size: ${style.fontSize}`);
    if (style.fontFamily) newStyleParts.push(`font-family: ${style.fontFamily}`);
    if (style.fontWeight) newStyleParts.push(`font-weight: ${style.fontWeight}`);
    if (style.fontStyle) newStyleParts.push(`font-style: ${style.fontStyle}`);
    if (style.color) newStyleParts.push(`color: ${style.color}`);
    if (style.textAlign) newStyleParts.push(`text-align: ${style.textAlign}`);
    if (style.lineHeight) newStyleParts.push(`line-height: ${style.lineHeight}`);
    if (style.letterSpacing) newStyleParts.push(`letter-spacing: ${style.letterSpacing}`);
    if (style.opacity) newStyleParts.push(`opacity: ${style.opacity}`);
    if (style.zIndex) newStyleParts.push(`z-index: ${style.zIndex}`);
    
    // 背景样式
    if (style.backgroundImage) newStyleParts.push(`background-image: ${style.backgroundImage}`);
    if (style.backgroundSize) newStyleParts.push(`background-size: ${style.backgroundSize}`);
    if (style.backgroundPosition) newStyleParts.push(`background-position: ${style.backgroundPosition}`);
    
    // 设置新的样式
    const newStyle = newStyleParts.join('; ').trim();
    if (newStyle) {
      element.setAttribute('style', newStyle);
    } else {
      element.removeAttribute('style');
    }
  });
}

