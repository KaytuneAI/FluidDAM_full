import React, { useState, useRef, useEffect, useCallback } from "react";
import JSZip from "jszip";
import { TemplateField } from "../BannerBatchPage/types";
import { buildSrcDoc, extractCssFromHtml } from "../BannerBatchPage/htmlUtils";
import { processZipFile } from "../BannerBatchPage/zipHandler";
import { handleHtmlUpload as handleHtmlUploadUtil, handleCssUpload as handleCssUploadUtil } from "../BannerBatchPage/fileHandlers";
import { applyJsonDataToIframe as applyJsonDataToIframeUtil, updatePriceFields } from "../BannerBatchPage/dataApplier";
import { AssetSidebar } from "../../components/AssetSidebar";
import { ResizableSidebar } from "../../components/ResizableSidebar";
import type { TempAsset } from "@shared/types/assets";
import {
  readSessionPayload,
  SessionBusKeys,
  type LinkToBannerGenPayload,
} from "@shared/utils/sessionBus";
import { localAssetManager } from "@shared/utils/localAssetManager";
import { BannerData } from "../../types";
import { generateImageWithJimengAi, enrichPrompt } from "../../utils/jimengAi";
import "./TemplateGenPage.css";

export const TemplateGenPage: React.FC = () => {
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [cssContent, setCssContent] = useState<string>("");
  const [htmlFileName, setHtmlFileName] = useState<string>("");
  const [cssFileName, setCssFileName] = useState<string>("");
  
  // 保存原始 ZIP 文件结构信息（用于保存时重建相同结构）
  const [originalZipStructure, setOriginalZipStructure] = useState<{
    htmlPath: string; // 原始 HTML 文件路径（包含目录）
    cssPaths: string[]; // 原始 CSS 文件路径列表
    htmlDir: string; // HTML 文件所在目录（用于计算相对路径）
    imagePathMap: Map<string, string>; // dataUrl -> 原始图片路径的映射
    fontPathMap: Map<string, string>; // dataUrl -> 原始字体路径的映射
    originalFiles: Map<string, Uint8Array>; // 原始 ZIP 中所有文件的 bytes（路径 -> 文件内容）
    originalCssContents: Map<string, string>; // CSS 路径 -> 原始 CSS 内容（文件路径引用，不包含 base64）
  } | null>(null);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [iframeSize, setIframeSize] = useState<{ width: number; height: number } | null>(null);
  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [selectedFieldValue, setSelectedFieldValue] = useState<string>("");
  
  // 模板尺寸相关状态
  const [templateSize, setTemplateSize] = useState<'800x800' | '750x1000' | 'custom'>('800x800');
  const [customSize, setCustomSize] = useState<string>('800x800');
  
  // 背景相关状态
  const [backgrounds, setBackgrounds] = useState<string[]>([]);
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);
  const [backgroundPosition, setBackgroundPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 }); // 背景位置（像素偏移）
  const [backgroundSize, setBackgroundSize] = useState<number>(100); // 背景缩放百分比
  const [overlaySize, setOverlaySize] = useState<{ width: number; height: number } | null>(null); // 虚线边框尺寸
  const backgroundThumbRef = useRef<HTMLDivElement>(null);
  // 标记是否已经从模板加载了背景样式（避免覆盖）
  const hasLoadedBackgroundFromTemplate = useRef<boolean>(false);
  
  // 文生图相关状态
  const [showBackgroundOnly, setShowBackgroundOnly] = useState<boolean>(false); // 仅显示背景图
  const [imageGenPrompt, setImageGenPrompt] = useState<string>(""); // 文生图提示词
  const [isGenerating, setIsGenerating] = useState<boolean>(false); // 是否正在生成
  const [generationError, setGenerationError] = useState<string>(""); // 生成错误信息
  const [originalBackgroundBeforeGen, setOriginalBackgroundBeforeGen] = useState<string | null>(null); // 生成前的原始背景图
  
  // 折叠状态
  const [isTemplateSizeCollapsed, setIsTemplateSizeCollapsed] = useState<boolean>(false); // 模板尺寸区域是否折叠
  
  // 原始模板状态（用于尺寸切换时恢复）
  const [originalHtmlContent, setOriginalHtmlContent] = useState<string>("");
  const [originalCssContent, setOriginalCssContent] = useState<string>("");
  const [originalIframeSize, setOriginalIframeSize] = useState<{ width: number; height: number } | null>(null);
  const [originalBackgroundPosition, setOriginalBackgroundPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [originalBackgroundSize, setOriginalBackgroundSize] = useState<number>(100);
  
  // 缩放所有元素以适应新尺寸（保持宽高比，确保两边都能 fit 到新尺寸内）
  // 目标：不丢失任何元素，缩放原图直到长宽两边都可以 fit 到新尺寸内
  const scaleAllElementsToFit = useCallback((targetWidth: number, targetHeight: number) => {
    if (!iframeSize || !previewIframeRef.current) return;
    
    const currentWidth = iframeSize.width;
    const currentHeight = iframeSize.height;
    
    // 如果尺寸完全一样，不需要缩放
    if (currentWidth === targetWidth && currentHeight === targetHeight) {
      return;
    }
    
    // 计算缩放比例：保持宽高比，确保长宽两边都可以 fit 到新尺寸内
    // 取较小的比例，这样缩放后的尺寸可以完全 fit 到目标尺寸内
    // 例如：当前 1000x800，目标 500x500，scale = min(500/1000, 500/800) = 0.5
    // 缩放后内容尺寸为 500x400，可以完全 fit 到 500x500 内
    const scaleX = targetWidth / currentWidth;
    const scaleY = targetHeight / currentHeight;
    const scale = Math.min(scaleX, scaleY); // 取较小的比例，确保两个边都能 fit
    
    try {
      const iframeDoc = previewIframeRef.current.contentDocument || previewIframeRef.current.contentWindow?.document;
      if (!iframeDoc) return;
      
      // 缩放所有有 data-field 的元素
      const allFieldElements = Array.from(iframeDoc.querySelectorAll('[data-field]')) as HTMLElement[];
      allFieldElements.forEach((element) => {
        const currentTransform = element.style.transform || '';
        
        // 解析当前的 transform
        let translateX = 0;
        let translateY = 0;
        let scaleValue = 1;
        
        const translateMatch = currentTransform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        if (translateMatch) {
          translateX = parseFloat(translateMatch[1]) || 0;
          translateY = parseFloat(translateMatch[2]) || 0;
        }
        const scaleMatch = currentTransform.match(/scale\(([\d.]+)\)/);
        if (scaleMatch) {
          scaleValue = parseFloat(scaleMatch[1]) || 1;
        }
        
        // 应用缩放：位置和缩放值都要乘以 scale
        const newTranslateX = translateX * scale;
        const newTranslateY = translateY * scale;
        const newScale = scaleValue * scale;
        
        const newTransform = `translate(${newTranslateX}px, ${newTranslateY}px) scale(${newScale})`;
        element.style.transform = newTransform;
      });
      
      // 缩放背景位置（背景大小是百分比，不需要缩放）
      if (selectedBackground) {
        const newBgPositionX = backgroundPosition.x * scale;
        const newBgPositionY = backgroundPosition.y * scale;
        
        setBackgroundPosition({ x: newBgPositionX, y: newBgPositionY });
        // backgroundSize 是百分比，保持不变
        // 背景调整会在 iframeSize 和 overlaySize 更新后通过 useEffect 自动应用
      }
      
    } catch (e) {
      console.warn('缩放元素失败:', e);
    }
  }, [iframeSize, selectedBackground, backgroundPosition, backgroundSize]);

  // 从原始模板恢复并应用到新尺寸
  const restoreFromOriginalAndResize = useCallback((targetWidth: number, targetHeight: number) => {
    if (!originalHtmlContent || !originalCssContent || !originalIframeSize) {
      // 如果没有原始模板，使用当前逻辑（向后兼容）
      if (iframeSize && (iframeSize.width !== targetWidth || iframeSize.height !== targetHeight)) {
        scaleAllElementsToFit(targetWidth, targetHeight);
      }
      setIframeSize({ width: targetWidth, height: targetHeight });
      return;
    }

    // 从原始模板重新开始
    setHtmlContent(originalHtmlContent);
    setCssContent(originalCssContent);
    setBackgroundPosition(originalBackgroundPosition);
    setBackgroundSize(originalBackgroundSize);

    // 计算从原始尺寸到目标尺寸的缩放比例
    const scaleX = targetWidth / originalIframeSize.width;
    const scaleY = targetHeight / originalIframeSize.height;
    const scale = Math.min(scaleX, scaleY); // 取较小的比例，确保两个边都能 fit

    // 设置新尺寸（这会触发 iframe 重新渲染）
    setIframeSize({ width: targetWidth, height: targetHeight });

    // 等待 iframe 内容完全加载后，应用缩放
    // 使用多个延迟确保内容已渲染
    const applyScale = () => {
      if (!previewIframeRef.current) return;

      try {
        const iframeDoc = previewIframeRef.current.contentDocument || previewIframeRef.current.contentWindow?.document;
        if (!iframeDoc) return;

        // 检查是否有内容
        const body = iframeDoc.body;
        if (!body || body.children.length === 0) return;

        // 重置所有元素的 transform，然后应用新的缩放
        const allFieldElements = Array.from(iframeDoc.querySelectorAll('[data-field]')) as HTMLElement[];
        allFieldElements.forEach((element) => {
          // 重置 transform（从原始状态开始）
          element.style.transform = '';
          
          // 应用新的缩放
          const newTransform = `scale(${scale})`;
          element.style.transform = newTransform;
        });

        // 缩放背景位置
        if (selectedBackground) {
          const newBgPositionX = originalBackgroundPosition.x * scale;
          const newBgPositionY = originalBackgroundPosition.y * scale;
          setBackgroundPosition({ x: newBgPositionX, y: newBgPositionY });
        }
      } catch (e) {
        console.warn('恢复并缩放模板失败:', e);
      }
    };

    // 使用多个延迟确保 iframe 完全加载
    setTimeout(applyScale, 100);
    setTimeout(applyScale, 300);
    setTimeout(applyScale, 600);
  }, [originalHtmlContent, originalCssContent, originalIframeSize, originalBackgroundPosition, originalBackgroundSize, iframeSize, scaleAllElementsToFit, selectedBackground]);

  // 处理尺寸选择
  const handleSizeChange = useCallback((size: '800x800' | '750x1000' | 'custom') => {
    setTemplateSize(size);
    
    let targetWidth: number;
    let targetHeight: number;
    
    if (size === '800x800') {
      targetWidth = 800;
      targetHeight = 800;
    } else if (size === '750x1000') {
      targetWidth = 750;
      targetHeight = 1000;
    } else {
      // custom 时保持当前 customSize，等待用户输入
      return;
    }
    
    // 从原始模板恢复并应用到新尺寸
    restoreFromOriginalAndResize(targetWidth, targetHeight);
  }, [restoreFromOriginalAndResize]);
  
  // 处理自定义尺寸输入
  const handleCustomSizeChange = useCallback((value: string) => {
    setCustomSize(value);
    // 解析 "数字*数字" 或 "数字x数字" 格式
    const match = value.match(/^(\d+)[*x](\d+)$/i);
    if (match) {
      const width = parseInt(match[1], 10);
      const height = parseInt(match[2], 10);
      if (width > 0 && height > 0) {
        // 从原始模板恢复并应用到新尺寸
        restoreFromOriginalAndResize(width, height);
      }
    }
  }, [restoreFromOriginalAndResize]);

  // 应用背景调整到实际的 iframe
  // 将右侧小图中图片相对于虚线边框的位置和缩放，按比例转换到左侧大图
  const applyBackgroundAdjustment = useCallback((bgUrl: string, position: { x: number; y: number }, size: number) => {
    if (!previewIframeRef.current || !iframeSize || !overlaySize) return;

    try {
      const iframeDoc = previewIframeRef.current.contentDocument || previewIframeRef.current.contentWindow?.document;
      if (!iframeDoc) return;

      const container = iframeDoc.querySelector('.container') as HTMLElement;
      if (container) {
        // 计算缩放比例：右侧虚线边框尺寸 -> 左侧 iframe 尺寸
        const scaleX = iframeSize.width / overlaySize.width;
        const scaleY = iframeSize.height / overlaySize.height;
        
        // 将右侧图片的偏移量（相对于虚线边框中心）转换为左侧的偏移量
        // 右侧：transform: translate(x, y) 是相对于图片中心的移动
        // 左侧：backgroundPosition 需要相对于容器中心来计算
        // 由于 backgroundPosition 是相对于容器左上角的，我们需要：
        // 1. 将右侧的偏移量按比例放大
        // 2. 转换为相对于容器中心的偏移
        // 3. 再转换为相对于左上角的偏移
        
        // 右侧图片相对于虚线边框中心的偏移（position.x, position.y）
        // 转换为左侧相对于容器中心的偏移
        const offsetX = position.x * scaleX;
        const offsetY = position.y * scaleY;
        
        // backgroundPosition 使用 center 作为基准，然后加上偏移
        // 格式：`center center` 或 `calc(50% + offsetX) calc(50% + offsetY)`
        const bgPosX = `calc(50% + ${offsetX}px)`;
        const bgPosY = `calc(50% + ${offsetY}px)`;
        
        // 应用背景位置和大小
        container.style.backgroundImage = `url("${bgUrl}")`;
        container.style.backgroundPosition = `${bgPosX} ${bgPosY}`;
        container.style.backgroundSize = `${size}%`;
        container.style.backgroundRepeat = 'no-repeat';
      }
    } catch (e) {
      console.warn('应用背景调整失败:', e);
    }
  }, [iframeSize, overlaySize]);

  // 从 CSS 中提取 .container 的背景图片（主背景）
  const extractBackgroundImages = useCallback((html: string, css: string) => {
    const backgroundUrls: string[] = [];

    // 只提取 .container 的背景图片
    const containerBgRegex = /\.container\s*\{[^}]*background[^:]*:\s*url\(['"]?([^'")]+)['"]?\)/i;
    const match = containerBgRegex.exec(css);
    if (match) {
      const url = match[1].trim();
      // 只添加有效的图片 URL（base64、http 或图片文件扩展名）
      if (url && (url.startsWith('data:image') || url.startsWith('http') || url.match(/\.(png|jpg|jpeg|gif|webp|svg)/i))) {
        backgroundUrls.push(url);
      }
    }

    return backgroundUrls;
  }, []);

  // 从模板 HTML 和 CSS 中提取所有图片资源
  const extractTemplateAssets = useCallback((html: string, css: string): TempAsset[] => {
    const assets: TempAsset[] = [];
    const seenUrls = new Set<string>();

    try {
      // 1. 从 HTML 中提取所有 <img src="..."> 的图片
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const images = doc.querySelectorAll('img[src]');
      
      images.forEach((img, index) => {
        const src = (img as HTMLImageElement).src || img.getAttribute('src') || '';
        if (src && !seenUrls.has(src)) {
          seenUrls.add(src);
          const fieldName = img.getAttribute('data-field') || `img_${index}`;
          const fileName = src.split('/').pop()?.split('?')[0] || `image_${index}`;
          
          assets.push({
            id: `template_img_${index}_${Date.now()}`,
            name: fileName,
            url: src,
            dataUrl: src.startsWith('data:') ? src : undefined,
            source: 'template',
            fieldName: fieldName,
          });
        }
      });

      // 2. 从 CSS 中提取所有 background-image: url(...) 的图片
      const cssUrlRegex = /background(?:-image)?\s*:\s*url\(['"]?([^'")]+)['"]?\)/gi;
      let cssMatch;
      let cssIndex = 0;
      
      while ((cssMatch = cssUrlRegex.exec(css)) !== null) {
        const url = cssMatch[1].trim();
        if (url && !seenUrls.has(url)) {
          // 只处理有效的图片 URL
          if (url.startsWith('data:image') || url.startsWith('http') || url.match(/\.(png|jpg|jpeg|gif|webp|svg)/i)) {
            seenUrls.add(url);
            const fileName = url.split('/').pop()?.split('?')[0] || `css_bg_${cssIndex}`;
            
            assets.push({
              id: `template_css_${cssIndex}_${Date.now()}`,
              name: fileName,
              url: url,
              dataUrl: url.startsWith('data:') ? url : undefined,
              source: 'template',
              fieldName: `css_background_${cssIndex}`,
            });
            cssIndex++;
          }
        }
      }

      // 3. 从 HTML 中提取所有内联样式中的 background-image
      const inlineStyleRegex = /style\s*=\s*["'][^"']*background(?:-image)?\s*:\s*url\(['"]?([^'")]+)['"]?\)[^"']*["']/gi;
      let inlineMatch;
      let inlineIndex = 0;
      
      while ((inlineMatch = inlineStyleRegex.exec(html)) !== null) {
        const url = inlineMatch[1].trim();
        if (url && !seenUrls.has(url)) {
          if (url.startsWith('data:image') || url.startsWith('http') || url.match(/\.(png|jpg|jpeg|gif|webp|svg)/i)) {
            seenUrls.add(url);
            const fileName = url.split('/').pop()?.split('?')[0] || `inline_bg_${inlineIndex}`;
            
            assets.push({
              id: `template_inline_${inlineIndex}_${Date.now()}`,
              name: fileName,
              url: url,
              dataUrl: url.startsWith('data:') ? url : undefined,
              source: 'template',
              fieldName: `inline_background_${inlineIndex}`,
            });
            inlineIndex++;
          }
        }
      }
    } catch (error) {
      console.warn('提取模板素材失败:', error);
    }

    return assets;
  }, []);
  
  // JSON 数据相关状态（TemplateGen 主要用于编辑模板，数据功能简化）
  const [jsonData, setJsonData] = useState<BannerData[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  
  // 来自 Link 的素材
  const [linkedAssets, setLinkedAssets] = useState<TempAsset[]>([]);
  // 来自模板的素材
  const [templateAssets, setTemplateAssets] = useState<TempAsset[]>([]);
  // 来自本机存储的素材
  const [localAssets, setLocalAssets] = useState<TempAsset[]>([]);
  
  // 初始化时从本机加载素材
  useEffect(() => {
    const loadLocalAssets = async () => {
      try {
        const assets = await localAssetManager.loadAssets();
        setLocalAssets(assets);
        if (assets.length > 0) {
          console.log(`[TemplateGen] 从本机加载了 ${assets.length} 个素材`);
        }
      } catch (error) {
        console.error('[TemplateGen] 加载本机素材失败:', error);
      }
    };
    loadLocalAssets();
  }, []); // 只在组件挂载时执行一次
  
  // 素材面板宽度和收起状态
  const [assetSidebarWidth, setAssetSidebarWidth] = useState(280);
  const [assetSidebarCollapsed, setAssetSidebarCollapsed] = useState(false);

  const templateInputRef = useRef<HTMLInputElement>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  // 初始化时读取来自 Link 的素材
  useEffect(() => {
    const payload = readSessionPayload<LinkToBannerGenPayload>(
      SessionBusKeys.LINK_TO_BANNERGEN,
    );

    if (payload && payload.from === 'link') {
      setLinkedAssets(payload.assets);
      console.log('Imported assets from Link:', payload.assets);
      if (payload.assets.length > 0) {
        setSuccess(`已从 Link 导入 ${payload.assets.length} 个素材`);
      }
    }
  }, []);

  // 将模板 CSS 中的 @font-face 规则注入到顶层文档
  useEffect(() => {
    const STYLE_ID = "template-gen-font-style";
    let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

    if (!cssContent) {
      if (styleEl) {
        styleEl.remove();
      }
      return;
    }

    const matches = cssContent.match(/@font-face[\s\S]*?}/g);
    const fontCss = matches ? matches.join("\n") : "";

    if (!fontCss) {
      if (styleEl) {
        styleEl.remove();
      }
      return;
    }

    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      document.head.appendChild(styleEl);
    }

    styleEl.innerHTML = fontCss;

    return () => {
      const existingStyle = document.getElementById(STYLE_ID);
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, [cssContent]);

  // 调整 iframe 尺寸以匹配内容（显示原始尺寸，超出视口时使用滚动条）
  // 从 iframe 的 .container 读取背景样式并更新 state
  const loadBackgroundStyleFromIframe = useCallback(() => {
    if (!previewIframeRef.current) return;

    try {
      const iframeDoc = previewIframeRef.current.contentDocument || previewIframeRef.current.contentWindow?.document;
      if (!iframeDoc) return;

      const container = iframeDoc.querySelector('.container') as HTMLElement;
      if (!container) return;

      // 优先读取 inline style（这是用户保存的值），如果没有再读取 computed style
      const inlineBgSize = container.style.backgroundSize;
      const inlineBgPosition = container.style.backgroundPosition;
      
      // 如果 inline style 中有值，说明是用户保存的，需要读取
      const hasInlineStyle = inlineBgSize || inlineBgPosition;
      
      if (!hasInlineStyle) {
        // 没有 inline style，可能是默认值，不读取
        return;
      }

      // 读取 computed style（包含 inline style 和 CSS）
      const computedStyle = iframeDoc.defaultView?.getComputedStyle(container);
      if (!computedStyle) return;

      // 解析 backgroundSize（优先使用 inline style）
      const bgSize = inlineBgSize || computedStyle.backgroundSize || '';
      if (bgSize) {
        // 处理 "150%" 或 "100% 100%" 格式
        const sizeMatch = bgSize.match(/^(\d+(?:\.\d+)?)%/);
        if (sizeMatch) {
          const parsedSize = parseFloat(sizeMatch[1]);
          if (!isNaN(parsedSize) && parsedSize > 0) {
            setBackgroundSize(parsedSize);
            // 同时更新原始背景大小
            setOriginalBackgroundSize(parsedSize);
          }
        }
      }

      // 解析 backgroundPosition（优先使用 inline style）
      const bgPosition = inlineBgPosition || computedStyle.backgroundPosition || '';
      if (bgPosition) {
        // 处理 "calc(50% + 12px) calc(50% + 34px)" 格式
        let parsedX = 0;
        let parsedY = 0;

        // 使用全局匹配找到所有 calc(50% + Xpx) 表达式
        const calcMatches = bgPosition.matchAll(/calc\(50%\s*\+\s*([-\d.]+)px\)/gi);
        const matchesArray = Array.from(calcMatches);
        
        if (matchesArray.length >= 1) {
          // 第一个匹配是 X 坐标
          parsedX = parseFloat(matchesArray[0][1]) || 0;
        }
        if (matchesArray.length >= 2) {
          // 第二个匹配是 Y 坐标
          parsedY = parseFloat(matchesArray[1][1]) || 0;
        }

        // 如果解析成功（至少有一个 calc 表达式），更新 state
        if (matchesArray.length > 0) {
          setBackgroundPosition({ x: parsedX, y: parsedY });
          // 同时更新原始背景位置
          setOriginalBackgroundPosition({ x: parsedX, y: parsedY });
          console.log('[TemplateGen] 从模板加载背景样式:', { size: bgSize, position: { x: parsedX, y: parsedY } });
        }
      }
    } catch (e) {
      console.warn('读取背景样式失败:', e);
    }
  }, []);

  const adjustIframeSize = useCallback(() => {
    const iframe = previewIframeRef.current;
    if (!iframe) return;

    const checkSize = () => {
      try {
        if (!iframe) return;

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) return;

        const body = iframeDoc.body;
        const html = iframeDoc.documentElement;

        if (body && html) {
          // 获取内容的实际尺寸（原始像素尺寸）
          const width = Math.max(
            body.scrollWidth,
            body.offsetWidth,
            html.clientWidth,
            html.scrollWidth,
            html.offsetWidth
          );
          const height = Math.max(
            body.scrollHeight,
            body.offsetHeight,
            html.clientHeight,
            html.scrollHeight,
            html.offsetHeight
          );

          // 直接使用原始尺寸，不进行缩放
          // 如果超出视口，通过 CSS overflow 显示滚动条
          if (width > 0 && height > 0) {
            setIframeSize({ width, height });
            
            // 在设置 iframeSize 后，读取背景样式（如果存在）
            // 延迟一点确保样式已应用
            setTimeout(() => {
              loadBackgroundStyleFromIframe();
            }, 50);
          }
        }
      } catch (e) {
        // 跨域或其他错误时，使用默认尺寸
        console.warn("无法获取 iframe 内容尺寸:", e);
      }
    };

    // 延迟检查，确保内容已渲染
    setTimeout(checkSize, 50);
    
    // 也等待图片等资源加载
    setTimeout(checkSize, 300);
    setTimeout(checkSize, 600);
  }, [loadBackgroundStyleFromIframe]);

  // 当 HTML 或 CSS 内容变化时，调整 iframe 尺寸
  useEffect(() => {
    if (htmlContent && previewIframeRef.current) {
      // 等待 iframe 加载完成后再调整尺寸
      const timer = setTimeout(() => {
        adjustIframeSize();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [htmlContent, cssContent, adjustIframeSize]);


  // 当 iframeSize 首次设置时，保存为原始尺寸（仅在模板首次加载时）
  useEffect(() => {
    if (iframeSize && !originalIframeSize && htmlContent) {
      // 这是首次加载模板，保存原始状态
      setOriginalHtmlContent(htmlContent);
      setOriginalCssContent(cssContent);
      setOriginalIframeSize(iframeSize);
      setOriginalBackgroundPosition(backgroundPosition);
      setOriginalBackgroundSize(backgroundSize);
    }
  }, [iframeSize, htmlContent, cssContent, backgroundPosition, backgroundSize, originalIframeSize]);

  // 当模板尺寸变化时，自动调整背景图片以填满新尺寸
  // 关键修复：如果模板里已经有 background-image（包括 AI 生成的），不要覆盖
  useEffect(() => {
    if (!iframeSize || !previewIframeRef.current) return;

    const adjustBackground = () => {
      try {
        const iframeDoc = previewIframeRef.current?.contentDocument || previewIframeRef.current?.contentWindow?.document;
        if (!iframeDoc) return;

        const container = iframeDoc.querySelector('.container') as HTMLElement;
        if (!container) return;

        // 🚨 核心保护：如果模板里已经有 backgroundImage，就不要覆盖
        const inlineBgImage = container.style.backgroundImage;
        const computedBgImage = iframeDoc.defaultView?.getComputedStyle(container).backgroundImage;
        const hasBgImage = 
          (inlineBgImage && inlineBgImage !== 'none' && inlineBgImage !== '') ||
          (computedBgImage && computedBgImage !== 'none' && computedBgImage !== '');

        if (hasBgImage) {
          // 模板已有背景（包括 AI 生成的），只调整容器尺寸，不覆盖背景样式
          container.style.width = `${iframeSize.width}px`;
          container.style.height = `${iframeSize.height}px`;
          console.log('[TemplateGen] 检测到模板已有背景图片，保留背景样式，只调整容器尺寸');
          return;
        }

        // 只有「真的没有背景」时，才用 cover 模式
          container.style.backgroundSize = 'cover';
          container.style.backgroundPosition = 'center center';
          container.style.backgroundRepeat = 'no-repeat';
          container.style.width = `${iframeSize.width}px`;
          container.style.height = `${iframeSize.height}px`;
      } catch (e) {
        console.warn('调整背景图片失败:', e);
      }
    };

    // 延迟执行，确保 iframe 已加载
    const timer = setTimeout(adjustBackground, 100);
    return () => clearTimeout(timer);
  }, [iframeSize]);

  // 计算右侧虚线边框尺寸，确保与左侧 iframe 宽高比一致
  useEffect(() => {
    if (!backgroundThumbRef.current || !iframeSize || !selectedBackground) {
      setOverlaySize(null);
      return;
    }

    const calculateOverlaySize = () => {
      const containerEl = backgroundThumbRef.current;
      if (!containerEl) return;

      const containerWidth = containerEl.offsetWidth || 300;
      const containerHeight = containerEl.offsetHeight || 300;
      const targetAspect = iframeSize.width / iframeSize.height;
      const containerAspect = containerWidth / containerHeight;
      
      let overlayWidth: number;
      let overlayHeight: number;
      
      // 根据容器和目标宽高比，计算最大适配尺寸
      if (targetAspect > containerAspect) {
        // 目标更宽，以容器宽度为准
        overlayWidth = containerWidth * 0.95; // 留一点边距
        overlayHeight = overlayWidth / targetAspect;
        // 如果高度超出，则以高度为准重新计算
        if (overlayHeight > containerHeight * 0.95) {
          overlayHeight = containerHeight * 0.95;
          overlayWidth = overlayHeight * targetAspect;
        }
      } else {
        // 目标更高，以容器高度为准
        overlayHeight = containerHeight * 0.95; // 留一点边距
        overlayWidth = overlayHeight * targetAspect;
        // 如果宽度超出，则以宽度为准重新计算
        if (overlayWidth > containerWidth * 0.95) {
          overlayWidth = containerWidth * 0.95;
          overlayHeight = overlayWidth / targetAspect;
        }
      }
      
      setOverlaySize({ width: overlayWidth, height: overlayHeight });
    };

    // 立即计算一次
    calculateOverlaySize();

    // 使用 ResizeObserver 监听容器尺寸变化
    const resizeObserver = new ResizeObserver(() => {
      calculateOverlaySize();
    });

    resizeObserver.observe(backgroundThumbRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [iframeSize, selectedBackground]);

  // 使用原生事件监听器处理滚轮事件，在捕获阶段就阻止事件传播
  useEffect(() => {
    if (!backgroundThumbRef.current || !selectedBackground) return;

    const element = backgroundThumbRef.current;

    const handleWheel = (e: WheelEvent) => {
      // 检查事件是否发生在背景图片区域内
      const target = e.target as HTMLElement;
      if (!element.contains(target) && target !== element) return;

      // 阻止默认行为和事件传播
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // 处理缩放 - 使用最新的状态值
      setBackgroundSize(prevSize => {
        const delta = e.deltaY > 0 ? -5 : 5;
        const newSize = Math.max(50, Math.min(200, prevSize + delta));
        // 使用函数式更新确保使用最新的 backgroundPosition
        setBackgroundPosition(currentPos => {
          applyBackgroundAdjustment(selectedBackground, currentPos, newSize);
          return currentPos;
        });
        return newSize;
      });
    };

    // 在捕获阶段处理，确保在其他监听器之前执行
    element.addEventListener('wheel', handleWheel, { passive: false, capture: true });

    return () => {
      element.removeEventListener('wheel', handleWheel, { capture: true } as EventListenerOptions);
    };
  }, [selectedBackground, applyBackgroundAdjustment]);

  // 当 overlaySize 更新后，自动应用背景调整（用于尺寸切换后的背景调整）
  useEffect(() => {
    if (!selectedBackground || !overlaySize || !iframeSize) return;
    
    // 如果还没有从模板加载背景样式，先尝试加载
    if (!hasLoadedBackgroundFromTemplate.current) {
      loadBackgroundStyleFromIframe();
      hasLoadedBackgroundFromTemplate.current = true;
      // 加载后延迟应用，确保 state 已更新
      const loadTimer = setTimeout(() => {
        applyBackgroundAdjustment(selectedBackground, backgroundPosition, backgroundSize);
      }, 150);
      return () => clearTimeout(loadTimer);
    }
    
    // 延迟执行，确保 overlaySize 已经更新
    const timer = setTimeout(() => {
      applyBackgroundAdjustment(selectedBackground, backgroundPosition, backgroundSize);
    }, 100);
    
    return () => clearTimeout(timer);
  }, [overlaySize, iframeSize, selectedBackground, backgroundPosition, backgroundSize, applyBackgroundAdjustment, loadBackgroundStyleFromIframe]);

  // 仅显示背景图功能：当选中时，隐藏所有非背景元素，并应用背景调整（与尺寸切换时相同的逻辑）
  useEffect(() => {
    if (!previewIframeRef.current || !htmlContent) return;

    const iframeDoc = previewIframeRef.current.contentDocument || previewIframeRef.current.contentWindow?.document;
    if (!iframeDoc) return;

    const container = iframeDoc.querySelector('.container') as HTMLElement;
    if (!container) return;

    // 获取所有需要隐藏的元素：
    // 1. 所有有 data-field 的元素
    // 2. container 内部的所有直接子元素（除了背景图本身）
    const fieldElements = Array.from(iframeDoc.querySelectorAll('[data-field]')) as HTMLElement[];
    const containerChildren = Array.from(container.children) as HTMLElement[];
    
    if (showBackgroundOnly) {
      // 隐藏所有有 data-field 的元素
      fieldElements.forEach((el) => {
        el.style.display = 'none';
      });
      
      // 隐藏 container 内部的所有直接子元素（这些可能是文本、图片等非背景元素）
      containerChildren.forEach((el) => {
        el.style.display = 'none';
      });
      
      // 应用与尺寸切换时相同的背景调整逻辑
      if (selectedBackground && iframeSize) {
        // 确保容器尺寸匹配 iframe 尺寸
        container.style.width = `${iframeSize.width}px`;
        container.style.height = `${iframeSize.height}px`;
        
        // 如果有背景调整参数，应用它们（使用 applyBackgroundAdjustment）
        if (overlaySize) {
          applyBackgroundAdjustment(selectedBackground, backgroundPosition, backgroundSize);
        } else {
          // 如果没有 overlaySize，使用默认的背景设置（cover 模式）
          container.style.backgroundImage = `url("${selectedBackground}")`;
          container.style.backgroundSize = 'cover';
          container.style.backgroundPosition = 'center center';
          container.style.backgroundRepeat = 'no-repeat';
        }
      }
    } else {
      // 恢复显示所有元素
      fieldElements.forEach((el) => {
        el.style.display = '';
      });
      containerChildren.forEach((el) => {
        el.style.display = '';
      });
      
      // 恢复背景调整（如果有选中的背景）
      if (selectedBackground && overlaySize) {
        applyBackgroundAdjustment(selectedBackground, backgroundPosition, backgroundSize);
      }
    }

    // 清理函数：恢复显示
    return () => {
      fieldElements.forEach((el) => {
        el.style.display = '';
      });
      containerChildren.forEach((el) => {
        el.style.display = '';
      });
    };
  }, [showBackgroundOnly, htmlContent, selectedBackground, iframeSize, overlaySize, backgroundPosition, backgroundSize, applyBackgroundAdjustment]);

  // 当背景列表更新时，如果当前没有选中的背景图，自动选中第一个
  useEffect(() => {
    if (!selectedBackground && backgrounds.length > 0) {
      setSelectedBackground(backgrounds[0]);
      console.log('[TemplateGen] 自动选中第一个背景图', { backgroundUrl: backgrounds[0].substring(0, 50) + '...' });
    }
  }, [backgrounds, selectedBackground]);

  // 处理文生图生成
  const handleImageGeneration = useCallback(async () => {
    if (!imageGenPrompt.trim()) {
      setGenerationError('请输入提示词');
      return;
    }

    if (!iframeSize) {
      setGenerationError('模板尺寸未设置');
      return;
    }

    setIsGenerating(true);
    setGenerationError('');

    try {
      // 如果有选中的背景图，使用它（图生图）；否则纯文生图创建新背景
      // 如果没有选中背景图，但背景列表不为空，自动使用第一个背景图
      let actualSelectedBackground = selectedBackground;
      if (!actualSelectedBackground && backgrounds.length > 0) {
        actualSelectedBackground = backgrounds[0];
        console.log('[TemplateGen] 自动选择第一个背景图', { backgroundUrl: actualSelectedBackground.substring(0, 50) + '...' });
      }
      
      // 保存生成前的原始背景图（用于显示在图片选择区域）
      if (actualSelectedBackground) {
        setOriginalBackgroundBeforeGen(actualSelectedBackground);
      }
      
      const isImageToImage = !!actualSelectedBackground;

      // 增强提示词
      // 注意：imageDescription 可以后续添加为可选的用户输入字段
      // 目前使用默认描述，用户可以根据实际图片在前端添加输入框来修改
      const enrichedPrompt = enrichPrompt(
        imageGenPrompt,
        iframeSize.width,
        iframeSize.height,
        isImageToImage
        // imageDescription: 可以添加一个可选的图片描述输入框
      );

      // 处理图片：如果是 Blob URL，需要转换为 base64；如果是 data URL，直接使用
      let imageUrlForApi: string | undefined = undefined;
      let imageBase64ForApi: string | undefined = undefined;
      
      console.log('[TemplateGen] 图片处理开始', {
        hasSelectedBackground: !!actualSelectedBackground,
        selectedBackgroundType: actualSelectedBackground ? (actualSelectedBackground.startsWith('blob:') ? 'blob' : actualSelectedBackground.startsWith('data:') ? 'data' : 'url') : 'none',
        selectedBackgroundPrefix: actualSelectedBackground ? actualSelectedBackground.substring(0, 50) : 'none',
        isImageToImage,
        backgroundsCount: backgrounds.length
      });
      
      if (actualSelectedBackground) {
        if (actualSelectedBackground.startsWith('blob:')) {
          // Blob URL：需要转换为 base64（后端无法直接下载 Blob URL）
          console.log('[TemplateGen] 检测到 Blob URL，开始转换为 base64...');
          try {
            const response = await fetch(actualSelectedBackground);
            const blob = await response.blob();
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve, reject) => {
              reader.onloadend = () => {
                const base64 = reader.result as string;
                console.log('[TemplateGen] Blob URL 转换为 base64 成功', { base64Length: base64.length });
                resolve(base64);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            imageBase64ForApi = await base64Promise;
          } catch (error) {
            console.error('[TemplateGen] 转换 Blob URL 为 base64 失败:', error);
            setGenerationError('图片处理失败，请重试');
            return;
          }
        } else if (actualSelectedBackground.startsWith('data:image')) {
          // Data URL：直接使用
          console.log('[TemplateGen] 检测到 Data URL，直接使用', { dataUrlLength: actualSelectedBackground.length });
          imageBase64ForApi = actualSelectedBackground;
        } else {
          // 普通 URL：直接传递
          console.log('[TemplateGen] 检测到普通 URL，直接传递', { url: actualSelectedBackground.substring(0, 100) });
          imageUrlForApi = actualSelectedBackground;
        }
      } else {
        console.log('[TemplateGen] 没有选中的背景图，使用文生图模式');
      }

      console.log('[TemplateGen] 调用即梦 AI API', {
        hasImageUrl: !!imageUrlForApi,
        hasImageBase64: !!imageBase64ForApi,
        mode: isImageToImage ? 'i2i' : 't2i',
        promptLength: enrichedPrompt.length,
        promptPreview: enrichedPrompt.substring(0, 100) + '...'
      });

      // 调用即梦 AI API
      const result = await generateImageWithJimengAi({
        prompt: enrichedPrompt,
        imageUrl: imageUrlForApi, // 普通 URL（如果有）
        imageBase64: imageBase64ForApi, // base64 或 data URL（如果有）
        mode: isImageToImage ? 'i2i' : 't2i', // 明确指定模式：i2i=图生图/in-place edit, t2i=文生图
        width: iframeSize.width,
        height: iframeSize.height,
        negativePrompt: '低质量、模糊、变形、扭曲',
      });

      if (result.success && (result.imageUrl || result.imageBase64)) {
        // 更新背景图片
        // 1024x1024 的图片 base64 后只有 100-200KB，直接使用 data URL 即可
        let newBackgroundUrl: string;
        if (result.imageUrl) {
          newBackgroundUrl = result.imageUrl;
        } else if (result.imageBase64) {
          // 检查是否已经有 data:image 前缀
          if (result.imageBase64.startsWith('data:image')) {
            // 直接使用 data URL（1024x1024 图片很小，不需要转换为 Blob URL）
                newBackgroundUrl = result.imageBase64;
          } else {
            // 纯 base64，添加前缀（默认 PNG 格式）
                newBackgroundUrl = `data:image/png;base64,${result.imageBase64}`;
          }
        } else {
          setGenerationError('未返回图片数据');
          return;
        }
        
        // 更新背景列表
        setBackgrounds((prev) => {
          const updated = [...prev];
          // 如果有选中的背景图，替换它；否则添加新图片
          if (selectedBackground) {
            const currentIndex = updated.indexOf(selectedBackground);
            if (currentIndex >= 0) {
              updated[currentIndex] = newBackgroundUrl;
            } else {
              updated.push(newBackgroundUrl);
            }
          } else {
            // 纯文生图：添加新背景图
            updated.push(newBackgroundUrl);
          }
          return updated;
        });

        // 设置为当前选中的背景
        setSelectedBackground(newBackgroundUrl);
        
        // 自动保存 AI 生成的图片到本机
        try {
          const asset: TempAsset = {
            id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: `AI生成_${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}_${imageGenPrompt.substring(0, 20).replace(/[^\w\u4e00-\u9fa5]/g, '') || '图片'}.png`,
            dataUrl: newBackgroundUrl,
            source: 'ai-generated',
            mimeType: 'image/png',
            width: iframeSize.width,
            height: iframeSize.height,
            prompt: imageGenPrompt,
            generatedAt: Date.now(),
            templateSize: `${iframeSize.width}x${iframeSize.height}`,
          };
          
          await localAssetManager.saveAssets([asset]);
          console.log('[TemplateGen] AI 生成的图片已自动保存到本机');
          
          // 更新本地素材列表，让新保存的素材立即显示在素材面板中
          setLocalAssets(prev => [...prev, asset]);
        } catch (error) {
          console.error('[TemplateGen] 保存 AI 生成图片失败:', error);
          // 不阻塞用户，静默失败
        }
        
        setSuccess('背景图生成成功！');
      } else {
        setGenerationError(result.error || '生成失败，请重试');
      }
    } catch (error: any) {
      console.error('生成图片失败:', error);
      setGenerationError(error.message || '生成失败，请检查网络连接和 API 配置');
    } finally {
      setIsGenerating(false);
    }
  }, [imageGenPrompt, selectedBackground, iframeSize]);

  // 统一处理模板上传（支持 ZIP 和 HTML）
  const handleTemplateUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    try {
      const fileName = file.name.toLowerCase();
      
      // 判断文件类型
      if (fileName.endsWith('.zip')) {
        // ZIP 文件处理
        const result = await processZipFile(file);
        setHtmlContent(result.html);
        setCssContent(result.css);
        setHtmlFileName(result.htmlFileName || file.name);
        setCssFileName(result.cssFileName || "");
        setTemplateFields(result.fields);
        
        // 重置背景加载标记，允许从新模板加载背景样式
        hasLoadedBackgroundFromTemplate.current = false;
        
        // 解析 ZIP 文件以获取原始路径映射（dataUrl -> 原始路径）和保存所有原始文件
        const zip = await JSZip.loadAsync(file);
        const imagePathMap = new Map<string, string>(); // dataUrl -> 原始路径
        const fontPathMap = new Map<string, string>(); // dataUrl -> 原始路径
        const originalFiles = new Map<string, Uint8Array>(); // 路径 -> 文件内容（保存所有原始文件）
        const cssPaths: string[] = [];
        let htmlPath = result.htmlFileName || 'index.html';
        let htmlDir = '';
        
        // 获取 HTML 目录
        const htmlFiles: JSZip.JSZipObject[] = [];
        zip.forEach((relativePath, entry) => {
          if (entry.dir) return;
          const lower = relativePath.toLowerCase();
          if (lower.endsWith('.html') || lower.endsWith('.htm')) {
            htmlFiles.push(entry);
          }
        });
        const mainHtmlEntry = htmlFiles.find(f => f.name.toLowerCase().includes('index')) || htmlFiles[0];
        if (mainHtmlEntry) {
          htmlPath = mainHtmlEntry.name;
          htmlDir = mainHtmlEntry.name.split('/').slice(0, -1).join('/');
        }
        
        // 处理所有文件，建立 dataUrl 到原始路径的映射，并保存所有原始文件的 bytes
        for (const [relativePath, entry] of Object.entries(zip.files)) {
          if (entry.dir) continue;
          const lower = relativePath.toLowerCase();
          
          // 保存所有原始文件的 bytes（用于后续全量写回）
          try {
            const fileBytes = await entry.async('uint8array');
            originalFiles.set(entry.name, fileBytes);
          } catch (e) {
            console.warn(`无法读取文件 ${entry.name} 的 bytes:`, e);
          }
          
          if (lower.endsWith('.css')) {
            cssPaths.push(entry.name);
          } else if (
            lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
            lower.endsWith('.gif') || lower.endsWith('.webp') || lower.endsWith('.svg')
          ) {
            // 图片文件：读取并创建 dataUrl，建立映射
            try {
              const ext = entry.name.toLowerCase().split('.').pop() || 'png';
              let mime = 'image/png';
              if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
              else if (ext === 'gif') mime = 'image/gif';
              else if (ext === 'webp') mime = 'image/webp';
              else if (ext === 'svg') mime = 'image/svg+xml';
              
              const base64 = await entry.async('base64');
              const dataUrl = `data:${mime};base64,${base64}`;
              imagePathMap.set(dataUrl, entry.name);
            } catch (e) {
              console.warn(`无法处理图片文件 ${entry.name}:`, e);
            }
          } else if (
            lower.endsWith('.ttf') || lower.endsWith('.otf') || lower.endsWith('.woff') ||
            lower.endsWith('.woff2') || lower.endsWith('.eot')
          ) {
            // 字体文件：读取并创建 dataUrl，建立映射
            try {
              const ext = entry.name.toLowerCase().split('.').pop() || 'ttf';
              let mime = 'font/ttf';
              if (ext === 'otf') mime = 'font/opentype';
              else if (ext === 'woff') mime = 'font/woff';
              else if (ext === 'woff2') mime = 'font/woff2';
              else if (ext === 'eot') mime = 'application/vnd.ms-fontobject';
              
              const base64 = await entry.async('base64');
              const dataUrl = `data:${mime};base64,${base64}`;
              fontPathMap.set(dataUrl, entry.name);
            } catch (e) {
              console.warn(`无法处理字体文件 ${entry.name}:`, e);
            }
          }
        }
        
        const finalCssPaths = cssPaths.length > 0 ? cssPaths : 
          (result.cssFileName ? result.cssFileName.split(', ').map(name => name.trim()) : ['style.css']);
        
        // 关键修复：保存原始 CSS 内容（包含文件路径引用，不包含 base64）
        const originalCssContents = new Map<string, string>();
        for (const cssPath of finalCssPaths) {
          const cssEntry = zip.files[cssPath];
          if (cssEntry && !cssEntry.dir) {
            try {
              const cssText = await cssEntry.async('text');
              originalCssContents.set(cssPath, cssText);
              console.log('[TemplateGen] 保存原始 CSS 内容:', cssPath, '长度:', cssText.length);
            } catch (e) {
              console.warn(`无法读取原始 CSS 文件 ${cssPath}:`, e);
            }
          }
        }
        
        setOriginalZipStructure({
          htmlPath,
          cssPaths: finalCssPaths,
          htmlDir,
          imagePathMap,
          fontPathMap,
          originalFiles, // 保存所有原始文件的 bytes
          originalCssContents, // 保存原始 CSS 内容（文件路径引用）
        });
        // TemplateGen 不需要 JSON 数据，只关注模板结构
        // iframeSize will be adjusted automatically after iframe loads via adjustIframeSize
        setSuccess(`模板加载成功！包含 ${result.fields.length} 个可替换字段`);
        
        // 提取背景图片
        const bgImages = extractBackgroundImages(result.html, result.css);
        setBackgrounds(bgImages);
        
        // 提取模板中的所有图片素材
        const assets = extractTemplateAssets(result.html, result.css);
        setTemplateAssets(assets);
        if (assets.length > 0) {
          console.log(`[TemplateGen] 从模板中提取了 ${assets.length} 个素材`, assets);
        }
        
        // 重置原始模板状态（将在 iframeSize 设置时保存）
        setOriginalHtmlContent("");
        setOriginalCssContent("");
        setOriginalIframeSize(null);
      } else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
        // HTML 文件处理（会自动提取 CSS）
        const result = await handleHtmlUploadUtil(
          file,
          (result) => {
            setHtmlContent(result.html);
            setCssContent(result.css || "");
            setHtmlFileName(file.name);
            setCssFileName("");
            setTemplateFields(result.fields);
            setSuccess(`HTML 模板加载成功！包含 ${result.fields.length} 个可替换字段`);
            
            // 重置背景加载标记，允许从新模板加载背景样式
            hasLoadedBackgroundFromTemplate.current = false;
            
            // HTML 文件上传时，没有 ZIP 结构，使用默认结构
            setOriginalZipStructure({
              htmlPath: file.name,
              cssPaths: ['style.css'], // 默认 CSS 文件名
              htmlDir: '',
              imagePathMap: new Map(), // HTML 文件上传时没有原始路径映射
              fontPathMap: new Map(), // HTML 文件上传时没有原始路径映射
              originalFiles: new Map(), // HTML 文件上传时没有原始文件
            });
            
            // 提取背景图片
            const bgImages = extractBackgroundImages(result.html, result.css || "");
            setBackgrounds(bgImages);
            
            // 提取模板中的所有图片素材
            const assets = extractTemplateAssets(result.html, result.css || "");
            setTemplateAssets(assets);
            if (assets.length > 0) {
              console.log(`[TemplateGen] 从模板中提取了 ${assets.length} 个素材`, assets);
            }
            
            // 重置原始模板状态（将在 iframeSize 设置时保存）
            setOriginalHtmlContent("");
            setOriginalCssContent("");
            setOriginalIframeSize(null);
          },
          (message) => {
            setError(message);
          }
        );
      } else {
        setError("不支持的文件类型，请上传 ZIP 或 HTML 文件");
      }
    } catch (err: any) {
      setError(err.message || "文件处理失败");
      console.error("文件处理错误:", err);
    }

    // 清空 input
    if (templateInputRef.current) {
      templateInputRef.current.value = "";
    }
  }, []);

  // 清除所有 iframe 中的字段高亮（复用 BannerGen 的逻辑）
  const clearAllFieldHighlights = useCallback(() => {
    const previewIframe = previewIframeRef.current;
    if (previewIframe) {
      try {
        const iframeDoc = previewIframe.contentDocument || previewIframe.contentWindow?.document;
        if (iframeDoc) {
          const highlighted = iframeDoc.querySelectorAll(".field-highlight");
          highlighted.forEach((el) => el.classList.remove("field-highlight"));
        }
      } catch (e) {
        // 忽略错误
      }
    }
  }, []);
  
  // 高亮 iframe 中的元素（复用 BannerGen 的逻辑，简化版）
  const highlightElementInIframe = useCallback((fieldName: string) => {
    // 先清除所有高亮
    clearAllFieldHighlights();
    
    const iframe = previewIframeRef.current;
    if (!iframe) return;

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      // 普通字段处理
      const element = iframeDoc.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
      if (element) {
        // 添加高亮样式
        element.classList.add("field-highlight");
        
        // 获取元素的内容
        let value = "";
        if (element.tagName === "IMG") {
          value = (element as HTMLImageElement).src || "";
        } else {
          value = element.textContent?.trim() || element.innerText?.trim() || "";
        }
        setSelectedFieldValue(value);

        // 滚动到元素位置
        try {
          element.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (e) {
          // 如果滚动失败，忽略错误
        }
      } else {
        setSelectedFieldValue("未找到对应元素");
      }
    } catch (e) {
      console.warn("无法访问 iframe 内容:", e);
      setSelectedFieldValue("无法访问预览内容");
    }
  }, [clearAllFieldHighlights]);

  // 处理字段点击（复用 BannerGen 的逻辑）
  const handleFieldClick = useCallback((fieldName: string) => {
    // 如果点击的是已选中的字段，则取消选中；否则选中新字段
    if (selectedField === fieldName) {
      setSelectedField(null);
      setSelectedFieldValue("");
      // 清除所有 iframe 中的高亮
      clearAllFieldHighlights();
    } else {
      setSelectedField(fieldName);
      highlightElementInIframe(fieldName);
    }
  }, [selectedField, highlightElementInIframe, clearAllFieldHighlights]);

  // 更新字段值
  const updateFieldValue = useCallback((fieldName: string, value: string) => {
    if (!previewIframeRef.current?.contentDocument) return;

    const doc = previewIframeRef.current.contentDocument;
    const element = doc.querySelector(`[data-field="${fieldName}"]`);
    if (!element) return;

    if (element.tagName === 'IMG') {
      (element as HTMLImageElement).src = value;
    } else {
      element.textContent = value;
    }
  }, []);

  // 存储所有按钮的连续触发定时器（使用 Map 来区分不同的按钮）
  const continuousActionTimers = useRef<Map<string, { interval: NodeJS.Timeout | null; timeout: NodeJS.Timeout | null }>>(new Map());

  // 组件卸载时清理所有定时器
  useEffect(() => {
    return () => {
      continuousActionTimers.current.forEach((timers) => {
        if (timers.timeout) clearTimeout(timers.timeout);
        if (timers.interval) clearInterval(timers.interval);
      });
      continuousActionTimers.current.clear();
    };
  }, []);

  // 创建按住连续触发的辅助函数
  const createContinuousAction = useCallback((action: () => void, key: string) => {
    const startContinuous = () => {
      // 先停止之前的定时器（如果存在）
      const existing = continuousActionTimers.current.get(key);
      if (existing) {
        if (existing.timeout) clearTimeout(existing.timeout);
        if (existing.interval) clearInterval(existing.interval);
      }
      
      // 立即执行一次
      action();
      
      // 延迟后开始连续触发（缩短延迟时间，让响应更快）
      const timeout = setTimeout(() => {
        // 以固定间隔持续触发（加快触发频率）
        const interval = setInterval(() => {
          action();
        }, 30); // 每30ms触发一次（更快）
        
        // 更新 Map 中的 interval
        const current = continuousActionTimers.current.get(key);
        if (current) {
          current.interval = interval;
        }
      }, 100); // 100ms后开始连续触发（更快响应）
      
      // 保存定时器引用
      continuousActionTimers.current.set(key, { timeout, interval: null });
    };
    
    const stopContinuous = () => {
      const timers = continuousActionTimers.current.get(key);
      if (timers) {
        if (timers.timeout) {
          clearTimeout(timers.timeout);
          timers.timeout = null;
        }
        if (timers.interval) {
          clearInterval(timers.interval);
          timers.interval = null;
        }
        continuousActionTimers.current.delete(key);
      }
    };
    
    return {
      onMouseDown: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        startContinuous();
      },
      onMouseUp: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        stopContinuous();
      },
      onMouseLeave: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        stopContinuous();
      },
      // 添加 touch 事件支持（移动端）
      onTouchStart: (e: React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        startContinuous();
      },
      onTouchEnd: (e: React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        stopContinuous();
      },
    };
  }, []);

  // 调整元素位置和缩放（复用 BannerBatchPage 的逻辑）
  const adjustElementTransform = useCallback((fieldName: string, direction: 'up' | 'down' | 'left' | 'right' | 'zoomIn' | 'zoomOut') => {
    if (!previewIframeRef.current) return;
    
    try {
      const iframeDoc = previewIframeRef.current.contentDocument || previewIframeRef.current.contentWindow?.document;
      if (!iframeDoc) return;
      
      // 找到所有具有相同 data-field 的元素（支持图片和文本）
      const elements = Array.from(iframeDoc.querySelectorAll(`[data-field="${fieldName}"]`)) as HTMLElement[];
      
      if (elements.length === 0) return;
      
      // 获取第一个元素的父容器尺寸（用于计算百分比）
      const firstElement = elements[0];
      const parent = firstElement.parentElement;
      const parentWidth = parent?.offsetWidth || firstElement.offsetWidth || 800;
      const parentHeight = parent?.offsetHeight || firstElement.offsetHeight || 800;
      
      // 计算移动步长（5%）
      const stepX = parentWidth * 0.05;
      const stepY = parentHeight * 0.05;
      const scaleStep = 0.05;
      
      // 对每个元素单独应用变化，保持各自的 transform
      elements.forEach((element, elementIndex) => {
        // 获取当前元素的 transform 值
        let currentTransform = element.style.transform || '';
        let translateX = 0;
        let translateY = 0;
        let scale = 1;
        
        // 解析当前的 transform
        if (currentTransform) {
          const translateMatch = currentTransform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
          if (translateMatch) {
            translateX = parseFloat(translateMatch[1]) || 0;
            translateY = parseFloat(translateMatch[2]) || 0;
          }
          const scaleMatch = currentTransform.match(/scale\(([\d.]+)\)/);
          if (scaleMatch) {
            scale = parseFloat(scaleMatch[1]) || 1;
          }
        }
        
        // 根据方向调整
        switch (direction) {
          case 'up':
            translateY -= stepY;
            break;
          case 'down':
            translateY += stepY;
            break;
          case 'left':
            translateX -= stepX;
            break;
          case 'right':
            translateX += stepX;
            break;
          case 'zoomIn':
            scale = Math.min(scale + scaleStep, 3); // 最大3倍
            break;
          case 'zoomOut':
            scale = Math.max(scale - scaleStep, 0.1); // 最小0.1倍
            break;
        }
        
        const newTransform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        
        // 应用新的 transform 到当前元素
        element.style.transform = newTransform;
        element.style.transformOrigin = 'center center';
      });
      
    } catch (e) {
      console.warn('调整元素变换失败:', e);
    }
  }, []);

  // 处理 iframe 内元素点击，自动选中对应的 data-field（复用 BannerGen 的逻辑）
  const handleIframeElementClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target) return;

    // 向上查找具有 data-field 属性的元素（增加查找层数，提高灵敏度）
    let element: HTMLElement | null = target;
    let fieldName: string | null = null;
    
    // 增加向上查找层数到15层，确保能找到嵌套较深的元素
    for (let i = 0; i < 15 && element; i++) {
      fieldName = element.getAttribute('data-field');
      if (fieldName) {
        break;
      }
      element = element.parentElement;
    }

    // 如果找到了 data-field，选中对应的字段
    if (fieldName) {
      e.preventDefault(); // 阻止默认行为
      e.stopPropagation(); // 阻止事件冒泡，避免触发其他点击事件
      
      // 使用 setTimeout 确保状态更新在下一个事件循环，避免事件冲突
      setTimeout(() => {
      if (selectedField === fieldName) {
        // 如果点击的是已选中的字段，则取消选中
        setSelectedField(null);
        setSelectedFieldValue("");
        clearAllFieldHighlights();
      } else {
        // 选中新字段
        setSelectedField(fieldName);
        highlightElementInIframe(fieldName);
      }
      }, 0);
    }
  }, [selectedField, highlightElementInIframe, clearAllFieldHighlights]);

  // 为选中的元素添加拖拽功能（复用 BannerGen 的逻辑）
  useEffect(() => {
    if (!selectedField || !previewIframeRef.current) return;

    const targetIframe = previewIframeRef.current;
    
    const setupDragAndZoom = (): (() => void) => {
      try {
        const iframeDoc = targetIframe.contentDocument || targetIframe.contentWindow?.document;
        if (!iframeDoc) return () => {}; // 返回空清理函数
        
        // 找到所有具有相同 data-field 的元素（支持图片和文本）
        const elements = Array.from(iframeDoc.querySelectorAll(`[data-field="${selectedField}"]`)) as HTMLElement[];
        
        if (elements.length === 0) return () => {}; // 返回空清理函数

        let isDragging = false;
        let draggedElement: HTMLElement | null = null;
        let startX = 0;
        let startY = 0;
        let startTranslateX = 0;
        let startTranslateY = 0;
        let currentScale = 1;

        const parseTransform = (transform: string) => {
          let tx = 0, ty = 0, s = 1;
          const translateMatch = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
          if (translateMatch) {
            tx = parseFloat(translateMatch[1]) || 0;
            ty = parseFloat(translateMatch[2]) || 0;
          }
          const scaleMatch = transform.match(/scale\(([\d.]+)\)/);
          if (scaleMatch) {
            s = parseFloat(scaleMatch[1]) || 1;
          }
          return { tx, ty, s };
        };

        const applyTransform = (el: HTMLElement, tx: number, ty: number, s: number) => {
          const transform = `translate(${tx}px, ${ty}px) scale(${s})`;
          el.style.transform = transform;
          el.style.transformOrigin = 'center center';
          el.style.cursor = 'move';
        };

        const handleMouseDown = (e: MouseEvent) => {
          if (e.button !== 0) return; // 只处理左键
          const target = e.target as HTMLElement;
          if (!target || !target.hasAttribute('data-field') || target.getAttribute('data-field') !== selectedField) {
            return;
          }

          isDragging = true;
          draggedElement = target;
          startX = e.clientX;
          startY = e.clientY;

          const currentTransform = draggedElement.style.transform || '';
          const parsed = parseTransform(currentTransform);
          startTranslateX = parsed.tx;
          startTranslateY = parsed.ty;
          currentScale = parsed.s;

          e.preventDefault();
          e.stopPropagation();
        };

        const handleMouseMove = (e: MouseEvent) => {
          if (!isDragging || !draggedElement) return;

          const deltaX = e.clientX - startX;
          const deltaY = e.clientY - startY;

          // 计算新的位置（需要考虑 iframe 的缩放）
          const iframeRect = targetIframe?.getBoundingClientRect();
          const scaleX = iframeRect ? (iframeRect.width / (iframeSize?.width || 800)) : 1;
          const scaleY = iframeRect ? (iframeRect.height / (iframeSize?.height || 800)) : 1;

          const newTx = startTranslateX + (deltaX / scaleX);
          const newTy = startTranslateY + (deltaY / scaleY);

          // 对当前拖拽的元素应用 transform
          applyTransform(draggedElement, newTx, newTy, currentScale);
          e.preventDefault();
        };

        const handleMouseUp = () => {
          isDragging = false;
          draggedElement = null;
        };

        const handleWheel = (e: WheelEvent) => {
          const target = e.target as HTMLElement;
          if (!target || !target.hasAttribute('data-field') || target.getAttribute('data-field') !== selectedField) {
            return;
          }

          // 只对图片元素支持滚轮缩放
          if (target.tagName !== 'IMG') return;

          e.preventDefault();
          e.stopPropagation();

          const currentTransform = target.style.transform || '';
          const parsed = parseTransform(currentTransform);
          
          const scaleStep = 0.05;
          const delta = e.deltaY > 0 ? -scaleStep : scaleStep;
          const newScale = Math.max(0.1, Math.min(3, parsed.s + delta));

          // 对当前滚轮的元素应用缩放
          applyTransform(target, parsed.tx, parsed.ty, newScale);
        };

        // 添加事件监听器
        const mouseEnterHandlers: Map<HTMLElement, (e: MouseEvent) => void> = new Map();
        const mouseLeaveHandlers: Map<HTMLElement, (e: MouseEvent) => void> = new Map();
        
        elements.forEach(el => {
          el.addEventListener('mousedown', handleMouseDown);
          el.style.userSelect = 'none';
          
          // 鼠标移动到元素上时显示 move 光标
          const enterHandler = (e: MouseEvent) => {
            (e.target as HTMLElement).style.cursor = 'move';
          };
          el.addEventListener('mouseenter', enterHandler);
          mouseEnterHandlers.set(el, enterHandler);
          
          // 鼠标离开元素时恢复默认光标
          const leaveHandler = (e: MouseEvent) => {
            if (!isDragging) {
              (e.target as HTMLElement).style.cursor = '';
            }
          };
          el.addEventListener('mouseleave', leaveHandler);
          mouseLeaveHandlers.set(el, leaveHandler);
          
          // 滚轮缩放只在图片元素上生效
          if (el.tagName === 'IMG') {
            el.addEventListener('wheel', handleWheel, { passive: false });
          }
        });

        // 全局鼠标移动和抬起事件，用于拖拽
        iframeDoc.addEventListener('mousemove', handleMouseMove);
        iframeDoc.addEventListener('mouseup', handleMouseUp);

        // 清理函数
        return () => {
          elements.forEach(el => {
            el.removeEventListener('mousedown', handleMouseDown);
            el.style.cursor = '';
            el.style.userSelect = '';
            
            // 移除鼠标进入和离开事件
            const enterHandler = mouseEnterHandlers.get(el);
            const leaveHandler = mouseLeaveHandlers.get(el);
            if (enterHandler) {
              el.removeEventListener('mouseenter', enterHandler);
            }
            if (leaveHandler) {
              el.removeEventListener('mouseleave', leaveHandler);
            }
            
            if (el.tagName === 'IMG') {
              el.removeEventListener('wheel', handleWheel);
            }
          });
          mouseEnterHandlers.clear();
          mouseLeaveHandlers.clear();
          iframeDoc.removeEventListener('mousemove', handleMouseMove);
          iframeDoc.removeEventListener('mouseup', handleMouseUp);
        };
      } catch (e) {
        console.warn('设置拖拽缩放失败:', e);
        return () => {};
      }
    };

    // 延迟设置，确保 iframe 已完全加载
    let cleanup: (() => void) | null = null;
    const timer = setTimeout(() => {
      cleanup = setupDragAndZoom();
    }, 100);

    return () => {
      clearTimeout(timer);
      if (cleanup) {
        cleanup();
      }
    };
  }, [selectedField, iframeSize]);

  // 预览 iframe 加载完成
  const handlePreviewIframeLoad = useCallback(() => {
    if (!previewIframeRef.current || !htmlContent) return;

    // TemplateGen 不需要应用 JSON 数据，只显示模板结构

    // 添加点击事件监听
    try {
      const iframeDoc = previewIframeRef.current.contentDocument || previewIframeRef.current.contentWindow?.document;
      if (iframeDoc) {
        const clickHandler = (event: MouseEvent) => {
          handleIframeElementClick(event);
        };
        // 移除旧的监听器（如果存在）
        iframeDoc.removeEventListener('click', clickHandler);
        // 添加新的监听器
        iframeDoc.addEventListener('click', clickHandler);
      }
    } catch (err) {
      console.warn('无法添加 iframe 点击事件:', err);
    }

    // 调整 iframe 尺寸（会在内部读取背景样式）
    adjustIframeSize();
    
    // 延迟读取背景样式，确保样式已完全应用
    setTimeout(() => {
      loadBackgroundStyleFromIframe();
    }, 200);
  }, [htmlContent, adjustIframeSize, handleIframeElementClick, loadBackgroundStyleFromIframe]);

  // 保存模板为 ZIP 文件
  const handleSaveTemplate = useCallback(async () => {
    if (!htmlContent || !previewIframeRef.current) {
      setError("没有可保存的模板内容");
      return;
    }

    try {
      setError("");
      setSuccess("正在保存模板...");

      const iframeDoc = previewIframeRef.current.contentDocument || previewIframeRef.current.contentWindow?.document;
      if (!iframeDoc) {
        setError("无法访问预览内容");
        return;
      }

      const zip = new JSZip();

      // 0. 先全量写入原始 ZIP 中的所有文件（保留未修改的资源）
      // 但需要先检测是否有新生成的背景，如果有，需要跳过旧背景文件
      let hasNewGeneratedBackground = false;
      let newBackgroundPath: string | null = null;
      
      // 提前检测是否有新生成的背景（在写入文件之前）
      const container = iframeDoc.querySelector('.container') as HTMLElement;
      if (container) {
        const computedStyle = iframeDoc.defaultView?.getComputedStyle(container);
        const bgImage = computedStyle?.backgroundImage || container.style.backgroundImage;
        if (bgImage && bgImage.includes('url(')) {
          const bgUrlMatch = bgImage.match(/url\(["']?(data:[^"')]+)["']?\)/);
          if (bgUrlMatch) {
            const dataUrl = bgUrlMatch[1];
            const originalPath = originalZipStructure?.imagePathMap.get(dataUrl);
            if (!originalPath) {
              // 这是新生成的背景
              hasNewGeneratedBackground = true;
              const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                const mime = match[1];
                const ext = mime.split('/')[1] || 'png';
                const bgExt = ext === 'jpeg' || ext === 'jpg' ? 'jpg' : 'png';
                newBackgroundPath = `image/bg.${bgExt}`;
              }
            }
          }
        }
      }
      
      // 额外检查 selectedBackground
      if (!hasNewGeneratedBackground && selectedBackground && selectedBackground.startsWith('data:')) {
        const originalPath = originalZipStructure?.imagePathMap.get(selectedBackground);
        if (!originalPath) {
          hasNewGeneratedBackground = true;
          const match = selectedBackground.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const mime = match[1];
            const ext = mime.split('/')[1] || 'png';
            const bgExt = ext === 'jpeg' || ext === 'jpg' ? 'jpg' : 'png';
            newBackgroundPath = `image/bg.${bgExt}`;
          }
        }
      }

      // 关键修复：只保存模板中实际使用的资源，而不是所有原始文件
      // 先收集所有在模板中使用的资源路径（从当前 HTML/CSS 中提取）
      const usedResourcePaths = new Set<string>();
      const usedDataUrls = new Set<string>(); // 记录所有使用的 dataURL（包括新生成的）
      
      // 1. 从当前 iframe 中的 HTML 提取所有使用的图片资源
      const currentImages = iframeDoc.querySelectorAll('img[src]');
      currentImages.forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (src.startsWith('data:')) {
          usedDataUrls.add(src);
          // 如果是 data URL，查找对应的原始路径
          const originalPath = originalZipStructure?.imagePathMap.get(src);
          if (originalPath) {
            usedResourcePaths.add(originalPath);
          }
        } else if (src && !src.startsWith('http')) {
          // 普通相对路径，尝试匹配原始文件
          const normalizedPath = src.replace(/^\.\//, '');
          if (originalZipStructure?.originalFiles.has(normalizedPath)) {
            usedResourcePaths.add(normalizedPath);
          }
        }
      });
      
      // 2. 从当前 CSS 中提取所有使用的资源（图片和字体）
      const currentStyleTags = iframeDoc.querySelectorAll('style');
      const allCssText = Array.from(currentStyleTags).map(s => s.textContent || '').join('\n') + (cssContent || '');
      
      // 提取 CSS 中的所有 data URL（图片和字体）
      const cssDataUrlRegex = /url\(["']?(data:[^"')]+)["']?\)/gi;
      let cssMatch;
      while ((cssMatch = cssDataUrlRegex.exec(allCssText)) !== null) {
        const dataUrl = cssMatch[1];
        usedDataUrls.add(dataUrl);
        // 检查是图片还是字体
        const isFont = dataUrl.includes('font') || dataUrl.includes('woff') || 
                      dataUrl.includes('otf') || dataUrl.includes('ttf') || dataUrl.includes('eot');
        
        if (isFont) {
          const originalPath = originalZipStructure?.fontPathMap.get(dataUrl);
          if (originalPath) {
            usedResourcePaths.add(originalPath);
          }
        } else {
          const originalPath = originalZipStructure?.imagePathMap.get(dataUrl);
          if (originalPath) {
            usedResourcePaths.add(originalPath);
          }
        }
      }
      
      // 3. 从内联样式中提取使用的资源（包括 background-image）
      const allElements = iframeDoc.querySelectorAll('*');
      allElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const inlineStyle = htmlEl.getAttribute('style') || '';
        if (inlineStyle) {
          // 提取内联样式中的 data URL
          const inlineDataUrlRegex = /url\(["']?(data:[^"')]+)["']?\)/gi;
          let inlineMatch;
          while ((inlineMatch = inlineDataUrlRegex.exec(inlineStyle)) !== null) {
            const dataUrl = inlineMatch[1];
            usedDataUrls.add(dataUrl);
            const isFont = dataUrl.includes('font') || dataUrl.includes('woff') || 
                          dataUrl.includes('otf') || dataUrl.includes('ttf') || dataUrl.includes('eot');
            
            if (isFont) {
              const originalPath = originalZipStructure?.fontPathMap.get(dataUrl);
              if (originalPath) {
                usedResourcePaths.add(originalPath);
              }
            } else {
              const originalPath = originalZipStructure?.imagePathMap.get(dataUrl);
              if (originalPath) {
                usedResourcePaths.add(originalPath);
              }
            }
          }
        }
      });
      
      // 4. 从背景样式中提取使用的资源（container 的背景和其他所有元素的背景）
      // 关键修复：检查所有元素的背景图，不仅仅是 container
      const allElementsWithBackground = iframeDoc.querySelectorAll('*');
      allElementsWithBackground.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const computedStyle = iframeDoc.defaultView?.getComputedStyle(htmlEl);
        // 优先使用 inline style，如果没有则使用 computed style
        const bgImage = htmlEl.style.backgroundImage || computedStyle?.backgroundImage || '';
        if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) {
          const bgUrlMatch = bgImage.match(/url\(["']?(data:[^"')]+)["']?\)/);
          if (bgUrlMatch) {
            const dataUrl = bgUrlMatch[1];
            usedDataUrls.add(dataUrl);
            const originalPath = originalZipStructure?.imagePathMap.get(dataUrl);
            if (originalPath) {
              usedResourcePaths.add(originalPath);
              console.log('[TemplateGen] ✅ 发现背景图片资源:', originalPath);
            } else {
              // 即使不在 imagePathMap 中，也要记录（可能是新生成的）
              console.log('[TemplateGen] ✅ 发现背景图片（新生成的）:', dataUrl.substring(0, 50) + '...');
            }
          }
          // 也检查普通 URL（非 data URL）
          const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
          if (urlMatch && !urlMatch[1].startsWith('data:') && !urlMatch[1].startsWith('http')) {
            const relativePath = urlMatch[1];
            const normalizedPath = relativePath.replace(/^\.\//, '');
            if (originalZipStructure?.originalFiles.has(normalizedPath)) {
              usedResourcePaths.add(normalizedPath);
              console.log('[TemplateGen] ✅ 发现背景图片资源（相对路径）:', normalizedPath);
            }
          }
        }
      });
      
      // 5. 确保新生成的背景也被标记为"使用"（即使不在 imagePathMap 中）
      if (hasNewGeneratedBackground && newBackgroundPath) {
        // 新生成的背景会被写入 imageDataMap，不需要从 originalFiles 中查找
        // 但我们需要确保它被包含在最终保存的文件中
        console.log('[TemplateGen] 检测到新生成的背景，将保存到:', newBackgroundPath);
      }
      
      console.log('[TemplateGen] 模板中使用的资源文件数量:', usedResourcePaths.size, Array.from(usedResourcePaths));
      console.log('[TemplateGen] 模板中使用的 dataURL 数量:', usedDataUrls.size);
      
      // 保存原始 ZIP 中实际使用的资源（不包括未使用的本地素材）
      if (originalZipStructure?.originalFiles) {
        for (const [path, fileBytes] of originalZipStructure.originalFiles.entries()) {
          // 跳过 HTML 和 CSS 文件，这些会在后面覆盖
          const lower = path.toLowerCase();
          if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.css')) {
            continue;
          }
          
          // 关键修复：只保存模板中实际使用的资源
          if (!usedResourcePaths.has(path)) {
            console.log('[TemplateGen] 跳过未使用的资源文件:', path);
            continue;
          }
          
          // 关键修复：如果有新生成的背景，跳过所有可能的旧背景文件
          // 用户保存模板时，旧背景文件应该被删除，因为新背景会覆盖它们
          if (hasNewGeneratedBackground && newBackgroundPath) {
            // 检查是否是背景文件（bg.jpg, bg.png 等，不区分大小写）
            const pathLower = path.toLowerCase();
            const fileName = pathLower.split('/').pop() || pathLower;
            
            // 精确匹配常见的背景文件名（在 image 目录下或根目录）
            const isBackgroundFile = 
              (fileName === 'bg.jpg' || fileName === 'bg.png' || fileName === 'bg.jpeg' || 
               fileName === 'background.jpg' || fileName === 'background.png' || 
               fileName === 'background.jpeg') &&
              (pathLower.includes('/image/') || pathLower.startsWith('image/') || 
               pathLower === fileName); // 也支持根目录下的背景文件
            
            if (isBackgroundFile) {
              console.log('[TemplateGen] 跳过旧背景文件（将被新背景替换）:', path, '→', newBackgroundPath);
              continue;
            }
          }
          
          // 额外检查：即使没有新生成的背景，如果当前背景是 dataURL（可能是之前生成的），
          // 也应该删除所有旧背景文件，因为用户已经决定使用当前背景
          // 但是，如果这个 dataURL 对应的是原始背景路径（在 imagePathMap 中），则不应该跳过
          if (!hasNewGeneratedBackground && selectedBackground && selectedBackground.startsWith('data:')) {
            // 检查这个 dataURL 是否对应原始背景路径
            const originalPathForDataUrl = originalZipStructure?.imagePathMap.get(selectedBackground);
            const pathLower = path.toLowerCase();
            const fileName = pathLower.split('/').pop() || pathLower;
            const isBackgroundFile = 
              (fileName === 'bg.jpg' || fileName === 'bg.png' || fileName === 'bg.jpeg' || 
               fileName === 'background.jpg' || fileName === 'background.png' || 
               fileName === 'background.jpeg') &&
              (pathLower.includes('/image/') || pathLower.startsWith('image/') || 
               pathLower === fileName);
            
            // 如果这个背景文件是 dataURL 对应的原始路径，则不应该跳过
            if (isBackgroundFile && originalPathForDataUrl && path === originalPathForDataUrl) {
              console.log('[TemplateGen] ✅ 保留原始背景文件（dataURL 对应原始路径）:', path);
              // 不跳过，继续保存
            } else if (isBackgroundFile) {
              console.log('[TemplateGen] 跳过旧背景文件（当前使用 dataURL 背景）:', path);
              continue;
            }
          }
          
          zip.file(path, fileBytes);
        }
      }

      // 1. 获取当前 iframe 中的 HTML（包含所有修改）
      // 获取 body 内容，但排除我们添加的高亮样式
      const body = iframeDoc.body;
      const bodyClone = body.cloneNode(true) as HTMLElement;
      // 移除高亮类
      bodyClone.querySelectorAll('.field-highlight').forEach(el => {
        el.classList.remove('field-highlight');
      });
      
      // 保存 .container 的背景样式（backgroundPosition, backgroundSize 等）
      const originalContainer = iframeDoc.querySelector('.container') as HTMLElement;
      const cloneContainer = bodyClone.querySelector('.container') as HTMLElement;
      if (originalContainer && cloneContainer) {
        // 获取原始容器的背景样式（优先使用 computed style，因为可能通过 CSS 设置）
        const computedStyle = iframeDoc.defaultView?.getComputedStyle(originalContainer);
        const bgImage = originalContainer.style.backgroundImage || computedStyle?.backgroundImage || '';
        const bgPosition = originalContainer.style.backgroundPosition || computedStyle?.backgroundPosition || '';
        const bgSize = originalContainer.style.backgroundSize || computedStyle?.backgroundSize || '';
        const bgRepeat = originalContainer.style.backgroundRepeat || computedStyle?.backgroundRepeat || '';
        
        // 构建背景样式字符串
        const bgStyles: string[] = [];
        if (bgImage && bgImage !== 'none') bgStyles.push(`background-image: ${bgImage}`);
        if (bgPosition && bgPosition !== '0% 0%') bgStyles.push(`background-position: ${bgPosition}`);
        if (bgSize && bgSize !== 'auto') bgStyles.push(`background-size: ${bgSize}`);
        if (bgRepeat && bgRepeat !== 'repeat') bgStyles.push(`background-repeat: ${bgRepeat}`);
        
        // 获取克隆容器的现有样式
        const currentStyle = cloneContainer.getAttribute('style') || '';
        const styleParts = currentStyle.split(';').filter(part => {
          const trimmed = part.trim();
          return trimmed && 
            !trimmed.startsWith('background-image') &&
            !trimmed.startsWith('background-position') &&
            !trimmed.startsWith('background-size') &&
            !trimmed.startsWith('background-repeat') &&
            !trimmed.startsWith('width') &&
            !trimmed.startsWith('height');
        });
        
        // 添加背景样式
        styleParts.push(...bgStyles);
        
        // 关键修复：确保容器尺寸与 iframeSize 一致（使用当前定义的尺寸）
        if (iframeSize) {
          styleParts.push(`width: ${iframeSize.width}px`);
          styleParts.push(`height: ${iframeSize.height}px`);
          console.log('[TemplateGen] ✅ 已保存容器尺寸:', { width: iframeSize.width, height: iframeSize.height });
        } else {
          // 如果没有 iframeSize，使用容器当前样式或计算值
          const width = originalContainer.style.width || computedStyle?.width || '';
          const height = originalContainer.style.height || computedStyle?.height || '';
          if (width) styleParts.push(`width: ${width}`);
          if (height) styleParts.push(`height: ${height}`);
        }
        
        // 设置新的样式
        const newStyle = styleParts.join('; ').trim();
        if (newStyle) {
          cloneContainer.setAttribute('style', newStyle);
          console.log('[TemplateGen] ✅ 已保存容器背景样式和尺寸:', { bgImage: bgImage.substring(0, 50), bgPosition, bgSize, width: iframeSize?.width, height: iframeSize?.height });
        }
      }
      
      // 保存所有图片元素的大小和位置（包括通过 JavaScript 直接设置的）
      // 关键修复：从原始 iframe 中获取实际的样式值，然后同步到克隆的元素
      // 专门处理所有 img 元素，确保每个图片的大小和位置都被保存
      const originalImages = iframeDoc.querySelectorAll('img');
      const imageStyleMap = new Map<HTMLElement, {
        transform?: string;
        width?: string;
        height?: string;
        position?: string;
        left?: string;
        top?: string;
        right?: string;
        bottom?: string;
      }>();
      
      originalImages.forEach((originalImg) => {
        const htmlImg = originalImg as HTMLElement;
        const styles: any = {};
        
        // 获取 transform（位置）
        const transform = htmlImg.style.transform || '';
        if (transform && transform !== 'none') {
          // 解析 transform，提取 translate，移除 scale
          const translateMatch = transform.match(/translate\(([^)]+)\)/);
          if (translateMatch) {
            styles.transform = `translate(${translateMatch[1]})`;
          }
        }
        
        // 获取 width 和 height（大小）
        const width = htmlImg.style.width || htmlImg.getAttribute('width') || '';
        const height = htmlImg.style.height || htmlImg.getAttribute('height') || '';
        if (width) styles.width = width;
        if (height) styles.height = height;
        
        // 获取 position 相关属性
        const position = htmlImg.style.position || '';
        if (position) styles.position = position;
        const left = htmlImg.style.left || '';
        if (left) styles.left = left;
        const top = htmlImg.style.top || '';
        if (top) styles.top = top;
        const right = htmlImg.style.right || '';
        if (right) styles.right = right;
        const bottom = htmlImg.style.bottom || '';
        if (bottom) styles.bottom = bottom;
        
        // 如果有任何样式，保存到 map
        if (Object.keys(styles).length > 0) {
          imageStyleMap.set(htmlImg, styles);
        }
      });
      
      // 将样式同步到克隆的元素
      // 通过 src 属性匹配（最可靠的方式）
      const cloneImages = bodyClone.querySelectorAll('img');
      cloneImages.forEach((cloneImg) => {
        const htmlCloneImg = cloneImg as HTMLElement;
        const src = htmlCloneImg.getAttribute('src') || '';
        
        // 通过 src 找到原始图片
        let originalImg: HTMLElement | null = null;
        originalImages.forEach((img) => {
          if ((img as HTMLImageElement).src === src || img.getAttribute('src') === src) {
            originalImg = img as HTMLElement;
          }
        });
        
        // 如果通过 src 找不到，尝试通过 data-field 匹配
        if (!originalImg) {
          const dataField = htmlCloneImg.getAttribute('data-field');
          if (dataField) {
            const found = iframeDoc.querySelector(`img[data-field="${dataField}"]`) as HTMLElement;
            if (found) originalImg = found;
          }
        }
        
        // 如果找到了原始图片且有保存的样式，应用样式
        if (originalImg && imageStyleMap.has(originalImg)) {
          const styles = imageStyleMap.get(originalImg)!;
          const currentStyle = htmlCloneImg.getAttribute('style') || '';
          
          // 构建新的样式字符串
          let newStyleParts: string[] = [];
          
          // 保留现有样式（除了我们要更新的）
          const styleParts = currentStyle.split(';').filter(part => {
            const trimmed = part.trim();
            return trimmed && 
              !trimmed.startsWith('transform') &&
              !trimmed.startsWith('width') &&
              !trimmed.startsWith('height') &&
              !trimmed.startsWith('position') &&
              !trimmed.startsWith('left') &&
              !trimmed.startsWith('top') &&
              !trimmed.startsWith('right') &&
              !trimmed.startsWith('bottom');
          });
          newStyleParts.push(...styleParts);
          
          // 添加保存的样式
          if (styles.transform) newStyleParts.push(`transform: ${styles.transform}`);
          if (styles.width) newStyleParts.push(`width: ${styles.width}`);
          if (styles.height) newStyleParts.push(`height: ${styles.height}`);
          if (styles.position) newStyleParts.push(`position: ${styles.position}`);
          if (styles.left) newStyleParts.push(`left: ${styles.left}`);
          if (styles.top) newStyleParts.push(`top: ${styles.top}`);
          if (styles.right) newStyleParts.push(`right: ${styles.right}`);
          if (styles.bottom) newStyleParts.push(`bottom: ${styles.bottom}`);
          
          // 设置新的样式
          const newStyle = newStyleParts.join('; ').trim();
          if (newStyle) {
            htmlCloneImg.setAttribute('style', newStyle);
          }
          
          // 如果原始图片有 width/height 属性（而不是样式），也设置属性
          if (originalImg.hasAttribute('width') && !styles.width) {
            htmlCloneImg.setAttribute('width', originalImg.getAttribute('width') || '');
          }
          if (originalImg.hasAttribute('height') && !styles.height) {
            htmlCloneImg.setAttribute('height', originalImg.getAttribute('height') || '');
          }
        }
      });
      
      // 关键修复：处理所有非 img 元素（包括文本元素）的样式
      // 提取字体大小、字体族、位置、transform 等所有样式
      const allOriginalElements = iframeDoc.body.querySelectorAll('*:not(img)');
      const elementStyleMap = new Map<HTMLElement, {
        transform?: string;
        fontSize?: string;
        fontFamily?: string;
        fontWeight?: string;
        fontStyle?: string;
        color?: string;
        position?: string;
        left?: string;
        top?: string;
        right?: string;
        bottom?: string;
        width?: string;
        height?: string;
        textAlign?: string;
        lineHeight?: string;
        letterSpacing?: string;
        [key: string]: string | undefined;
      }>();
      
      allOriginalElements.forEach((originalEl) => {
        const htmlEl = originalEl as HTMLElement;
        const computedStyle = iframeDoc.defaultView?.getComputedStyle(htmlEl);
        const styles: any = {};
        
        // 获取 transform（位置）
        const transform = htmlEl.style.transform || '';
        if (transform && transform !== 'none') {
          const translateMatch = transform.match(/translate\(([^)]+)\)/);
          if (translateMatch) {
            styles.transform = `translate(${translateMatch[1]})`;
          } else if (transform) {
            // 保留完整的 transform（可能包含 scale, rotate 等）
            styles.transform = transform;
          }
        }
        
        // 获取字体相关样式（优先使用 inline style，如果没有则使用 computed style）
        const fontSize = htmlEl.style.fontSize || computedStyle?.fontSize || '';
        if (fontSize && fontSize !== '16px') styles.fontSize = fontSize; // 16px 是默认值，可以跳过
        
        const fontFamily = htmlEl.style.fontFamily || computedStyle?.fontFamily || '';
        if (fontFamily) styles.fontFamily = fontFamily;
        
        const fontWeight = htmlEl.style.fontWeight || computedStyle?.fontWeight || '';
        if (fontWeight && fontWeight !== 'normal' && fontWeight !== '400') styles.fontWeight = fontWeight;
        
        const fontStyle = htmlEl.style.fontStyle || computedStyle?.fontStyle || '';
        if (fontStyle && fontStyle !== 'normal') styles.fontStyle = fontStyle;
        
        const color = htmlEl.style.color || computedStyle?.color || '';
        if (color && color !== 'rgb(0, 0, 0)' && color !== '#000000') styles.color = color;
        
        // 获取位置相关属性
        const position = htmlEl.style.position || computedStyle?.position || '';
        if (position && position !== 'static') styles.position = position;
        
        const left = htmlEl.style.left || computedStyle?.left || '';
        if (left && left !== 'auto') styles.left = left;
        
        const top = htmlEl.style.top || computedStyle?.top || '';
        if (top && top !== 'auto') styles.top = top;
        
        const right = htmlEl.style.right || computedStyle?.right || '';
        if (right && right !== 'auto') styles.right = right;
        
        const bottom = htmlEl.style.bottom || computedStyle?.bottom || '';
        if (bottom && bottom !== 'auto') styles.bottom = bottom;
        
        // 获取尺寸
        const width = htmlEl.style.width || '';
        if (width) styles.width = width;
        
        const height = htmlEl.style.height || '';
        if (height) styles.height = height;
        
        // 获取文本相关样式
        const textAlign = htmlEl.style.textAlign || computedStyle?.textAlign || '';
        if (textAlign && textAlign !== 'start') styles.textAlign = textAlign;
        
        const lineHeight = htmlEl.style.lineHeight || computedStyle?.lineHeight || '';
        if (lineHeight && lineHeight !== 'normal') styles.lineHeight = lineHeight;
        
        const letterSpacing = htmlEl.style.letterSpacing || computedStyle?.letterSpacing || '';
        if (letterSpacing && letterSpacing !== 'normal') styles.letterSpacing = letterSpacing;
        
        // 如果有任何样式，保存到 map
        if (Object.keys(styles).length > 0) {
          elementStyleMap.set(htmlEl, styles);
        }
      });
      
      // 同步所有元素的样式到克隆的元素
      const allCloneElements = bodyClone.querySelectorAll('*:not(img)');
      allCloneElements.forEach((cloneEl) => {
        const htmlCloneEl = cloneEl as HTMLElement;
        
        // 尝试通过 data-field 匹配
        let originalEl: HTMLElement | null = null;
        const dataField = htmlCloneEl.getAttribute('data-field');
        if (dataField) {
          const found = iframeDoc.querySelector(`[data-field="${dataField}"]`) as HTMLElement;
          if (found) originalEl = found;
        }
        
        // 如果通过 data-field 找不到，尝试通过标签名和内容匹配（用于文本元素）
        if (!originalEl) {
          const tagName = htmlCloneEl.tagName.toLowerCase();
          const textContent = htmlCloneEl.textContent?.trim() || '';
          if (textContent) {
            // 查找具有相同标签名和文本内容的元素
            const candidates = iframeDoc.querySelectorAll(tagName);
            for (const candidate of candidates) {
              if ((candidate as HTMLElement).textContent?.trim() === textContent) {
                originalEl = candidate as HTMLElement;
                break;
              }
            }
          }
        }
        
        // 如果找到了原始元素且有保存的样式，应用样式
        if (originalEl && elementStyleMap.has(originalEl)) {
          const styles = elementStyleMap.get(originalEl)!;
          const currentStyle = htmlCloneEl.getAttribute('style') || '';
          
          // 构建新的样式字符串
          let newStyleParts: string[] = [];
          
          // 保留现有样式（除了我们要更新的）
          const styleParts = currentStyle.split(';').filter(part => {
            const trimmed = part.trim();
            if (!trimmed) return false;
            // 排除所有我们要更新的样式属性
            const propName = trimmed.split(':')[0].trim().toLowerCase();
            return !['transform', 'font-size', 'font-family', 'font-weight', 'font-style', 'color',
                     'position', 'left', 'top', 'right', 'bottom', 'width', 'height',
                     'text-align', 'line-height', 'letter-spacing'].includes(propName);
          });
          newStyleParts.push(...styleParts);
          
          // 按顺序添加保存的样式
          if (styles.transform) newStyleParts.push(`transform: ${styles.transform}`);
          if (styles.position) newStyleParts.push(`position: ${styles.position}`);
          if (styles.left) newStyleParts.push(`left: ${styles.left}`);
          if (styles.top) newStyleParts.push(`top: ${styles.top}`);
          if (styles.right) newStyleParts.push(`right: ${styles.right}`);
          if (styles.bottom) newStyleParts.push(`bottom: ${styles.bottom}`);
          if (styles.width) newStyleParts.push(`width: ${styles.width}`);
          if (styles.height) newStyleParts.push(`height: ${styles.height}`);
          if (styles.fontSize) newStyleParts.push(`font-size: ${styles.fontSize}`);
          if (styles.fontFamily) newStyleParts.push(`font-family: ${styles.fontFamily}`);
          if (styles.fontWeight) newStyleParts.push(`font-weight: ${styles.fontWeight}`);
          if (styles.fontStyle) newStyleParts.push(`font-style: ${styles.fontStyle}`);
          if (styles.color) newStyleParts.push(`color: ${styles.color}`);
          if (styles.textAlign) newStyleParts.push(`text-align: ${styles.textAlign}`);
          if (styles.lineHeight) newStyleParts.push(`line-height: ${styles.lineHeight}`);
          if (styles.letterSpacing) newStyleParts.push(`letter-spacing: ${styles.letterSpacing}`);
          
          // 设置新的样式
          const newStyle = newStyleParts.join('; ').trim();
          if (newStyle) {
            htmlCloneEl.setAttribute('style', newStyle);
            console.log('[TemplateGen] ✅ 已保存元素样式:', { 
              tag: htmlCloneEl.tagName, 
              dataField,
              styles: Object.keys(styles).join(', ')
            });
          }
        }
      });
      
      const currentHtml = bodyClone.innerHTML;

      // 2. 提取 CSS（关键修复：优先使用原始 CSS 内容，而不是转换后的 base64 CSS）
      // 原始 CSS 中包含文件路径引用，不需要反向转换
      let extractedCss = "";
      
      // 优先使用原始 CSS 内容（如果存在）
      if (originalZipStructure?.originalCssContents && originalZipStructure.cssPaths.length > 0) {
        // 合并所有原始 CSS 文件内容
        for (const cssPath of originalZipStructure.cssPaths) {
          const originalCss = originalZipStructure.originalCssContents.get(cssPath);
          if (originalCss) {
            extractedCss += (extractedCss ? "\n\n" : "") + originalCss;
            console.log('[TemplateGen] 使用原始 CSS 内容:', cssPath, '长度:', originalCss.length);
          }
        }
      }
      
      // 如果原始 CSS 不存在，回退到从 iframe 提取（可能包含 base64）
      if (!extractedCss) {
        console.warn('[TemplateGen] ⚠️ 原始 CSS 内容不存在，回退到从 iframe 提取');
        extractedCss = cssContent || "";
      const styleTags = iframeDoc.querySelectorAll('style');
      styleTags.forEach((style) => {
        const cssText = style.textContent || style.innerHTML;
        // 排除字段高亮样式和系统添加的样式
        if (!cssText.includes('field-highlight') && 
            !cssText.includes('outline: 3px solid') &&
            !cssText.includes('box-shadow: 0 0 0 2px')) {
          extractedCss += "\n" + cssText;
        }
      });
      }

      // 3. 提取所有资源（图片、字体等）
      const resourceMap = new Map<string, { data: string; mime: string; ext: string }>();
      let resourceIndex = 0;
      
      // 提前定义 imageDataMap 和 fontDataMap，用于存储所有图片和字体数据
      const imageDataMap = new Map<string, { data: string; mime: string; ext: string }>();
      const fontDataMap = new Map<string, { data: string; mime: string; ext: string }>();

      // 提前确定 HTML 文件路径和目录结构（用于后续路径计算）
      const finalHtmlPath = originalZipStructure?.htmlPath || htmlFileName || 'index.html';
      const htmlDirForStructure = originalZipStructure?.htmlDir || 
        (finalHtmlPath.includes('/') ? finalHtmlPath.split('/').slice(0, -1).join('/') : '');

      // 提取图片资源
      const extractImageFromDataUrl = (dataUrl: string, defaultName: string): string | null => {
        if (!dataUrl.startsWith('data:')) return null;
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return null;
        const mime = match[1];
        const base64 = match[2];
        const ext = mime.split('/')[1] || 'png';
        const fileName = `${defaultName}_${resourceIndex++}.${ext}`;
        resourceMap.set(fileName, { data: base64, mime, ext });
        return fileName;
      };

      // 从所有 img 元素提取图片并记录替换映射（使用原始路径）
      const imageReplacements = new Map<string, string>();
      const images = iframeDoc.querySelectorAll('img');
      images.forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (src.startsWith('data:')) {
          // 查找原始路径
          const originalPath = originalZipStructure?.imagePathMap.get(src);
          if (originalPath) {
            imageReplacements.set(src, originalPath);
          } else {
            // 如果是新添加的图片（不在原始 ZIP 中），使用默认路径
          const fileName = extractImageFromDataUrl(src, `image`);
          if (fileName) {
              const defaultPath = htmlDirForStructure 
                ? `${htmlDirForStructure}/image/${fileName}`
                : `image/${fileName}`;
              imageReplacements.set(src, defaultPath);
        }
      }
        }
      });

      // 从 CSS 中提取图片 URL（data URL），字体文件会在后面单独处理
      // 这里先不替换，等收集完所有文件后再统一替换为原始路径
      
      // 从背景样式中提取图片（如果还没有处理）
      // 关键修复：处理图生图生成的新背景
      // 注意：container 已在前面定义（用于检测新背景），这里直接使用
      let backgroundDataUrl: string | null = null;
      let backgroundTargetPath: string | null = null; // 使用时间戳生成唯一文件名，避免缓存问题
      
      // 生成唯一背景文件名的辅助函数（使用时间戳）
      const generateUniqueBackgroundPath = (ext: string): string => {
        const timestamp = Date.now();
        const bgExt = ext === 'jpeg' || ext === 'jpg' ? 'jpg' : 'png';
        return `image/bg_${timestamp}.${bgExt}`;
      };
      
      // container 已在前面定义，直接使用
      if (container) {
        const computedStyle = iframeDoc.defaultView?.getComputedStyle(container);
        const bgImage = computedStyle?.backgroundImage || container.style.backgroundImage;
        if (bgImage && bgImage.includes('url(')) {
          const bgUrlMatch = bgImage.match(/url\(["']?(data:[^"')]+)["']?\)/);
          if (bgUrlMatch) {
            const dataUrl = bgUrlMatch[1];
            backgroundDataUrl = dataUrl;
            
            // 检查是否是原始 ZIP 中的背景（在 imagePathMap 中）
            const originalPath = originalZipStructure?.imagePathMap.get(dataUrl);
            if (originalPath) {
              // 是原始背景，使用原始路径
              imageReplacements.set(dataUrl, originalPath);
              console.log('[TemplateGen] 使用原始背景路径:', originalPath);
            } else {
              // 是新生成的背景（图生图），需要写入 zip
              // 关键修复：使用时间戳生成唯一文件名，避免浏览器缓存问题
              const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                const mime = match[1];
                const base64 = match[2];
                const ext = mime.split('/')[1] || 'png';
                
                // 使用时间戳生成唯一文件名
                backgroundTargetPath = generateUniqueBackgroundPath(ext);
                
                // 更新 imageReplacements 使用唯一文件名
                imageReplacements.set(dataUrl, backgroundTargetPath);
                
                // 将 base64 转换为二进制并准备写入 imageDataMap
                const bgExt = ext === 'jpeg' || ext === 'jpg' ? 'jpg' : 'png';
                if (!imageDataMap.has(backgroundTargetPath)) {
                  imageDataMap.set(backgroundTargetPath, { data: base64, mime, ext: bgExt });
                }
                
                console.log('[TemplateGen] 新生成的背景将保存到:', backgroundTargetPath);
              }
            }
          } else {
            // 检查是否是普通 URL（非 data URL）
            const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
            if (urlMatch && !urlMatch[1].startsWith('data:')) {
              // 普通 URL，不需要处理（可能是外部链接）
              console.log('[TemplateGen] 背景是普通 URL，跳过处理:', urlMatch[1].substring(0, 50));
            }
          }
        }
      }
      
      // 额外检查：如果 selectedBackground 是 dataURL 且不在 imagePathMap 中，也要处理
      if (selectedBackground && selectedBackground.startsWith('data:') && !backgroundDataUrl) {
        const originalPath = originalZipStructure?.imagePathMap.get(selectedBackground);
        if (!originalPath) {
          // 这是新生成的背景，需要写入 zip
          backgroundDataUrl = selectedBackground;
          const match = selectedBackground.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const mime = match[1];
            const base64 = match[2];
            const ext = mime.split('/')[1] || 'png';
            
            // 使用时间戳生成唯一文件名
            backgroundTargetPath = generateUniqueBackgroundPath(ext);
            
            imageReplacements.set(selectedBackground, backgroundTargetPath);
            const bgExt = ext === 'jpeg' || ext === 'jpg' ? 'jpg' : 'png';
            if (!imageDataMap.has(backgroundTargetPath)) {
              imageDataMap.set(backgroundTargetPath, { data: base64, mime, ext: bgExt });
              console.log('[TemplateGen] ✅ 新生成的背景（从 selectedBackground）已添加到 imageDataMap:', backgroundTargetPath, `(base64 长度: ${base64.length})`);
            } else {
              console.log('[TemplateGen] ⚠️ 背景文件（从 selectedBackground）已在 imageDataMap 中:', backgroundTargetPath);
            }
            
            console.log('[TemplateGen] 📦 新生成的背景（从 selectedBackground）将保存到 ZIP:', backgroundTargetPath);
          }
        }
      }

      // 4. 使用清理后的 currentHtml（修复：之前计算了但没用）
      let finalBodyHtml = currentHtml;
      
      // 5. 创建目录结构并添加文件（使用原始 ZIP 结构）
      // HTML 文件路径和目录结构已在前面定义，这里只需要确定 CSS 文件路径
      
      // 确定 CSS 文件路径（如果有多个，合并为一个，使用第一个文件名）
      const finalCssPath = originalZipStructure?.cssPaths?.[0] || 'style.css';
      
      // 替换所有图片的 data URL 为原始路径（相对于 HTML 文件）
      imageReplacements.forEach((originalPath, oldDataUrl) => {
        // 计算图片路径相对于 HTML 文件的路径
        const htmlDirForImages = htmlDirForStructure || '';
        const imageDir = originalPath.includes('/') 
          ? originalPath.split('/').slice(0, -1).join('/')
          : '';
        const imageFileName = originalPath.split('/').pop() || originalPath;
        
        let imageRelativePath = originalPath;
        if (htmlDirForImages && imageDir) {
          // 计算相对路径
          if (htmlDirForImages === imageDir) {
            // HTML 和图片在同一目录
            imageRelativePath = imageFileName;
          } else {
            // 需要计算相对路径（简化处理，使用原始路径）
            imageRelativePath = originalPath;
          }
        } else if (!htmlDirForImages && imageDir) {
          // HTML 在根目录，图片在子目录
          imageRelativePath = originalPath;
        } else if (htmlDirForImages && !imageDir) {
          // HTML 在子目录，图片在根目录
          const upLevels = htmlDirForImages.split('/').length;
          imageRelativePath = '../'.repeat(upLevels) + imageFileName;
        }
        
        // 转义特殊字符用于正则替换
        // 关键修复：对于超长的 dataURL，使用字符串替换而不是正则表达式
        try {
          if (oldDataUrl.length > 500) {
            // 对于超长的 dataURL，使用字符串替换（更安全）
            finalBodyHtml = finalBodyHtml.replace(new RegExp(oldDataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), imageRelativePath);
            // 如果上面的替换失败（可能因为转义问题），尝试直接字符串替换
            if (finalBodyHtml.includes(oldDataUrl)) {
              finalBodyHtml = finalBodyHtml.split(oldDataUrl).join(imageRelativePath);
            }
          } else {
            // 对于较短的 dataURL，可以使用正则表达式
            const escapedUrl = oldDataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            finalBodyHtml = finalBodyHtml.replace(new RegExp(escapedUrl, 'g'), imageRelativePath);
          }
        } catch (e) {
          console.warn('[TemplateGen] ⚠️ 替换 HTML 中的 dataURL 时出错:', e, 'dataURL 长度:', oldDataUrl.length);
          // 降级方案：使用简单的字符串替换
          finalBodyHtml = finalBodyHtml.split(oldDataUrl).join(imageRelativePath);
        }
        
        // 关键修复：如果是新生成的背景，同时替换内联样式中的背景（包括 .container 的 style 属性）
        if (backgroundTargetPath && originalPath === backgroundTargetPath && oldDataUrl === backgroundDataUrl) {
          // 替换内联样式中的背景 data URL（使用 url(...) 格式）
          // 注意：dataURL 可能很长，直接用于正则表达式可能导致问题，使用字符串替换更安全
          try {
            // 先尝试简单的字符串替换（更安全，不会因为特殊字符导致正则错误）
            const urlPattern = `url("${oldDataUrl}")`;
            const urlPattern2 = `url('${oldDataUrl}')`;
            const urlPattern3 = `url(${oldDataUrl})`;
            
            const beforeInlineReplace = finalBodyHtml;
            
            // 替换各种可能的 url() 格式
            finalBodyHtml = finalBodyHtml.replace(urlPattern, `url("${imageRelativePath}")`);
            finalBodyHtml = finalBodyHtml.replace(urlPattern2, `url("${imageRelativePath}")`);
            finalBodyHtml = finalBodyHtml.replace(urlPattern3, `url("${imageRelativePath}")`);
            
            if (beforeInlineReplace !== finalBodyHtml) {
              console.log('[TemplateGen] ✅ 已替换内联样式中的背景路径:', imageRelativePath);
            } else {
              // 如果字符串替换失败，尝试使用正则表达式（但只匹配 data: 开头部分，避免完整 dataURL）
              const dataUrlPrefix = oldDataUrl.substring(0, Math.min(100, oldDataUrl.length));
              const escapedPrefix = dataUrlPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const inlineBgRegex = new RegExp(`url\\(["']?${escapedPrefix}[^"')]*["']?\\)`, 'gi');
              finalBodyHtml = finalBodyHtml.replace(inlineBgRegex, `url("${imageRelativePath}")`);
              
              if (beforeInlineReplace !== finalBodyHtml) {
                console.log('[TemplateGen] ✅ 已替换内联样式中的背景路径（正则匹配）:', imageRelativePath);
              } else {
                console.warn('[TemplateGen] ⚠️ 警告：内联样式中的背景路径替换失败，dataURL 长度:', oldDataUrl.length);
              }
            }
          } catch (e) {
            console.warn('[TemplateGen] ⚠️ 替换内联样式背景路径时出错:', e);
            // 如果替换失败，至少确保 HTML 中的 dataURL 被替换
          }
        }
      });
      
      // 更新 CSS 中的图片路径为原始路径（相对于 CSS 文件）
      // 关键修复：如果使用了原始 CSS（文件路径引用），只需要替换新生成的背景，不需要处理所有 dataURL
      // 检查 extractedCss 是否包含 dataURL（如果包含，说明是从 iframe 提取的，需要转换）
      // 如果不包含 dataURL，说明是原始 CSS，只需要替换新生成的背景
      const hasDataUrls = /url\(["']?data:[^"')]+["']?\)/gi.test(extractedCss);
      
      if (!hasDataUrls) {
        // 原始 CSS 中没有 dataURL，说明都是文件路径引用
        // 只需要替换新生成的背景（如果有）
        console.log('[TemplateGen] ✅ 使用原始 CSS（文件路径引用），只需要替换新生成的背景');
        
        if (backgroundTargetPath && backgroundDataUrl) {
          // 查找原始 CSS 中可能存在的旧背景路径，替换为新生成的背景路径
          // 或者，如果原始 CSS 中没有背景路径，添加新生成的背景路径
          const cssDirForImages = finalCssPath.includes('/') 
            ? finalCssPath.split('/').slice(0, -1).join('/')
            : '';
          const imageDir = backgroundTargetPath.includes('/') 
            ? backgroundTargetPath.split('/').slice(0, -1).join('/')
            : '';
          const imageFileName = backgroundTargetPath.split('/').pop() || backgroundTargetPath;
          
          let bgRelativePath = backgroundTargetPath;
          if (cssDirForImages && imageDir) {
            if (cssDirForImages === imageDir) {
              bgRelativePath = imageFileName;
            }
          } else if (cssDirForImages && !imageDir) {
            const upLevels = cssDirForImages.split('/').length;
            bgRelativePath = '../'.repeat(upLevels) + imageFileName;
          }
          
          // 查找 .container 的背景路径，替换为新生成的背景
          // 同时更新背景的 position 和 size（如果容器有内联样式）
          const containerBgRegex = /(\.container[^}]*background[^:]*:\s*url\(["']?)([^"')]+)(["']?\))/i;
          const containerBgMatch = extractedCss.match(containerBgRegex);
          if (containerBgMatch) {
            extractedCss = extractedCss.replace(containerBgRegex, `$1${bgRelativePath}$3`);
            console.log('[TemplateGen] ✅ 已替换原始 CSS 中的背景路径为新生成的背景:', bgRelativePath);
            
            // 如果容器有内联样式中的 backgroundPosition 和 backgroundSize，也更新到 CSS
            if (container) {
              const bgPosition = container.style.backgroundPosition || '';
              const bgSize = container.style.backgroundSize || '';
              const bgRepeat = container.style.backgroundRepeat || '';
              
              // 查找 .container 规则块
              const containerRuleMatch = extractedCss.match(/\.container\s*\{[^}]*\}/i);
              if (containerRuleMatch) {
                let containerRule = containerRuleMatch[0];
                
                // 更新或添加 backgroundPosition
                if (bgPosition) {
                  if (/background-position\s*:/i.test(containerRule)) {
                    containerRule = containerRule.replace(/background-position\s*:[^;]+/i, `background-position: ${bgPosition}`);
                  } else {
                    containerRule = containerRule.replace(/\}/, `  background-position: ${bgPosition};\n}`);
                  }
                }
                
                // 更新或添加 backgroundSize
                if (bgSize) {
                  if (/background-size\s*:/i.test(containerRule)) {
                    containerRule = containerRule.replace(/background-size\s*:[^;]+/i, `background-size: ${bgSize}`);
                  } else {
                    containerRule = containerRule.replace(/\}/, `  background-size: ${bgSize};\n}`);
                  }
                }
                
                // 更新或添加 backgroundRepeat
                if (bgRepeat) {
                  if (/background-repeat\s*:/i.test(containerRule)) {
                    containerRule = containerRule.replace(/background-repeat\s*:[^;]+/i, `background-repeat: ${bgRepeat}`);
                  } else {
                    containerRule = containerRule.replace(/\}/, `  background-repeat: ${bgRepeat};\n}`);
                  }
                }
                
                // 替换整个 .container 规则
                extractedCss = extractedCss.replace(/\.container\s*\{[^}]*\}/i, containerRule);
                console.log('[TemplateGen] ✅ 已更新 CSS 中的背景样式:', { bgPosition, bgSize, bgRepeat });
              }
            }
          } else {
            // 如果原始 CSS 中没有 .container 背景，添加它（包括 position 和 size）
            const containerRuleRegex = /\.container\s*\{/i;
            if (containerRuleRegex.test(extractedCss)) {
              let bgStyles = `background-image: url("${bgRelativePath}");`;
              
              // 如果容器有内联样式，也添加到 CSS
              if (container) {
                const bgPosition = container.style.backgroundPosition || '';
                const bgSize = container.style.backgroundSize || '';
                const bgRepeat = container.style.backgroundRepeat || '';
                
                if (bgPosition) bgStyles += `\n  background-position: ${bgPosition};`;
                if (bgSize) bgStyles += `\n  background-size: ${bgSize};`;
                if (bgRepeat) bgStyles += `\n  background-repeat: ${bgRepeat};`;
              }
              
              extractedCss = extractedCss.replace(
                containerRuleRegex,
                `.container {\n  ${bgStyles}`
              );
              console.log('[TemplateGen] ✅ 已在原始 CSS 中添加新生成的背景路径和样式:', bgRelativePath);
            }
          }
        }
      } else {
        // CSS 中包含 dataURL，需要转换（从 iframe 提取的情况）
        console.log('[TemplateGen] ⚠️ CSS 中包含 dataURL，需要转换为文件路径');
        
        // 重新遍历 CSS 中的所有 dataUrl，更新为对应的原始路径
        const cssDataUrlRegex2 = /url\(["']?(data:[^"')]+)["']?\)/gi;
        let cssDataUrlMatch2;
        const cssDirForImages = finalCssPath.includes('/') 
          ? finalCssPath.split('/').slice(0, -1).join('/')
          : '';
        
        // 重置正则表达式（因为 exec 会修改 lastIndex）
        cssDataUrlRegex2.lastIndex = 0;
        while ((cssDataUrlMatch2 = cssDataUrlRegex2.exec(extractedCss)) !== null) {
        const fullMatch = cssDataUrlMatch2[0];
        const dataUrl = cssDataUrlMatch2[1];
        const isFont = dataUrl.includes('font') || dataUrl.includes('woff') || 
                      dataUrl.includes('otf') || dataUrl.includes('ttf') || dataUrl.includes('eot');
        
        if (isFont) {
          // 字体：查找对应的原始路径
          let originalPath = originalZipStructure?.fontPathMap.get(dataUrl);
          
          // 如果不在原始映射中，说明这是原始 CSS 中的 base64，需要提取并保存为文件
          if (!originalPath) {
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              const mime = match[1];
              const base64 = match[2];
              let ext = 'ttf';
              if (mime.includes('woff2')) ext = 'woff2';
              else if (mime.includes('woff')) ext = 'woff';
              else if (mime.includes('otf')) ext = 'otf';
              else if (mime.includes('eot')) ext = 'eot';
              
              // 生成唯一文件名（使用时间戳和随机数，避免冲突）
              const timestamp = Date.now();
              const random = Math.floor(Math.random() * 10000);
              const fileName = `fonts/css_font_${timestamp}_${random}.${ext}`;
              const targetPath = htmlDirForStructure 
                ? `${htmlDirForStructure}/${fileName}`
                : fileName;
              
              // 将字体数据保存到 fontDataMap（fontDataMap 已在前面定义）
              if (!fontDataMap.has(targetPath)) {
                fontDataMap.set(targetPath, { data: base64, mime, ext });
              }
              originalPath = targetPath;
              
              console.log('[TemplateGen] ✅ 发现 CSS 中的 base64 字体，已提取并保存为文件:', targetPath);
            } else {
              console.warn('[TemplateGen] ⚠️ 无法解析字体 dataURL，跳过:', dataUrl.substring(0, 50) + '...');
              continue;
            }
          }
          
          // 计算字体路径相对于 CSS 文件的路径
          const fontDir = originalPath.includes('/') 
            ? originalPath.split('/').slice(0, -1).join('/')
            : '';
          const fontFileName = originalPath.split('/').pop() || originalPath;
          
          let fontRelativePath = originalPath;
          if (cssDirForImages && fontDir) {
            if (cssDirForImages === fontDir) {
              fontRelativePath = fontFileName;
            }
          } else if (cssDirForImages && !fontDir) {
            const upLevels = cssDirForImages.split('/').length;
            fontRelativePath = '../'.repeat(upLevels) + fontFileName;
          }
          
          // 更新 CSS 中的字体路径
          const beforeReplace = extractedCss;
          
          try {
            // 先尝试简单的字符串替换（更安全）
            if (dataUrl.length > 500) {
              const urlPattern1 = `url("${dataUrl}")`;
              const urlPattern2 = `url('${dataUrl}')`;
              const urlPattern3 = `url(${dataUrl})`;
              
              extractedCss = extractedCss.replace(urlPattern1, `url("${fontRelativePath}")`);
              extractedCss = extractedCss.replace(urlPattern2, `url("${fontRelativePath}")`);
              extractedCss = extractedCss.replace(urlPattern3, `url("${fontRelativePath}")`);
            } else {
                const escapedUrl = dataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                extractedCss = extractedCss.replace(
                  new RegExp(escapedUrl, 'g'),
                fontRelativePath
              );
            }
            
            if (beforeReplace !== extractedCss) {
              console.log('[TemplateGen] ✅ 已替换 CSS 中的字体 dataURL，替换为:', fontRelativePath);
            }
          } catch (e) {
            console.warn('[TemplateGen] ⚠️ 替换 CSS 中的字体 dataURL 时出错:', e, 'dataURL 长度:', dataUrl.length);
            // 降级方案：使用字符串替换
            const urlPattern1 = `url("${dataUrl}")`;
            const urlPattern2 = `url('${dataUrl}')`;
            extractedCss = extractedCss.replace(urlPattern1, `url("${fontRelativePath}")`);
            extractedCss = extractedCss.replace(urlPattern2, `url("${fontRelativePath}")`);
          }
        } else if (!isFont) {
          // 图片：查找对应的原始路径
          let originalPath = originalZipStructure?.imagePathMap.get(dataUrl);
          
          // 如果不在原始映射中，检查是否是生成的背景
          if (!originalPath) {
            // 检查是否是背景图片（通过 imageReplacements）
            if (imageReplacements.has(dataUrl)) {
              originalPath = imageReplacements.get(dataUrl)!;
            } else {
              // 关键修复：如果 dataURL 不在任何映射中，说明这是原始 CSS 中的 base64
              // 我们需要提取这个 dataURL，保存为文件，然后替换为文件路径
              const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                const mime = match[1];
                const base64 = match[2];
                const ext = mime.split('/')[1] || 'png';
                const bgExt = ext === 'jpeg' || ext === 'jpg' ? 'jpg' : ext;
                
                // 生成唯一文件名（使用时间戳和随机数，避免冲突）
                const timestamp = Date.now();
                const random = Math.floor(Math.random() * 10000);
                const fileName = `image/css_bg_${timestamp}_${random}.${bgExt}`;
                const targetPath = htmlDirForStructure 
                  ? `${htmlDirForStructure}/${fileName}`
                  : fileName;
                
                // 保存到 imageDataMap
                if (!imageDataMap.has(targetPath)) {
                  imageDataMap.set(targetPath, { data: base64, mime, ext: bgExt });
                }
                
                // 添加到 imageReplacements，以便后续替换
                imageReplacements.set(dataUrl, targetPath);
                originalPath = targetPath;
                
                console.log('[TemplateGen] ✅ 发现 CSS 中的 base64 dataURL，已提取并保存为文件:', targetPath);
              } else {
                // 如果无法解析 dataURL，跳过
                console.warn('[TemplateGen] ⚠️ 无法解析 CSS 中的 dataURL，跳过:', dataUrl.substring(0, 50) + '...');
                continue;
              }
            }
          }
          
          // 计算图片路径相对于 CSS 文件的路径
          const imageDir = originalPath.includes('/') 
            ? originalPath.split('/').slice(0, -1).join('/')
            : '';
          const imageFileName = originalPath.split('/').pop() || originalPath;
          
          let imageRelativePath = originalPath;
          if (cssDirForImages && imageDir) {
            if (cssDirForImages === imageDir) {
              imageRelativePath = imageFileName;
            }
          } else if (cssDirForImages && !imageDir) {
            const upLevels = cssDirForImages.split('/').length;
            imageRelativePath = '../'.repeat(upLevels) + imageFileName;
          }
          
          // 更新 CSS 中的图片路径
          // 关键修复：对于超长的 dataURL，使用字符串替换而不是正则表达式
          const beforeReplace = extractedCss;
          
          try {
            // 先尝试简单的字符串替换（更安全，不会因为特殊字符导致正则错误）
            if (dataUrl.length > 500) {
              // 对于超长的 dataURL，使用字符串替换
              const urlPattern1 = `url("${dataUrl}")`;
              const urlPattern2 = `url('${dataUrl}')`;
              const urlPattern3 = `url(${dataUrl})`;
              
              extractedCss = extractedCss.replace(urlPattern1, `url("${imageRelativePath}")`);
              extractedCss = extractedCss.replace(urlPattern2, `url("${imageRelativePath}")`);
              extractedCss = extractedCss.replace(urlPattern3, `url("${imageRelativePath}")`);
            } else {
              // 对于较短的 dataURL，可以使用正则表达式
              const escapedUrl = dataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              extractedCss = extractedCss.replace(
                new RegExp(escapedUrl, 'g'),
                imageRelativePath
              );
            }
          } catch (e) {
            console.warn('[TemplateGen] ⚠️ 替换 CSS 中的 dataURL 时出错:', e, 'dataURL 长度:', dataUrl.length);
            // 如果替换失败，尝试使用字符串替换作为降级方案
            const urlPattern1 = `url("${dataUrl}")`;
            const urlPattern2 = `url('${dataUrl}')`;
            extractedCss = extractedCss.replace(urlPattern1, `url("${imageRelativePath}")`);
            extractedCss = extractedCss.replace(urlPattern2, `url("${imageRelativePath}")`);
          }
          
          // 调试日志：如果是背景文件，记录替换信息
          if (originalPath && (originalPath.includes('bg_') || originalPath.includes('bg.') || originalPath.includes('background.'))) {
            console.log('[TemplateGen] CSS 背景路径替换:', {
              dataUrl: dataUrl.substring(0, 50) + '...',
              originalPath,
              imageRelativePath,
              replaced: beforeReplace !== extractedCss
            });
          }
          
          // 关键修复：如果是新生成的背景，确保 CSS 中的路径与实际文件名一致
          if (backgroundTargetPath && originalPath === backgroundTargetPath) {
            console.log('[TemplateGen] ✅ 验证：CSS 中的背景路径已更新为:', imageRelativePath, '实际文件:', backgroundTargetPath);
      
            // 额外验证：确保替换确实发生了
            if (beforeReplace === extractedCss) {
              console.warn('[TemplateGen] ⚠️ 警告：CSS 背景路径替换可能失败，检查正则表达式');
            }
          }
          
          // 关键修复：如果 dataURL 匹配新生成的背景，但 originalPath 还没设置，也要处理
          if (backgroundDataUrl && dataUrl === backgroundDataUrl && backgroundTargetPath) {
            // 确保这个 dataURL 也被替换为正确的路径
            if (!originalPath || originalPath !== backgroundTargetPath) {
              // 重新计算相对路径
              const imageDir = backgroundTargetPath.includes('/') 
                ? backgroundTargetPath.split('/').slice(0, -1).join('/')
                : '';
              const imageFileName = backgroundTargetPath.split('/').pop() || backgroundTargetPath;
              
              let bgRelativePath = backgroundTargetPath;
              if (cssDirForImages && imageDir) {
                if (cssDirForImages === imageDir) {
                  bgRelativePath = imageFileName;
                }
              } else if (cssDirForImages && !imageDir) {
                const upLevels = cssDirForImages.split('/').length;
                bgRelativePath = '../'.repeat(upLevels) + imageFileName;
              }
              
              // 再次替换，确保新生成的背景路径被正确替换
              // 使用字符串替换而不是正则表达式（更安全）
              try {
                if (dataUrl.length > 500) {
                  const urlPattern1 = `url("${dataUrl}")`;
                  const urlPattern2 = `url('${dataUrl}')`;
                  const urlPattern3 = `url(${dataUrl})`;
                  extractedCss = extractedCss.replace(urlPattern1, `url("${bgRelativePath}")`);
                  extractedCss = extractedCss.replace(urlPattern2, `url("${bgRelativePath}")`);
                  extractedCss = extractedCss.replace(urlPattern3, `url("${bgRelativePath}")`);
                } else {
                  const escapedDataUrl = dataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  extractedCss = extractedCss.replace(
                    new RegExp(`url\\(["']?${escapedDataUrl}["']?\\)`, 'gi'),
                    `url("${bgRelativePath}")`
                  );
                }
                console.log('[TemplateGen] ✅ 强制替换 CSS 中新生成的背景路径:', bgRelativePath);
              } catch (e) {
                console.warn('[TemplateGen] ⚠️ 强制替换背景路径时出错:', e);
              }
            }
          }
        }
        }
      }
      
      // 计算 CSS 相对于 HTML 的路径
      let cssRelativePath = finalCssPath;
      if (htmlDirForStructure && !finalCssPath.startsWith('/')) {
        // 如果 HTML 在子目录中，CSS 路径需要相对于 HTML 目录
        if (finalCssPath.includes('/')) {
          // CSS 也在子目录中，需要计算相对路径
          const cssDirForPath = finalCssPath.split('/').slice(0, -1).join('/');
          if (cssDirForPath === htmlDirForStructure) {
            // 在同一目录，只需要文件名
            cssRelativePath = finalCssPath.split('/').pop() || finalCssPath;
          } else {
            // 在不同目录，使用相对路径
            cssRelativePath = finalCssPath;
          }
        } else {
          // CSS 在根目录，HTML 在子目录，需要 ../ 回到根目录
          cssRelativePath = '../' + finalCssPath;
        }
      }
      
      // 关键修复：最终清理 HTML - 确保 HTML 中没有任何 dataURL 残留（所有都应该被替换为文件路径）
      // 查找 HTML 中所有剩余的 dataURL（可能在属性、内联样式等地方）
      const htmlDataUrlRegex = /data:[^"'\s<>]+/gi;
      const htmlDataUrlMatches = finalBodyHtml.match(htmlDataUrlRegex);
      if (htmlDataUrlMatches && htmlDataUrlMatches.length > 0) {
        const uniqueDataUrls = new Set(htmlDataUrlMatches);
        console.warn('[TemplateGen] ⚠️ 警告：HTML 中仍有', uniqueDataUrls.size, '个 dataURL 未被替换为文件路径');
        
        uniqueDataUrls.forEach((dataUrl) => {
          // 检查这个 dataURL 是否在 imageReplacements 中
          if (imageReplacements.has(dataUrl)) {
            const targetPath = imageReplacements.get(dataUrl)!;
            // 计算相对路径
            const htmlDirForImages = htmlDirForStructure || '';
            const imageDir = targetPath.includes('/') 
              ? targetPath.split('/').slice(0, -1).join('/')
              : '';
            const imageFileName = targetPath.split('/').pop() || targetPath;
            
            let relativePath = targetPath;
            if (htmlDirForImages && imageDir) {
              if (htmlDirForImages === imageDir) {
                relativePath = imageFileName;
              }
            } else if (htmlDirForImages && !imageDir) {
              const upLevels = htmlDirForImages.split('/').length;
              relativePath = '../'.repeat(upLevels) + imageFileName;
            }
            
            // 替换这个 dataURL（使用字符串替换，更安全）
            try {
              finalBodyHtml = finalBodyHtml.split(dataUrl).join(relativePath);
              console.log('[TemplateGen] ✅ 已清理 HTML 中的 dataURL，替换为:', relativePath);
            } catch (e) {
              console.warn('[TemplateGen] ⚠️ 清理 HTML 中的 dataURL 时出错:', e);
            }
          } else {
            console.warn('[TemplateGen] ⚠️ 发现未映射的 dataURL，无法替换:', dataUrl.substring(0, 50) + '...');
          }
        });
      } else {
        console.log('[TemplateGen] ✅ 验证通过：最终 HTML 中没有任何 dataURL，所有路径都已替换为文件路径');
      }
      
      // 创建 HTML 文件
      const finalHtml = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${cssRelativePath}" />
  </head>
  <body>
    ${finalBodyHtml}
  </body>
</html>`;
      
      // 最终验证：确保 HTML 中没有任何 dataURL
      const finalHtmlDataUrlCheck = /data:[^"'\s<>]+/gi;
      const finalHtmlDataUrlMatches = finalHtml.match(finalHtmlDataUrlCheck);
      if (finalHtmlDataUrlMatches && finalHtmlDataUrlMatches.length > 0) {
        console.error('[TemplateGen] ❌ 严重错误：最终 HTML 中仍有', finalHtmlDataUrlMatches.length, '个 dataURL 未被替换！');
        console.error('[TemplateGen] ❌ 这些 dataURL 会被保存到 HTML 文件中，导致加载时显示旧资源！');
      }
      
      zip.file(finalHtmlPath, finalHtml);

      // CSS 文件（使用原始路径）
      let finalCss = extractedCss.trim();
      if (finalCss) {
        // 关键修复：最终清理 - 确保 CSS 中没有任何 dataURL 残留（所有都应该被替换为文件路径）
        // 查找所有剩余的 dataURL（可能因为各种原因没有被替换）
        const remainingDataUrlRegex = /url\(["']?(data:[^"')]+)["']?\)/gi;
        let remainingDataUrlMatch;
        const remainingDataUrls = new Set<string>();
        
        while ((remainingDataUrlMatch = remainingDataUrlRegex.exec(finalCss)) !== null) {
          const dataUrl = remainingDataUrlMatch[1];
          remainingDataUrls.add(dataUrl);
      }

        if (remainingDataUrls.size > 0) {
          console.warn('[TemplateGen] ⚠️ 警告：CSS 中仍有', remainingDataUrls.size, '个 dataURL 未被替换为文件路径');
          
          // 尝试替换所有剩余的 dataURL
          remainingDataUrls.forEach((dataUrl) => {
            // 检查这个 dataURL 是否在 imageReplacements 中
            if (imageReplacements.has(dataUrl)) {
              const targetPath = imageReplacements.get(dataUrl)!;
              // 计算相对路径
              const cssDirForImages = finalCssPath.includes('/') 
                ? finalCssPath.split('/').slice(0, -1).join('/')
                : '';
              const imageDir = targetPath.includes('/') 
                ? targetPath.split('/').slice(0, -1).join('/')
                : '';
              const imageFileName = targetPath.split('/').pop() || targetPath;
              
              let relativePath = targetPath;
              if (cssDirForImages && imageDir) {
                if (cssDirForImages === imageDir) {
                  relativePath = imageFileName;
                }
              } else if (cssDirForImages && !imageDir) {
                const upLevels = cssDirForImages.split('/').length;
                relativePath = '../'.repeat(upLevels) + imageFileName;
              }
              
              // 替换这个 dataURL
              try {
                if (dataUrl.length > 500) {
                  const urlPattern1 = `url("${dataUrl}")`;
                  const urlPattern2 = `url('${dataUrl}')`;
                  const urlPattern3 = `url(${dataUrl})`;
                  finalCss = finalCss.replace(urlPattern1, `url("${relativePath}")`);
                  finalCss = finalCss.replace(urlPattern2, `url("${relativePath}")`);
                  finalCss = finalCss.replace(urlPattern3, `url("${relativePath}")`);
                } else {
                  const escapedUrl = dataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  finalCss = finalCss.replace(
                    new RegExp(`url\\(["']?${escapedUrl}["']?\\)`, 'gi'),
                    `url("${relativePath}")`
                  );
              }
                console.log('[TemplateGen] ✅ 已清理 CSS 中的 dataURL，替换为:', relativePath);
            } catch (e) {
                console.warn('[TemplateGen] ⚠️ 清理 dataURL 时出错:', e);
              }
            } else {
              // 关键修复：如果 dataURL 不在 imageReplacements 中，说明这是原始 CSS 中的 base64
              // 我们需要提取这个 dataURL，保存为文件，然后替换为文件路径
              console.warn('[TemplateGen] ⚠️ 发现未映射的 dataURL，尝试提取并保存为文件:', dataUrl.substring(0, 50) + '...');
              
              const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                const mime = match[1];
                const base64 = match[2];
                const ext = mime.split('/')[1] || 'png';
                const bgExt = ext === 'jpeg' || ext === 'jpg' ? 'jpg' : ext;
                
                // 生成唯一文件名
                const timestamp = Date.now();
                const random = Math.floor(Math.random() * 10000);
                const fileName = `image/css_bg_${timestamp}_${random}.${bgExt}`;
                const targetPath = htmlDirForStructure 
                  ? `${htmlDirForStructure}/${fileName}`
                  : fileName;
                
                // 保存到 imageDataMap
                if (!imageDataMap.has(targetPath)) {
                  imageDataMap.set(targetPath, { data: base64, mime, ext: bgExt });
                }
                
                // 添加到 imageReplacements
                imageReplacements.set(dataUrl, targetPath);
                
                // 计算相对路径
                const cssDirForImages = finalCssPath.includes('/') 
                  ? finalCssPath.split('/').slice(0, -1).join('/')
                  : '';
                const imageDir = targetPath.includes('/') 
                  ? targetPath.split('/').slice(0, -1).join('/')
                  : '';
                const imageFileName = targetPath.split('/').pop() || targetPath;
                
                let relativePath = targetPath;
                if (cssDirForImages && imageDir) {
                  if (cssDirForImages === imageDir) {
                    relativePath = imageFileName;
                  }
                } else if (cssDirForImages && !imageDir) {
                  const upLevels = cssDirForImages.split('/').length;
                  relativePath = '../'.repeat(upLevels) + imageFileName;
                }
                
                // 替换这个 dataURL
                try {
                  if (dataUrl.length > 500) {
                    const urlPattern1 = `url("${dataUrl}")`;
                    const urlPattern2 = `url('${dataUrl}')`;
                    const urlPattern3 = `url(${dataUrl})`;
                    finalCss = finalCss.replace(urlPattern1, `url("${relativePath}")`);
                    finalCss = finalCss.replace(urlPattern2, `url("${relativePath}")`);
                    finalCss = finalCss.replace(urlPattern3, `url("${relativePath}")`);
                  } else {
                    const escapedUrl = dataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    finalCss = finalCss.replace(
                      new RegExp(`url\\(["']?${escapedUrl}["']?\\)`, 'gi'),
                      `url("${relativePath}")`
                    );
                  }
                  console.log('[TemplateGen] ✅ 已提取并替换 CSS 中的 base64 dataURL，保存为文件:', relativePath);
                } catch (e) {
                  console.warn('[TemplateGen] ⚠️ 替换提取的 dataURL 时出错:', e);
                }
              } else {
                console.warn('[TemplateGen] ⚠️ 无法解析 dataURL 格式，跳过:', dataUrl.substring(0, 50) + '...');
              }
            }
          });
        }
      
        // 最终验证：确保 CSS 中没有任何 dataURL（所有都应该被替换为文件路径）
        const finalDataUrlCheck = /url\(["']?(data:[^"')]+)["']?\)/gi;
        const finalDataUrlMatches = finalCss.match(finalDataUrlCheck);
        if (finalDataUrlMatches && finalDataUrlMatches.length > 0) {
          console.error('[TemplateGen] ❌ 严重错误：最终 CSS 中仍有', finalDataUrlMatches.length, '个 dataURL 未被替换！');
          console.error('[TemplateGen] ❌ 这些 dataURL 会被保存到 CSS 文件中，导致加载时显示旧背景！');
          finalDataUrlMatches.forEach((match, index) => {
            const dataUrlMatch = match.match(/data:[^"')]+/);
            if (dataUrlMatch) {
              console.error(`[TemplateGen] ❌ dataURL ${index + 1}:`, dataUrlMatch[0].substring(0, 100) + '...');
            }
          });
        } else {
          console.log('[TemplateGen] ✅ 验证通过：最终 CSS 中没有任何 dataURL，所有路径都已替换为文件路径');
        }
        
        // 调试日志：检查 CSS 中的背景路径
        const bgPathMatch = finalCss.match(/\.container[^}]*background[^:]*:\s*url\(["']?([^"')]+)["']?\)/i);
        if (bgPathMatch) {
          const bgPath = bgPathMatch[1];
          console.log('[TemplateGen] ✅ 保存的 CSS 中背景路径:', bgPath);
          
          // 验证：背景路径不应该是 dataURL
          if (bgPath.startsWith('data:')) {
            console.error('[TemplateGen] ❌ 错误：CSS 中的背景路径仍然是 dataURL！这会导致加载时显示旧背景！');
            console.error('[TemplateGen] ❌ 背景 dataURL 长度:', bgPath.length);
            console.error('[TemplateGen] ❌ 背景 dataURL 前100字符:', bgPath.substring(0, 100));
          } else {
            console.log('[TemplateGen] ✅ 背景路径是文件路径（不是 dataURL）:', bgPath);
          }
        } else {
          console.warn('[TemplateGen] ⚠️ 警告：未在 CSS 中找到 .container 的背景路径');
        }
        
        // 验证：如果生成了新背景，确保 CSS 中引用的路径与实际文件名一致
        if (backgroundTargetPath) {
          const bgFileName = backgroundTargetPath.split('/').pop() || backgroundTargetPath;
          const bgPathInCss = finalCss.match(new RegExp(`url\\(["']?[^"')]*${bgFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"')]*["']?\\)`, 'i'));
          
          if (bgPathInCss) {
            console.log('[TemplateGen] ✅ 验证通过：CSS 中包含新背景文件名:', bgFileName, '完整路径:', bgPathInCss[0]);
          } else {
            console.warn('[TemplateGen] ⚠️ 警告：CSS 中未找到新背景文件名:', bgFileName, '实际保存的文件:', backgroundTargetPath);
            
            // 如果 CSS 中确实没有新背景文件名，尝试最后一次强制替换
            if (backgroundDataUrl) {
              // 计算背景文件相对于 CSS 的路径
              const cssDirForImages = finalCssPath.includes('/') 
                ? finalCssPath.split('/').slice(0, -1).join('/')
                : '';
              const imageDir = backgroundTargetPath.includes('/') 
                ? backgroundTargetPath.split('/').slice(0, -1).join('/')
                : '';
              const imageFileName = backgroundTargetPath.split('/').pop() || backgroundTargetPath;
              
              let bgRelativePath = backgroundTargetPath;
              if (cssDirForImages && imageDir) {
                if (cssDirForImages === imageDir) {
                  bgRelativePath = imageFileName;
                }
              } else if (cssDirForImages && !imageDir) {
                const upLevels = cssDirForImages.split('/').length;
                bgRelativePath = '../'.repeat(upLevels) + imageFileName;
              }
              
              const finalCssBeforeForce = finalCss;
              
              // 关键修复：对于超长的 dataURL，使用字符串替换而不是正则表达式
              // 先尝试简单的字符串替换（更安全）
              try {
                const urlPattern1 = `url("${backgroundDataUrl}")`;
                const urlPattern2 = `url('${backgroundDataUrl}')`;
                const urlPattern3 = `url(${backgroundDataUrl})`;
                
                finalCss = finalCss.replace(urlPattern1, `url("${bgRelativePath}")`);
                finalCss = finalCss.replace(urlPattern2, `url("${bgRelativePath}")`);
                finalCss = finalCss.replace(urlPattern3, `url("${bgRelativePath}")`);
                
                // 如果字符串替换失败，尝试使用正则表达式（但只匹配前缀，避免超长正则）
                if (finalCssBeforeForce === finalCss && backgroundDataUrl.length > 100) {
                  // 只匹配 dataURL 的前缀部分（前 50 个字符），避免超长正则表达式
                  const dataUrlPrefix = backgroundDataUrl.substring(0, 50);
                  const escapedPrefix = dataUrlPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  finalCss = finalCss.replace(
                    new RegExp(`url\\(["']?${escapedPrefix}[^"')]*["']?\\)`, 'gi'),
                    `url("${bgRelativePath}")`
                  );
                } else if (finalCssBeforeForce === finalCss) {
                  // 如果 dataURL 不太长，可以尝试完整转义
                  const escapedDataUrl = backgroundDataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  finalCss = finalCss.replace(
                    new RegExp(`url\\(["']?${escapedDataUrl}["']?\\)`, 'gi'),
                    `url("${bgRelativePath}")`
                  );
        }
              } catch (e) {
                console.warn('[TemplateGen] ⚠️ 强制替换 CSS 背景路径时出错:', e);
                // 如果替换失败，至少记录警告
              }
              
              if (finalCssBeforeForce !== finalCss) {
                console.log('[TemplateGen] ✅ 强制替换成功：CSS 中的背景路径已更新为:', bgRelativePath);
              } else {
                console.warn('[TemplateGen] ⚠️ 强制替换失败，可能 CSS 中已经没有该 dataURL');
              }
            }
          }
        }
        
        zip.file(finalCssPath, finalCss);
      }

      // 资源文件（图片、字体等）
      // 使用原始路径映射将文件保存回原始位置
      // imageDataMap 和 fontDataMap 已在前面定义，这里只需要收集额外的字体数据
      
      // 收集所有图片和字体的 dataUrl 和二进制数据
          resourceMap.forEach((resource, fileName) => {
        // fileName 是临时生成的，我们需要找到对应的 dataUrl
        // 通过遍历 imageReplacements 和 CSS 中的 dataUrl 来匹配
      });
      
      // 从 HTML 中的图片提取 dataUrl 和原始路径
      images.forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (src.startsWith('data:')) {
          const originalPath = originalZipStructure?.imagePathMap.get(src);
          if (originalPath) {
            const match = src.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              const mime = match[1];
              const base64 = match[2];
              const ext = mime.split('/')[1] || 'png';
              imageDataMap.set(originalPath, { data: base64, mime, ext });
            }
          }
        }
      });
      
      // 从 CSS 中提取图片和字体的 dataUrl 和原始路径
      // 注意：cssDataUrlRegex 已在前面声明，这里直接使用正则表达式
      const cssDataUrlRegexForSave = /url\(["']?(data:[^"')]+)["']?\)/gi;
      let cssDataUrlMatch;
      let newResourceIndex = 0; // 用于新添加的资源
      while ((cssDataUrlMatch = cssDataUrlRegexForSave.exec(extractedCss)) !== null) {
        const dataUrl = cssDataUrlMatch[1];
        // 检查是图片还是字体
        const isFont = dataUrl.includes('font') || dataUrl.includes('woff') || 
                      dataUrl.includes('otf') || dataUrl.includes('ttf') || dataUrl.includes('eot');
        
        if (isFont) {
          const originalPath = originalZipStructure?.fontPathMap.get(dataUrl);
          const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const mime = match[1];
            const base64 = match[2];
          let ext = 'ttf';
          if (mime.includes('woff2')) ext = 'woff2';
          else if (mime.includes('woff')) ext = 'woff';
          else if (mime.includes('otf')) ext = 'otf';
          else if (mime.includes('eot')) ext = 'eot';
          
            if (originalPath) {
              // 使用原始路径
              fontDataMap.set(originalPath, { data: base64, mime, ext });
            } else {
              // 新添加的字体，使用默认路径
              const defaultPath = htmlDirForStructure 
                ? `${htmlDirForStructure}/fonts/font_${newResourceIndex++}.${ext}`
                : `fonts/font_${newResourceIndex++}.${ext}`;
              fontDataMap.set(defaultPath, { data: base64, mime, ext });
            }
          }
        } else {
          const originalPath = originalZipStructure?.imagePathMap.get(dataUrl);
          const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const mime = match[1];
            const base64 = match[2];
            const ext = mime.split('/')[1] || 'png';
            
            if (originalPath) {
              // 使用原始路径
              imageDataMap.set(originalPath, { data: base64, mime, ext });
            } else {
              // 新添加的图片，使用默认路径
              const defaultPath = htmlDirForStructure 
                ? `${htmlDirForStructure}/image/image_${newResourceIndex++}.${ext}`
                : `image/image_${newResourceIndex++}.${ext}`;
              imageDataMap.set(defaultPath, { data: base64, mime, ext });
            }
          }
        }
      }
      
      // 处理 HTML 中新添加的图片（不在原始 ZIP 中的）
      images.forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (src.startsWith('data:')) {
          const originalPath = originalZipStructure?.imagePathMap.get(src);
          if (!originalPath && !imageDataMap.has(src)) {
            // 新添加的图片，需要提取并保存
            const match = src.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              const mime = match[1];
              const base64 = match[2];
              const ext = mime.split('/')[1] || 'png';
              const defaultPath = htmlDirForStructure 
                ? `${htmlDirForStructure}/image/image_${newResourceIndex++}.${ext}`
                : `image/image_${newResourceIndex++}.${ext}`;
              imageDataMap.set(defaultPath, { data: base64, mime, ext });
              imageReplacements.set(src, defaultPath);
            }
          }
        }
      });
      
      // 保存图片文件到原始路径
      // 关键修复：确保生成的背景文件被写入 zip（覆盖原背景）
      // 写入所有图片文件到 ZIP
      console.log('[TemplateGen] 📦 开始写入图片文件到 ZIP，共', imageDataMap.size, '个文件');
      if (backgroundTargetPath) {
        console.log('[TemplateGen] 📦 预期背景文件路径:', backgroundTargetPath);
        console.log('[TemplateGen] 📦 imageDataMap 中是否包含背景文件:', imageDataMap.has(backgroundTargetPath));
      }
      
      imageDataMap.forEach((resource, originalPath) => {
            try {
              const binaryString = atob(resource.data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
          // 确保目录存在
          const pathParts = originalPath.split('/');
          if (pathParts.length > 1) {
            const dirPath = pathParts.slice(0, -1).join('/');
            const fileName = pathParts[pathParts.length - 1];
            const folder = zip.folder(dirPath);
            if (folder) {
              folder.file(fileName, bytes);
              // 如果是背景文件，记录详细日志
              if (originalPath.includes('bg_') || originalPath.startsWith('image/bg.')) {
                console.log('[TemplateGen] ✅ 已写入生成的背景文件到 zip:', originalPath, `(${bytes.length} bytes)`);
                if (backgroundTargetPath && originalPath === backgroundTargetPath) {
                  console.log('[TemplateGen] ✅ 验证：新背景文件已成功写入，文件名:', fileName);
                  console.log('[TemplateGen] ✅ 背景文件大小:', bytes.length, 'bytes');
                }
              }
            } else {
              console.warn('[TemplateGen] ⚠️ 无法创建目录:', dirPath);
            }
          } else {
            zip.file(originalPath, bytes);
            // 如果是背景文件，记录日志
            if (originalPath.includes('bg_') || originalPath.startsWith('image/bg.')) {
              console.log('[TemplateGen] ✅ 已写入生成的背景文件到 zip:', originalPath, `(${bytes.length} bytes)`);
              if (backgroundTargetPath && originalPath === backgroundTargetPath) {
                console.log('[TemplateGen] ✅ 验证：新背景文件已成功写入（无目录）:', originalPath);
              }
            }
          }
            } catch (e) {
          console.warn(`无法保存图片文件 ${originalPath}:`, e);
        }
      });
      
      // 保存字体文件到原始路径
      fontDataMap.forEach((resource, originalPath) => {
        try {
          const binaryString = atob(resource.data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
          // 确保目录存在
          const pathParts = originalPath.split('/');
          if (pathParts.length > 1) {
            const dirPath = pathParts.slice(0, -1).join('/');
            const fileName = pathParts[pathParts.length - 1];
            const folder = zip.folder(dirPath);
            if (folder) {
              folder.file(fileName, bytes);
            }
          } else {
            zip.file(originalPath, bytes);
          }
            } catch (e) {
          console.warn(`无法保存字体文件 ${originalPath}:`, e);
        }
      });
      
      // 字体文件已经在上面处理了，这里只需要更新 CSS 中的路径引用
      // 遍历 fontDataMap，更新 CSS 中的字体路径为原始路径（相对于 CSS 文件）
      fontDataMap.forEach((resource, originalPath) => {
        // 找到对应的 dataUrl（需要从 fontPathMap 反向查找）
        let dataUrl = '';
        originalZipStructure?.fontPathMap.forEach((path, url) => {
          if (path === originalPath) {
            dataUrl = url;
          }
        });
        
        if (dataUrl) {
          // 计算字体路径相对于 CSS 文件的路径
          const cssDirForFonts = finalCssPath.includes('/') 
            ? finalCssPath.split('/').slice(0, -1).join('/')
            : '';
          const fontDir = originalPath.includes('/') 
            ? originalPath.split('/').slice(0, -1).join('/')
            : '';
          const fontFileName = originalPath.split('/').pop() || originalPath;
          
          let fontRelativePath = originalPath;
          if (cssDirForFonts && fontDir) {
            // 计算相对路径
            if (cssDirForFonts === fontDir) {
              // CSS 和字体在同一目录
              fontRelativePath = fontFileName;
            } else {
              // 需要计算相对路径（简化处理，使用原始路径）
              fontRelativePath = originalPath;
            }
          } else if (!cssDirForFonts && fontDir) {
            // CSS 在根目录，字体在子目录
            fontRelativePath = originalPath;
          } else if (cssDirForFonts && !fontDir) {
            // CSS 在子目录，字体在根目录
            const upLevels = cssDirForFonts.split('/').length;
            fontRelativePath = '../'.repeat(upLevels) + fontFileName;
          }
          
          // 更新 CSS 中的字体路径
          const escapedUrl = dataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          extractedCss = extractedCss.replace(
            new RegExp(escapedUrl, 'g'),
            fontRelativePath
          );
        }
      });

      // 5. 最终验证：确保所有显示的元素都被保存
      console.log('[TemplateGen] 🔍 开始最终验证...');
      
      // 验证 1: 检查容器尺寸
      if (iframeSize) {
        const savedContainer = bodyClone.querySelector('.container') as HTMLElement;
        if (savedContainer) {
          const savedWidth = savedContainer.style.width || '';
          const savedHeight = savedContainer.style.height || '';
          const expectedWidth = `${iframeSize.width}px`;
          const expectedHeight = `${iframeSize.height}px`;
          
          if (savedWidth !== expectedWidth || savedHeight !== expectedHeight) {
            console.warn('[TemplateGen] ⚠️ 容器尺寸不匹配:', { savedWidth, savedHeight, expectedWidth, expectedHeight });
            // 强制设置正确的尺寸
            const currentStyle = savedContainer.getAttribute('style') || '';
            const styleParts = currentStyle.split(';').filter(part => {
              const trimmed = part.trim();
              return trimmed && !trimmed.startsWith('width') && !trimmed.startsWith('height');
            });
            styleParts.push(`width: ${expectedWidth}`, `height: ${expectedHeight}`);
            savedContainer.setAttribute('style', styleParts.join('; '));
            console.log('[TemplateGen] ✅ 已修复容器尺寸');
          } else {
            console.log('[TemplateGen] ✅ 容器尺寸验证通过');
          }
        }
      }
      
      // 验证 2: 检查所有图片是否都被保存
      const allImagesInIframe = iframeDoc.querySelectorAll('img');
      const allImagesInClone = bodyClone.querySelectorAll('img');
      console.log('[TemplateGen] 📊 图片统计:', { 
        iframe: allImagesInIframe.length, 
        clone: allImagesInClone.length,
        imageDataMap: imageDataMap.size 
      });
      
      // 验证 3: 检查所有文本元素是否都有样式
      const textElements = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'a'];
      let textElementCount = 0;
      let styledTextElementCount = 0;
      
      textElements.forEach(tagName => {
        const elements = iframeDoc.querySelectorAll(tagName);
        elements.forEach(el => {
          const htmlEl = el as HTMLElement;
          // 只统计有文本内容的元素
          if (htmlEl.textContent?.trim()) {
            textElementCount++;
            const cloneEl = bodyClone.querySelector(`${tagName}[data-field="${htmlEl.getAttribute('data-field')}"]`) || 
                          Array.from(bodyClone.querySelectorAll(tagName)).find(clone => 
                            clone.textContent?.trim() === htmlEl.textContent?.trim()
                          );
            if (cloneEl && (cloneEl as HTMLElement).getAttribute('style')) {
              styledTextElementCount++;
            }
          }
        });
      });
      
      console.log('[TemplateGen] 📊 文本元素统计:', { 
        total: textElementCount, 
        styled: styledTextElementCount 
      });
      
      // 验证 4: 检查背景图片是否被保存
      if (container) {
        const computedStyle = iframeDoc.defaultView?.getComputedStyle(container);
        const bgImage = container.style.backgroundImage || computedStyle?.backgroundImage || '';
        if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) {
          const bgUrlMatch = bgImage.match(/url\(["']?(data:[^"')]+)["']?\)/);
          if (bgUrlMatch) {
            const dataUrl = bgUrlMatch[1];
            const originalPath = originalZipStructure?.imagePathMap.get(dataUrl);
            const isInImageDataMap = originalPath ? imageDataMap.has(originalPath) : false;
            const isInReplacements = imageReplacements.has(dataUrl);
            
            if (!isInImageDataMap && !isInReplacements && !originalPath) {
              console.warn('[TemplateGen] ⚠️ 警告：背景图片可能未被保存:', dataUrl.substring(0, 50) + '...');
            } else {
              console.log('[TemplateGen] ✅ 背景图片验证通过');
            }
          }
        }
      }
      
      // 更新 finalBodyHtml（因为可能修改了容器尺寸）
      const updatedBodyHtml = bodyClone.innerHTML;
      const finalHtmlUpdated = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${cssRelativePath}" />
  </head>
  <body>
    ${updatedBodyHtml}
  </body>
</html>`;
      
      // 更新 ZIP 中的 HTML 文件
      zip.file(finalHtmlPath, finalHtmlUpdated);
      
      console.log('[TemplateGen] ✅ 最终验证完成');

      // 6. 生成 ZIP 文件并下载
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      a.download = `template_${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const totalResources = imageDataMap.size + fontDataMap.size;
      setSuccess(`模板已保存为 ZIP 文件！包含 ${totalResources} 个资源文件（${imageDataMap.size} 个图片，${fontDataMap.size} 个字体）`);
    } catch (err: any) {
      setError(err.message || "保存模板失败");
      console.error("保存模板错误:", err);
    }
  }, [htmlContent, cssContent, htmlFileName, selectedBackground, previewIframeRef, originalZipStructure]);

  return (
    <div className="template-gen-page">
      <div className="template-gen-header">
        <h1>Template Generator - 模板生成器</h1>
      </div>

      {error && (
        <div className="template-gen-error-message">
          {error}
        </div>
      )}

      {/* 成功信息已在控制面板中显示，不再需要顶部提示条 */}

      <div className="template-gen-content">
        {/* 左侧预览区域（画布） */}
        <div className="template-gen-preview">
          {htmlContent ? (
            <div className="template-gen-preview-iframe-wrapper">
              <iframe
                ref={previewIframeRef}
                className="template-gen-preview-iframe"
                srcDoc={buildSrcDoc(htmlContent, cssContent)}
                sandbox="allow-same-origin allow-scripts"
                style={{
                  width: iframeSize ? `${iframeSize.width}px` : 'auto',
                  height: iframeSize ? `${iframeSize.height}px` : 'auto',
                }}
                onLoad={handlePreviewIframeLoad}
                title="Template Preview"
              />
            </div>
          ) : (
            <div 
              className="template-gen-preview-placeholder"
              onClick={() => {
                templateInputRef.current?.click();
              }}
            >
              <p>请先上传模板文件</p>
              <p className="template-gen-preview-placeholder-hint">点击此区域选择文件</p>
            </div>
          )}
          
          {/* 文生图功能区域 */}
          {htmlContent && (
            <div className="image-gen-section">
              <div className="image-gen-controls">
                <label className="image-gen-checkbox-label">
                  <input
                    type="checkbox"
                    checked={showBackgroundOnly}
                    onChange={(e) => setShowBackgroundOnly(e.target.checked)}
                    className="image-gen-checkbox"
                  />
                  <span>仅看背景图</span>
                </label>
              </div>
              <div className="image-gen-input-wrapper">
                <label className="image-gen-label">现有背景图片修改提示词：</label>
                <div className="image-gen-input-row">
                <textarea
                  className="image-gen-textarea"
                  value={imageGenPrompt}
                  onChange={(e) => setImageGenPrompt(e.target.value)}
                  placeholder="输入提示词，用于生成/修改背景图..."
                  rows={3}
                  disabled={isGenerating}
                />
                  <button
                    className="image-gen-button"
                    onClick={handleImageGeneration}
                    disabled={isGenerating || !imageGenPrompt.trim()}
                    title={!imageGenPrompt.trim() ? '请输入提示词' : selectedBackground ? '基于当前显示的背景图生成新背景' : '纯文生图，创建新背景'}
                  >
                    {isGenerating ? '生成中...' : '生成新背景'}
                  </button>
                </div>
              </div>
              {generationError && (
                <div className="image-gen-error" style={{ color: 'red', marginTop: '8px', fontSize: '12px' }}>
                  {generationError}
                </div>
              )}
              
              {/* 图片选择区域：显示原始背景图和新生成的图片 */}
              {(originalBackgroundBeforeGen || backgrounds.length > 0) && (() => {
                // 确定模板背景：优先使用 originalBackgroundBeforeGen，否则使用 backgrounds 的第一个
                const templateBackground = originalBackgroundBeforeGen || (backgrounds.length > 0 ? backgrounds[0] : null);
                // 过滤掉模板背景，只显示生成的背景
                const generatedBackgrounds = originalBackgroundBeforeGen 
                  ? backgrounds.filter(bg => bg !== originalBackgroundBeforeGen)
                  : backgrounds.slice(1); // 如果没有 originalBackgroundBeforeGen，跳过第一个（它是模板背景）
                
                return (
                  <div className="image-selection-area" style={{ marginTop: '16px' }}>
                    <div className="image-selection-label" style={{ 
                      fontSize: '14px', 
                      fontWeight: 500, 
                      color: '#374151', 
                      marginBottom: '8px' 
                    }}>
                      选择背景图：
                    </div>
                    <div className="image-selection-grid" style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                      gap: '12px',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      padding: '8px',
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                    }}>
                      {/* 模板背景图 */}
                      {templateBackground && (
                        <div
                          className="image-selection-item"
                          onClick={() => {
                            setSelectedBackground(templateBackground);
                          }}
                style={{
                            position: 'relative',
                            cursor: 'pointer',
                            border: selectedBackground === templateBackground ? '2px solid #007bff' : '2px solid #e5e7eb',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            transition: 'all 0.2s',
                            aspectRatio: '1',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#007bff';
                            e.currentTarget.style.transform = 'scale(1.02)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = selectedBackground === templateBackground ? '#007bff' : '#e5e7eb';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          <img
                            src={templateBackground}
                            alt="模板"
                            style={{
                  width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                          <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
                            color: 'white',
                            fontSize: '11px',
                            padding: '4px 6px',
                            fontWeight: 500,
                          }}>
                            模板
                          </div>
                          {selectedBackground === templateBackground && (
                            <div style={{
                              position: 'absolute',
                              top: '4px',
                              right: '4px',
                              background: '#007bff',
                              color: 'white',
                              borderRadius: '50%',
                              width: '20px',
                              height: '20px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              fontWeight: 'bold',
                            }}>
                              ✓
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* 新生成的图片 */}
                      {generatedBackgrounds.map((bg, index) => (
                      <div
                        key={`generated-${index}`}
                        className="image-selection-item"
                        onClick={() => setSelectedBackground(bg)}
                        style={{
                          position: 'relative',
                          cursor: 'pointer',
                          border: selectedBackground === bg ? '2px solid #007bff' : '2px solid #e5e7eb',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          transition: 'all 0.2s',
                          aspectRatio: '1',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#007bff';
                          e.currentTarget.style.transform = 'scale(1.02)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = selectedBackground === bg ? '#007bff' : '#e5e7eb';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        <img
                          src={bg}
                          alt={`生成的背景 ${index + 1}`}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                        <div style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
                          color: 'white',
                          fontSize: '11px',
                          padding: '4px 6px',
                          fontWeight: 500,
                        }}>
                          生成 {index + 1}
                        </div>
                        {selectedBackground === bg && (
                          <div style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            background: '#007bff',
                            color: 'white',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}>
                            ✓
                          </div>
                        )}
                      </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* 中间控制面板（可替换字段） */}
        <div className="template-gen-controls">
          {/* 模板上传 */}
          <div className="template-gen-control-section">
            <h3>上传模板</h3>
            <label className="template-upload-label">
              <input
                ref={templateInputRef}
                type="file"
                accept=".zip,.html,.htm"
                onChange={handleTemplateUpload}
                className="template-gen-file-input"
              />
              <span className="template-gen-file-input-label">
                {htmlContent ? `已加载模板 (${htmlFileName})` : "选择 ZIP 或 HTML 文件"}
              </span>
            </label>
            {htmlContent && (
              <div className="template-gen-info">
                <p className="template-gen-info-text">
                  {htmlFileName && <span>模板文件: {htmlFileName}</span>}
                  {cssFileName && <span>CSS 文件: {cssFileName}</span>}
                  {templateFields.length > 0 && <span>可替换字段: {templateFields.length} 个</span>}
                </p>
                <p className="template-gen-reload-hint">
                  点击上方区域可重新加载新模板
                </p>
              </div>
            )}
          </div>

          {/* 模板尺寸（可折叠，包含模板尺寸、背景选择和缩放控制） */}
          <div className="template-gen-control-section template-size-collapsible">
            <div 
              className="template-size-collapsible-header"
              onClick={() => setIsTemplateSizeCollapsed(!isTemplateSizeCollapsed)}
            >
            <h3>模板尺寸</h3>
              <span className="collapse-icon">
                {isTemplateSizeCollapsed ? '▼' : '▲'}
              </span>
            </div>
            <div className={`template-size-collapsible-content ${isTemplateSizeCollapsed ? 'collapsed' : ''}`}>
              {/* 模板尺寸选择 */}
              <div className="template-size-inner-section">
            <div className="template-size-selector">
              <button
                className={`size-option-btn ${templateSize === '800x800' ? 'active' : ''}`}
                onClick={() => handleSizeChange('800x800')}
              >
                800×800
              </button>
              <button
                className={`size-option-btn ${templateSize === '750x1000' ? 'active' : ''}`}
                onClick={() => handleSizeChange('750x1000')}
              >
                750×1000
              </button>
              <button
                className={`size-option-btn ${templateSize === 'custom' ? 'active' : ''}`}
                onClick={() => handleSizeChange('custom')}
              >
                自定义
              </button>
            </div>
            {templateSize === 'custom' && (
              <div className="custom-size-input-wrapper">
                <input
                  type="text"
                  className="custom-size-input"
                  value={customSize}
                  onChange={(e) => handleCustomSizeChange(e.target.value)}
                  placeholder="例如: 800x800 或 800*800"
                />
              </div>
            )}
            {htmlContent && iframeSize && (
              <div className="current-template-size">
                <span>当前模板尺寸：{iframeSize.width}×{iframeSize.height}</span>
              </div>
            )}
          </div>

          {/* 背景选择 */}
              <div className="template-size-inner-section">
                <h4>背景选择</h4>
                {selectedBackground ? (
                  <div className="background-single-wrapper">
                  <div
                      className="background-item-large selected"
                    onClick={() => {
                      // 选中时应用当前调整
                        applyBackgroundAdjustment(selectedBackground, backgroundPosition, backgroundSize);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.add('drag-over');
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove('drag-over');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove('drag-over');
                      
                      // 获取拖拽的素材 URL
                      const assetUrl = e.dataTransfer.getData('text/plain') || 
                                      e.dataTransfer.getData('application/asset-url');
                      
                      if (assetUrl) {
                        // 设置为新背景
                        setSelectedBackground(assetUrl);
                        // 重置背景位置和缩放
                        setBackgroundPosition({ x: 0, y: 0 });
                        setBackgroundSize(100);
                        // 应用背景调整
                        applyBackgroundAdjustment(assetUrl, { x: 0, y: 0 }, 100);
                        setSuccess('已更新背景图片');
                        console.log('[TemplateGen] 通过拖拽设置新背景:', assetUrl);
                      }
                    }}
                  >
                    <div 
                      ref={backgroundThumbRef}
                      className="background-thumb-large"
                      onMouseEnter={(e) => {
                        // 鼠标进入时，阻止父元素的滚动
                          e.currentTarget.style.overflow = 'hidden';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.overflow = '';
                      }}
                      onMouseDown={(e) => {
                          if (e.button === 0) {
                          e.preventDefault();
                          e.stopPropagation();
                          const startX = e.clientX - backgroundPosition.x;
                          const startY = e.clientY - backgroundPosition.y;
                          
                          const handleMouseMove = (moveEvent: MouseEvent) => {
                            const newX = moveEvent.clientX - startX;
                            const newY = moveEvent.clientY - startY;
                            setBackgroundPosition({ x: newX, y: newY });
                            applyBackgroundAdjustment(selectedBackground, { x: newX, y: newY }, backgroundSize);
                          };
                          
                          const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                          };
                          
                          document.addEventListener('mousemove', handleMouseMove);
                          document.addEventListener('mouseup', handleMouseUp);
                        }
                      }}
                    >
                      <div className="background-thumb-wrapper">
                        <img
                            src={selectedBackground}
                            alt="当前背景"
                          className="background-thumb-image"
                          style={{
                            transform: `translate(${backgroundPosition.x}px, ${backgroundPosition.y}px) scale(${backgroundSize / 100})`,
                            transformOrigin: 'center center',
                          }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                          {overlaySize && (
                          <div 
                            className="background-crop-overlay"
                            style={{
                              width: `${overlaySize.width}px`,
                              height: `${overlaySize.height}px`,
                            }}
                          />
                        )}
                      </div>
                    </div>
                      <div className="background-controls" onClick={(e) => e.stopPropagation()}>
                        <div className="background-control-hint">
                          <p>💡 提示：拖拽图片移动，滚轮缩放</p>
                        </div>
                        <div className="background-control-row">
                          <label>缩放: {backgroundSize}%</label>
                          <input
                            type="range"
                            min="50"
                            max="200"
                            value={backgroundSize}
                            onChange={(e) => {
                              const newSize = parseInt(e.target.value);
                              setBackgroundSize(newSize);
                            applyBackgroundAdjustment(selectedBackground, backgroundPosition, newSize);
                            }}
                          />
                        </div>
                      </div>
                  </div>
                </div>
            ) : (
              <div 
                className="background-empty"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.add('drag-over');
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove('drag-over');
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove('drag-over');
                  
                  // 获取拖拽的素材 URL
                  const assetUrl = e.dataTransfer.getData('text/plain') || 
                                  e.dataTransfer.getData('application/asset-url');
                  
                  if (assetUrl) {
                    // 设置为新背景
                    setSelectedBackground(assetUrl);
                    // 重置背景位置和缩放
                    setBackgroundPosition({ x: 0, y: 0 });
                    setBackgroundSize(100);
                    // 应用背景调整
                    applyBackgroundAdjustment(assetUrl, { x: 0, y: 0 }, 100);
                    setSuccess('已设置背景图片');
                    console.log('[TemplateGen] 通过拖拽设置背景:', assetUrl);
                  }
                }}
              >
                <p>暂无背景</p>
                <p className="background-hint">可以从素材栏拖拽图片到背景区域</p>
              </div>
            )}
              </div>
            </div>
          </div>

          {/* 可替换字段列表 */}
          {templateFields.length > 0 && (
            <div className="template-gen-control-section">
              <h3>可替换字段 ({templateFields.length})</h3>
              <div className="template-gen-field-list-wrapper">
                {templateFields.map((f) => (
                  <div
                    key={f.name}
                    className={`template-gen-field-item ${selectedField === f.name ? 'selected' : ''}`}
                    onClick={() => handleFieldClick(f.name)}
                  >
                    {/* 第一行：中文名字 */}
                    <div className="template-gen-field-name">{f.label || f.name}</div>
                    
                    {/* 第二行：左右结构 - 左边字段名，右边值 */}
                    {selectedField === f.name ? (
                      <div className="template-gen-field-row">
                        {/* 左边：字段名（key） */}
                        <div className="template-gen-field-key">{f.name}</div>
                        {/* 右边：可编辑的值 */}
                        <div className="template-gen-field-value-wrapper">
                          {f.name.includes('_src') || f.name.includes('image') ? (
                            <>
                              <div 
                                className="image-drop-zone"
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.currentTarget.classList.add('drag-over');
                                }}
                                onDragLeave={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.currentTarget.classList.remove('drag-over');
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.currentTarget.classList.remove('drag-over');
                                  
                                  // 获取拖拽的素材 URL
                                  const assetUrl = e.dataTransfer.getData('text/plain') || 
                                                  e.dataTransfer.getData('application/asset-url');
                                  
                                  if (assetUrl) {
                                    // 直接更新字段值
                                    updateFieldValue(f.name, assetUrl);
                                    // 立即更新显示值，避免从 iframe 读取时图片还未加载完成
                                    setSelectedFieldValue(assetUrl);
                                    setSuccess(`已替换 ${f.label || f.name} 的素材`);
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {selectedFieldValue && selectedFieldValue.startsWith('data:image') ? (
                                <img 
                                  src={selectedFieldValue} 
                                  alt={f.name}
                                  className="template-gen-field-image-preview-small"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                                ) : selectedFieldValue ? (
                                  <div className="drop-zone-content">
                                    <div className="drop-zone-icon">📎</div>
                                    <div className="drop-zone-text">已设置图片，拖拽新素材替换</div>
                                  </div>
                                ) : (
                                  <div className="drop-zone-content">
                                    <div className="drop-zone-icon">📎</div>
                                    <div className="drop-zone-text">从右侧素材库拖拽素材到这里替换</div>
                                  </div>
                                )}
                              </div>
                              {selectedFieldValue && !selectedFieldValue.startsWith('data:image') && (
                                <input
                                  type="text"
                                  className="template-gen-field-value-input"
                                  value={selectedFieldValue}
                                  onChange={(e) => {
                                    const newValue = e.target.value;
                                    setSelectedFieldValue(newValue);
                                    updateFieldValue(f.name, newValue);
                                  }}
                                  placeholder="输入图片 URL"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ marginTop: '8px' }}
                                />
                              )}
                            </>
                          ) : (
                            <input
                              type="text"
                              className="template-gen-field-value-input"
                              value={selectedFieldValue}
                              onChange={(e) => {
                                const newValue = e.target.value;
                                setSelectedFieldValue(newValue);
                                updateFieldValue(f.name, newValue);
                              }}
                              placeholder="输入文本内容"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="template-gen-field-row">
                        <div className="template-gen-field-key">{f.name}</div>
                        <div className="template-gen-field-value-preview">
                          {f.name.includes('_src') || f.name.includes('image') ? (
                            (() => {
                              // 尝试从 iframe 中获取图片预览
                              if (previewIframeRef.current?.contentDocument) {
                                const doc = previewIframeRef.current.contentDocument;
                                const element = doc.querySelector(`[data-field="${f.name}"]`) as HTMLImageElement;
                                if (element && element.tagName === 'IMG' && element.src) {
                                  if (element.src.startsWith('data:image')) {
                                    return (
                                      <img 
                                        src={element.src} 
                                        alt={f.name}
                                        className="template-gen-field-image-preview-small"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                      />
                                    );
                                  } else {
                                    return <span className="template-gen-field-image-url">图片已加载</span>;
                                  }
                                }
                              }
                              return <span>点击查看/编辑</span>;
                            })()
                          ) : (
                            <span>点击查看/编辑</span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* 如果被选中，显示控制按钮 */}
                    {selectedField === f.name && (
                      <div className="template-gen-field-controls">
                        {/* 位置和大小控制按钮 */}
                        <div className="template-gen-image-control-buttons" onClick={(e) => e.stopPropagation()}>
                          {/* 方向键 - WASD 方式排列，靠左 */}
                          <div className="template-gen-dpad-container">
                            <button
                              className="template-gen-image-control-btn template-gen-dpad-btn template-gen-dpad-up"
                              title="向上 (W)"
                              {...createContinuousAction(() => adjustElementTransform(f.name, 'up'), `${f.name}_up`)}
                            >
                              ↑
                            </button>
                            <div className="template-gen-dpad-middle">
                              <button
                                className="template-gen-image-control-btn template-gen-dpad-btn template-gen-dpad-left"
                                title="向左 (A)"
                                {...createContinuousAction(() => adjustElementTransform(f.name, 'left'), `${f.name}_left`)}
                              >
                                ←
                              </button>
                              <button
                                className="template-gen-image-control-btn template-gen-dpad-btn template-gen-dpad-down"
                                title="向下 (S)"
                                {...createContinuousAction(() => adjustElementTransform(f.name, 'down'), `${f.name}_down`)}
                              >
                                ↓
                              </button>
                              <button
                                className="template-gen-image-control-btn template-gen-dpad-btn template-gen-dpad-right"
                                title="向右 (D)"
                                {...createContinuousAction(() => adjustElementTransform(f.name, 'right'), `${f.name}_right`)}
                              >
                                →
                              </button>
                            </div>
                          </div>
                          {/* 缩放按钮 - 靠右，上面+，下面- */}
                          <div className="template-gen-zoom-container">
                            <button
                              className="template-gen-image-control-btn template-gen-zoom-btn template-gen-zoom-in"
                              title="放大"
                              {...createContinuousAction(() => adjustElementTransform(f.name, 'zoomIn'), `${f.name}_zoomIn`)}
                            >
                              +
                            </button>
                            <button
                              className="template-gen-image-control-btn template-gen-zoom-btn template-gen-zoom-out"
                              title="缩小"
                              {...createContinuousAction(() => adjustElementTransform(f.name, 'zoomOut'), `${f.name}_zoomOut`)}
                            >
                              −
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 保存模板 */}
          {htmlContent && (
            <div className="template-gen-control-section">
              <h3>保存</h3>
              <button
                className="template-gen-btn-primary"
                onClick={handleSaveTemplate}
                style={{ width: '100%', marginBottom: '10px' }}
              >
                💾 保存为 ZIP 文件
              </button>
              <p className="template-gen-info-text">
                将当前模板保存为 ZIP 文件，包含 HTML、CSS、图片和字体等所有资源
              </p>
            </div>
          )}
        </div>

        {/* 右侧素材面板 */}
        <div className="template-gen-asset-sidebar-wrapper">
          <ResizableSidebar
            width={assetSidebarCollapsed ? 0 : assetSidebarWidth}
            onWidthChange={setAssetSidebarWidth}
            collapsed={assetSidebarCollapsed}
            onToggleCollapse={() => setAssetSidebarCollapsed(!assetSidebarCollapsed)}
          >
            <div className="template-gen-asset-sidebar">
              <AssetSidebar
                jsonData={[]}
                currentIndex={0}
                extraAssets={[...templateAssets, ...linkedAssets, ...localAssets]}
                sidebarWidth={assetSidebarWidth}
                onAssetClick={(assetUrl, fieldName) => {
                  if (templateFields.some(f => f.name === fieldName)) {
                    handleFieldClick(fieldName);
                    updateFieldValue(fieldName, assetUrl);
                  }
                }}
              />
            </div>
          </ResizableSidebar>
        </div>
      </div>
    </div>
  );
};



