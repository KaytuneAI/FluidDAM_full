import React, { useState, useRef, useEffect, useCallback } from "react";
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
import { BannerData } from "../../types";
import "./TemplateGenPage.css";

export const TemplateGenPage: React.FC = () => {
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [cssContent, setCssContent] = useState<string>("");
  const [htmlFileName, setHtmlFileName] = useState<string>("");
  const [cssFileName, setCssFileName] = useState<string>("");
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
  
  // 处理尺寸选择
  const handleSizeChange = useCallback((size: '800x800' | '750x1000' | 'custom') => {
    setTemplateSize(size);
    if (size === '800x800') {
      setIframeSize({ width: 800, height: 800 });
    } else if (size === '750x1000') {
      setIframeSize({ width: 750, height: 1000 });
    }
    // custom 时保持当前 customSize，等待用户输入
  }, []);
  
  // 处理自定义尺寸输入
  const handleCustomSizeChange = useCallback((value: string) => {
    setCustomSize(value);
    // 解析 "数字*数字" 或 "数字x数字" 格式
    const match = value.match(/^(\d+)[*x](\d+)$/i);
    if (match) {
      const width = parseInt(match[1], 10);
      const height = parseInt(match[2], 10);
      if (width > 0 && height > 0) {
        setIframeSize({ width, height });
      }
    }
  }, []);

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
  
  // JSON 数据相关状态（TemplateGen 主要用于编辑模板，数据功能简化）
  const [jsonData, setJsonData] = useState<BannerData[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  
  // 来自 Link 的素材
  const [linkedAssets, setLinkedAssets] = useState<TempAsset[]>([]);
  
  // 素材面板宽度和收起状态
  const [assetSidebarWidth, setAssetSidebarWidth] = useState(280);
  const [assetSidebarCollapsed, setAssetSidebarCollapsed] = useState(false);
  
  // 编辑模式：是否处于模板编辑状态
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

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

  // 调整 iframe 尺寸以匹配内容
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
          // 获取内容的实际尺寸
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

          // 设置 iframe 尺寸
          if (width > 0 && height > 0) {
            setIframeSize({ width, height });
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
  }, []);

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

  // 当模板尺寸变化时，自动调整背景图片以填满新尺寸
  useEffect(() => {
    if (!iframeSize || !previewIframeRef.current) return;

    const adjustBackground = () => {
      try {
        const iframeDoc = previewIframeRef.current?.contentDocument || previewIframeRef.current?.contentWindow?.document;
        if (!iframeDoc) return;

        const container = iframeDoc.querySelector('.container') as HTMLElement;
        if (container) {
          // 设置背景图片填满容器（cover 模式）
          container.style.backgroundSize = 'cover';
          container.style.backgroundPosition = 'center center';
          container.style.backgroundRepeat = 'no-repeat';
          // 确保容器尺寸匹配新的 iframe 尺寸
          container.style.width = `${iframeSize.width}px`;
          container.style.height = `${iframeSize.height}px`;
        }
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
        // TemplateGen 不需要 JSON 数据，只关注模板结构
        // iframeSize will be adjusted automatically after iframe loads via adjustIframeSize
        setSuccess(`模板加载成功！包含 ${result.fields.length} 个可替换字段`);
        
        // 提取背景图片
        const bgImages = extractBackgroundImages(result.html, result.css);
        setBackgrounds(bgImages);
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
            
            // 提取背景图片
            const bgImages = extractBackgroundImages(result.html, result.css || "");
            setBackgrounds(bgImages);
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

    // 向上查找具有 data-field 属性的元素
    let element: HTMLElement | null = target;
    let fieldName: string | null = null;
    
    // 最多向上查找5层
    for (let i = 0; i < 5 && element; i++) {
      fieldName = element.getAttribute('data-field');
      if (fieldName) {
        break;
      }
      element = element.parentElement;
    }

    // 如果找到了 data-field，选中对应的字段
    if (fieldName) {
      e.stopPropagation(); // 阻止事件冒泡，避免触发其他点击事件
      
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

    // 调整 iframe 尺寸
    adjustIframeSize();
  }, [htmlContent, adjustIframeSize, handleIframeElementClick]);

  return (
    <div className="template-gen-page">
      <div className="template-gen-header">
        <h1>Template Generator - 模板生成器</h1>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* 成功信息已在控制面板中显示，不再需要顶部提示条 */}

      <div className="template-gen-content">
        {/* 左侧预览区域（画布） */}
        <div className="template-gen-preview">
          {htmlContent ? (
            <div className="preview-iframe-wrapper">
              <iframe
                ref={previewIframeRef}
                className="preview-iframe"
                srcDoc={buildSrcDoc(htmlContent, cssContent)}
                sandbox="allow-same-origin allow-scripts"
                style={{
                  width: iframeSize?.width || 800,
                  height: iframeSize?.height || 800,
                }}
                onLoad={handlePreviewIframeLoad}
                title="Template Preview"
              />
              {iframeSize && (
                <div 
                  className="preview-template-border"
                  style={{
                    width: `${iframeSize.width}px`,
                    height: `${iframeSize.height}px`,
                  }}
                />
              )}
            </div>
          ) : (
            <div className="preview-placeholder">
              <p>请先上传模板文件</p>
            </div>
          )}
        </div>

        {/* 中间控制面板（可替换字段） */}
        <div className="template-gen-controls">
          {/* 模板上传 */}
          <div className="control-section">
            <h3>上传模板</h3>
            <label className="template-upload-label">
              <input
                ref={templateInputRef}
                type="file"
                accept=".zip,.html,.htm"
                onChange={handleTemplateUpload}
                className="file-input"
              />
              <span className="file-input-label">
                {htmlContent ? `已加载模板 (${htmlFileName})` : "选择 ZIP 或 HTML 文件"}
              </span>
            </label>
            {htmlContent && (
              <div className="template-info">
                <p className="template-info-text">
                  {htmlFileName && <span>模板文件: {htmlFileName}</span>}
                  {cssFileName && <span>CSS 文件: {cssFileName}</span>}
                  {templateFields.length > 0 && <span>可替换字段: {templateFields.length} 个</span>}
                </p>
              </div>
            )}
          </div>

          {/* 模板尺寸 */}
          <div className="control-section">
            <h3>模板尺寸</h3>
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
          <div className="control-section">
            <h3>背景选择</h3>
            {backgrounds.length > 0 ? (
              backgrounds.map((bgUrl, index) => (
                  <div key={index} className="background-single-wrapper">
                  <div
                    className={`background-item-large ${selectedBackground === bgUrl ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedBackground(bgUrl);
                      // 选中时应用当前调整
                      applyBackgroundAdjustment(bgUrl, backgroundPosition, backgroundSize);
                    }}
                  >
                    <div 
                      ref={backgroundThumbRef}
                      className="background-thumb-large"
                      onMouseEnter={(e) => {
                        // 鼠标进入时，阻止父元素的滚动
                        if (selectedBackground === bgUrl) {
                          e.currentTarget.style.overflow = 'hidden';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.overflow = '';
                      }}
                      onMouseDown={(e) => {
                        if (selectedBackground === bgUrl && e.button === 0) {
                          e.preventDefault();
                          e.stopPropagation();
                          const startX = e.clientX - backgroundPosition.x;
                          const startY = e.clientY - backgroundPosition.y;
                          
                          const handleMouseMove = (moveEvent: MouseEvent) => {
                            const newX = moveEvent.clientX - startX;
                            const newY = moveEvent.clientY - startY;
                            setBackgroundPosition({ x: newX, y: newY });
                            applyBackgroundAdjustment(bgUrl, { x: newX, y: newY }, backgroundSize);
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
                          src={bgUrl}
                          alt={`背景 ${index + 1}`}
                          className="background-thumb-image"
                          style={{
                            transform: `translate(${backgroundPosition.x}px, ${backgroundPosition.y}px) scale(${backgroundSize / 100})`,
                            transformOrigin: 'center center',
                          }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        {selectedBackground === bgUrl && overlaySize && (
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
                    {selectedBackground === bgUrl && (
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
                              applyBackgroundAdjustment(bgUrl, backgroundPosition, newSize);
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="background-empty">
                <p>暂无背景</p>
                <p className="background-hint">可以从素材栏拖拽图片到背景区域</p>
              </div>
            )}
          </div>

          {/* 可替换字段列表 */}
          {templateFields.length > 0 && (
            <div className="control-section">
              <h3>可替换字段 ({templateFields.length})</h3>
              <div className="field-list-wrapper">
                {templateFields.map((f) => (
                  <div
                    key={f.name}
                    className={`field-item ${selectedField === f.name ? 'selected' : ''}`}
                    onClick={() => handleFieldClick(f.name)}
                  >
                    {/* 第一行：中文名字 */}
                    <div className="field-name">{f.label || f.name}</div>
                    
                    {/* 第二行：左右结构 - 左边字段名，右边值 */}
                    {selectedField === f.name ? (
                      <div className="field-row">
                        {/* 左边：字段名（key） */}
                        <div className="field-key">{f.name}</div>
                        {/* 右边：可编辑的值 */}
                        <div className="field-value-wrapper">
                          {f.name.includes('_src') || f.name.includes('image') ? (
                            <div className="field-image-input-wrapper">
                              {selectedFieldValue.startsWith('data:image') ? (
                                <img 
                                  src={selectedFieldValue} 
                                  alt={f.name}
                                  className="field-image-preview-small"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <input
                                  type="text"
                                  className="field-value-input"
                                  value={selectedFieldValue}
                                  onChange={(e) => {
                                    const newValue = e.target.value;
                                    setSelectedFieldValue(newValue);
                                    updateFieldValue(f.name, newValue);
                                  }}
                                  placeholder="输入图片 URL"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              )}
                            </div>
                          ) : (
                            <input
                              type="text"
                              className="field-value-input"
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
                      <div className="field-row">
                        <div className="field-key">{f.name}</div>
                        <div className="field-value-preview">
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
                                        className="field-image-preview-small"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                      />
                                    );
                                  } else {
                                    return <span className="field-image-url">图片已加载</span>;
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
                      <div className="field-controls">
                        {/* 位置和大小控制按钮 */}
                        <div className="image-control-buttons" onClick={(e) => e.stopPropagation()}>
                          {/* 方向键 - WASD 方式排列，靠左 */}
                          <div className="dpad-container">
                            <button
                              className="image-control-btn dpad-btn dpad-up"
                              title="向上 (W)"
                              onClick={(e) => {
                                e.stopPropagation();
                                adjustElementTransform(f.name, 'up');
                              }}
                            >
                              ↑
                            </button>
                            <div className="dpad-middle">
                              <button
                                className="image-control-btn dpad-btn dpad-left"
                                title="向左 (A)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  adjustElementTransform(f.name, 'left');
                                }}
                              >
                                ←
                              </button>
                              <button
                                className="image-control-btn dpad-btn dpad-down"
                                title="向下 (S)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  adjustElementTransform(f.name, 'down');
                                }}
                              >
                                ↓
                              </button>
                              <button
                                className="image-control-btn dpad-btn dpad-right"
                                title="向右 (D)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  adjustElementTransform(f.name, 'right');
                                }}
                              >
                                →
                              </button>
                            </div>
                          </div>
                          {/* 缩放按钮 - 靠右，上面+，下面- */}
                          <div className="zoom-container">
                            <button
                              className="image-control-btn zoom-btn zoom-in"
                              title="放大"
                              onClick={(e) => {
                                e.stopPropagation();
                                adjustElementTransform(f.name, 'zoomIn');
                              }}
                            >
                              +
                            </button>
                            <button
                              className="image-control-btn zoom-btn zoom-out"
                              title="缩小"
                              onClick={(e) => {
                                e.stopPropagation();
                                adjustElementTransform(f.name, 'zoomOut');
                              }}
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

          {/* 编辑模式切换 */}
          <div className="control-section">
            <h3>模板编辑</h3>
            <button
              className={`btn-primary ${isEditMode ? 'active' : ''}`}
              onClick={() => setIsEditMode(!isEditMode)}
            >
              {isEditMode ? '退出编辑模式' : '进入编辑模式'}
            </button>
            <p className="info-text">
              {isEditMode 
                ? '编辑模式：可以直接在预览区域编辑模板元素' 
                : '点击进入编辑模式，可以直接编辑模板的 HTML 结构'}
            </p>
          </div>
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
                extraAssets={linkedAssets}
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

