import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import JSZip from "jszip";
import { parseJsonFile } from "../../utils/fileHelpers";
import { exportNodeToPngDataUrl } from "../../utils/htmlExport";
import { BannerData, BannerRenderData } from "../../types";
import { TemplateField } from "./types";
import { buildSrcDoc, extractCssFromHtml } from "./htmlUtils";
import { processZipFile } from "./zipHandler";
import { handleHtmlUpload as handleHtmlUploadUtil, handleCssUpload as handleCssUploadUtil } from "./fileHandlers";
import { applyJsonDataToIframe as applyJsonDataToIframeUtil, applyJsonDataToMultiIframe as applyJsonDataToMultiIframeUtil, updatePriceFields } from "./dataApplier";
import { parseFirstSheet, ParsedSheet, getFirstVisibleSheetName, sheetToVisibleRawRows, sheetToVisibleJson } from "../../utils/excelParser";
import { detectOfferSheet, detectSheetKindByPricePattern } from "../../utils/offerDetector";
import { parseRowPerSkuSheet, ExcelRowData } from "../../utils/offerRowPerSkuParser";
import { parseMultiRowProducts } from "../../utils/multiRowProductParser";
import { parseRowPerSkuProducts } from "../../utils/rowPerSkuProductParser";
import { ProductBlock } from "../../types";
import { AssetSidebar } from "../../components/AssetSidebar";
import { ResizableSidebar } from "../../components/ResizableSidebar";
import type { TempAsset } from "@shared/types/assets";
import {
  readSessionPayload,
  SessionBusKeys,
  type LinkToBannerGenPayload,
} from "@shared/utils/sessionBus";
import { localAssetManager } from "@shared/utils/localAssetManager";
import {
  saveBannerGenData,
  loadBannerGenData,
  clearBannerGenData,
} from "../../utils/persistence";
import { navigateToFluidDAM } from "../../utils/navigation";
import { shareBannerZip } from "../../utils/apiUtils";
import { useUndoRedo } from "../../utils/useUndoRedo";
import { UndoRedoButtons } from "../../components/UndoRedoButtons";
import { captureSnapshot, restoreSnapshot, type TemplateSnapshot } from "../TemplateGenPage/snapshot";
import "./BannerBatchPage.css";

export const BannerBatchPage: React.FC = () => {
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
  
  // JSON 数据相关状态
  const [jsonData, setJsonData] = useState<BannerData[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [showShareDialog, setShowShareDialog] = useState<boolean>(false);
  const [shareUrl, setShareUrl] = useState<string>("");
  // 保存每个数据索引的编辑值：{ [index]: { [fieldName]: value } }
  const [editedValues, setEditedValues] = useState<Record<number, Record<string, string>>>({});
  
  // 使用 ref 存储 editedValues 的最新值，避免 Effect 1 在 editedValues 变化时触发
  const editedValuesRef = useRef<Record<number, Record<string, string>>>({});
  
  // 同步 editedValues 到 ref
  useEffect(() => {
    editedValuesRef.current = editedValues;
  }, [editedValues]);

  // 编辑/预览模式状态（false=编辑模式，true=预览模式）
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  
  // 预览模式下选中的 banner 索引（用于确定查看哪个图）
  const [selectedBannerIndex, setSelectedBannerIndex] = useState<number | null>(null);
  
  // 获取当前活动的索引（编辑模式用 currentIndex，预览模式用 selectedBannerIndex）
  const getActiveIndex = useCallback(() => {
    if (isPreviewMode) {
      return selectedBannerIndex ?? currentIndex;
    }
    return currentIndex;
  }, [isPreviewMode, selectedBannerIndex, currentIndex]);
  
  // Undo/Redo 就绪开关（防止模板加载阶段触发 undo/redo）
  const undoReadyRef = useRef<boolean>(false);
  const isRestoringRef = useRef<boolean>(false);
  // 每个产品独立的初始快照提交标记：{ [productIndex]: boolean }
  const initialSnapshotCommittedRef = useRef<Record<number, boolean>>({});
  
  // 每个产品独立的 Undo/Redo 状态：{ [productIndex]: { history, currentIndex, lastAction } }
  type UndoRedoState = {
    history: TemplateSnapshot[];
    currentIndex: number;
    lastAction: 'push' | 'undo' | 'redo' | 'reset' | null;
  };
  const undoRedoHistoryRef = useRef<Map<number, UndoRedoState>>(new Map());
  
  // 获取当前产品的 undo/redo 状态（如果不存在则创建）
  const getCurrentUndoRedoState = useCallback((): UndoRedoState => {
    const activeIndex = getActiveIndex();
    if (!undoRedoHistoryRef.current.has(activeIndex)) {
      // 为新产品创建空的 undo/redo 状态
      const newState: UndoRedoState = {
        history: [],
        currentIndex: -1,
        lastAction: null,
      };
      undoRedoHistoryRef.current.set(activeIndex, newState);
      console.log('[BannerBatch] 为产品', activeIndex, '创建新的 undo/redo 历史');
      return newState;
    }
    return undoRedoHistoryRef.current.get(activeIndex)!;
  }, [getActiveIndex]);
  
  // 更新当前产品的 undo/redo 状态并触发重新渲染
  const updateCurrentUndoRedoState = useCallback((updater: (state: UndoRedoState) => UndoRedoState) => {
    const activeIndex = getActiveIndex();
    const currentState = getCurrentUndoRedoState();
    const newState = updater(currentState);
    undoRedoHistoryRef.current.set(activeIndex, newState);
    // 触发重新渲染（通过更新一个状态）
    setUndoRedoStateVersion(v => v + 1);
  }, [getActiveIndex, getCurrentUndoRedoState]);
  
  // 用于触发重新渲染的版本号
  const [undoRedoStateVersion, setUndoRedoStateVersion] = useState(0);
  
  // 计算当前产品的 undo/redo 对象（用于 UI 和操作）
  const currentUndoRedo = useMemo(() => {
    const state = getCurrentUndoRedoState();
    return {
      currentState: state.currentIndex >= 0 && state.currentIndex < state.history.length 
        ? state.history[state.currentIndex] 
        : null,
      canUndo: state.history.length > 0 && state.currentIndex > 0,
      canRedo: state.currentIndex < state.history.length - 1,
      lastAction: state.lastAction,
      pushState: (snapshot: TemplateSnapshot) => {
        updateCurrentUndoRedoState((state) => {
          const newHistory = state.history.slice(0, state.currentIndex + 1);
          newHistory.push(snapshot);
          console.log('[BannerBatch] pushState for product', getActiveIndex(), {
            prevLength: state.history.length,
            newLength: newHistory.length,
            newIndex: newHistory.length - 1,
          });
          return {
            history: newHistory,
            currentIndex: newHistory.length - 1,
            lastAction: 'push',
          };
        });
      },
      undo: () => {
        updateCurrentUndoRedoState((state) => {
          if (state.history.length > 0 && state.currentIndex > 0) {
            console.log('[BannerBatch] undo for product', getActiveIndex(), {
              currentIndex: state.currentIndex,
              newIndex: state.currentIndex - 1,
            });
            return {
              ...state,
              currentIndex: state.currentIndex - 1,
              lastAction: 'undo',
            };
          }
          return state;
        });
      },
      redo: () => {
        updateCurrentUndoRedoState((state) => {
          if (state.currentIndex < state.history.length - 1) {
            console.log('[BannerBatch] redo for product', getActiveIndex(), {
              currentIndex: state.currentIndex,
              newIndex: state.currentIndex + 1,
            });
            return {
              ...state,
              currentIndex: state.currentIndex + 1,
              lastAction: 'redo',
            };
          }
          return state;
        });
      },
      reset: () => {
        updateCurrentUndoRedoState((state) => ({
          ...state,
          currentIndex: 0,
          lastAction: 'reset',
        }));
      },
      clear: () => {
        updateCurrentUndoRedoState(() => ({
          history: [],
          currentIndex: -1,
          lastAction: null,
        }));
      },
    };
  }, [getCurrentUndoRedoState, updateCurrentUndoRedoState, undoRedoStateVersion, getActiveIndex]);
  
  // 统一模板状态（用于一键保存判断）
  const [templateAssets, setTemplateAssets] = useState<{
    html: string;
    css: string;
    fields: TemplateField[];
    fileName: string;
  } | null>(null);
  
  // 来自 Link 的素材
  const [linkedAssets, setLinkedAssets] = useState<TempAsset[]>([]);
  // 来自本机存储的素材
  const [localAssets, setLocalAssets] = useState<TempAsset[]>([]);
  
  // 素材面板宽度和收起状态
  const [assetSidebarWidth, setAssetSidebarWidth] = useState(280);
  const [assetSidebarCollapsed, setAssetSidebarCollapsed] = useState(false);
  
  // 2×2 预览网格相关状态
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  const htmlInputRef = useRef<HTMLInputElement>(null);
  const cssInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  // 导出专用的 iframe ref（始终存在，隐藏）
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // 单图预览用的 iframe ref
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  // 多图模式的4个iframe ref
  const multiIframeRefs = useRef<(HTMLIFrameElement | null)[]>([null, null, null, null]);
  // 用于在 onLoad 回调中访问最新的 currentIndex 和 jsonData，避免闭包捕获过时值
  const currentIndexRef = useRef(currentIndex);
  const jsonDataRef = useRef(jsonData);

  // 保持 ref 与 state 同步
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    jsonDataRef.current = jsonData;
  }, [jsonData]);

  // 初始化时从 localStorage 恢复数据
  useEffect(() => {
    const saved = loadBannerGenData();
    if (saved) {
      console.log('[persistence] 恢复保存的数据');
      let restoredCount = 0;
      
      // 恢复 ZIP 文件相关
      if (saved.htmlContent) {
        setHtmlContent(saved.htmlContent);
        setHtmlFileName(saved.htmlFileName || '');
        restoredCount++;
      }
      if (saved.cssContent) {
        setCssContent(saved.cssContent);
        setCssFileName(saved.cssFileName || '');
        restoredCount++;
      }
      if (saved.templateFields && saved.templateFields.length > 0) {
        setTemplateFields(saved.templateFields);
      }
      
      // 恢复 JSON 数据
      if (saved.jsonData && saved.jsonData.length > 0) {
        setJsonData(saved.jsonData);
        setCurrentIndex(saved.currentIndex || 0);
        restoredCount++;
      }
      
      // 恢复编辑的值
      if (saved.editedValues && Object.keys(saved.editedValues).length > 0) {
        setEditedValues(saved.editedValues);
        restoredCount++;
      }
      
      // 恢复来自 Link 的素材（如果 sessionStorage 中没有新数据）
      if (saved.linkedAssets && saved.linkedAssets.length > 0) {
        // 确保 source 字段类型正确
        const validLinkedAssets = saved.linkedAssets.map(asset => ({
          ...asset,
          source: (asset.source === 'local-upload' || asset.source === 'external-url' || asset.source === 'dam-api')
            ? asset.source
            : 'local-upload' as const
        }));
        setLinkedAssets(validLinkedAssets);
        restoredCount++;
      }
      
      if (restoredCount > 0) {
        setSuccess(`已恢复 ${restoredCount} 项保存的数据`);
      }
    }
  }, []);

  // 初始化时读取来自 Link 的素材（优先使用 sessionStorage 中的新数据）
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

  // 初始化时从本机加载素材
  useEffect(() => {
    const loadLocalAssets = async () => {
      try {
        const assets = await localAssetManager.loadAssets();
        setLocalAssets(assets);
        if (assets.length > 0) {
          console.log(`[BannerGen] 从本机加载了 ${assets.length} 个素材`);
        }
      } catch (error) {
        console.error('[BannerGen] 加载本机素材失败:', error);
      }
    };
    loadLocalAssets();
  }, []);

  // 将模板 CSS 中的 @font-face 规则注入到顶层文档，确保 html-to-image 能识别字体
  useEffect(() => {
    const STYLE_ID = "banner-template-font-style";
    let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

    // 如果没有 CSS，或者模板被清空，移除旧的 style
    if (!cssContent) {
      if (styleEl) {
        styleEl.remove();
      }
      return;
    }

    // 只抽取 @font-face 相关规则，避免把整套模板 CSS 污染到应用全局
    const matches = cssContent.match(/@font-face[\s\S]*?}/g);
    const fontCss = matches ? matches.join("\n") : "";

    if (!fontCss) {
      // 没有字体相关定义，就不注入
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

    // 清理函数：组件卸载时移除样式
    return () => {
      const existingStyle = document.getElementById(STYLE_ID);
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, [cssContent]);

  // 提交快照（和 TemplateGenPage 一样）
  const commitSnapshot = useCallback((reason: string) => {
    // 预览模式下不提交快照
    if (isPreviewMode) {
      return;
    }
    
    const debugInfo = {
      reason,
      undoReady: undoReadyRef.current,
      isRestoring: isRestoringRef.current,
      hasIframe: !!(previewIframeRef.current || iframeRef.current),
      hasIframeSize: !!iframeSize,
      iframeSize,
    };
    console.log('[BannerBatch] commitSnapshot called:', debugInfo);
    
    if (!undoReadyRef.current) {
      console.warn('[BannerBatch] commitSnapshot skipped: undo not ready', debugInfo);
      return;
    }
    if (isRestoringRef.current) {
      console.warn('[BannerBatch] commitSnapshot skipped: currently restoring', debugInfo);
      return;
    }
    
    // 使用当前活动的 iframe（单图用 previewIframeRef，多图用 iframeRef）
    const activeIframe = previewIframeRef.current || iframeRef.current;
    if (!activeIframe) {
      console.warn('[BannerBatch] commitSnapshot skipped: no iframe', debugInfo);
      return;
    }
    
    try {
      const iframeDoc = activeIframe.contentDocument || activeIframe.contentWindow?.document;
      if (!iframeDoc) {
        console.warn('[BannerBatch] commitSnapshot skipped: cannot access iframe document');
        return;
      }
      if (!iframeSize) {
        console.warn('[BannerBatch] commitSnapshot skipped: no iframe size');
        return;
      }
      
      const snapshot = captureSnapshot(
        iframeDoc,
        {
          width: iframeSize.width,
          height: iframeSize.height,
          templateSize: '800x800', // BannerBatchPage 没有 templateSize，使用默认值
        },
        {
          selected: null, // BannerBatchPage 没有背景选择功能
          pos: { x: 0, y: 0 },
          size: 100,
        }
      );
      
      console.log('[BannerBatch] 提交快照:', {
        reason,
        snapshot: {
          meta: snapshot.meta,
          elementsCount: Object.keys(snapshot.elements).length,
        },
      });
      
      currentUndoRedo.pushState(snapshot);
    } catch (e) {
      console.error('[BannerBatch] 提交快照失败:', e);
    }
  }, [currentUndoRedo.pushState, iframeSize, getActiveIndex]);

  // 恢复快照（和 TemplateGenPage 一样）
  const restoreSnapshotFromHistory = useCallback((snapshot: TemplateSnapshot) => {
    const activeIndex = getActiveIndex();
    console.log('[BannerBatch] restoreSnapshotFromHistory called:', {
      productIndex: activeIndex,
      hasIframe: !!(previewIframeRef.current || iframeRef.current),
      snapshot: {
        meta: snapshot.meta,
        elementsCount: Object.keys(snapshot.elements).length,
      },
    });
    
    const activeIframe = previewIframeRef.current || iframeRef.current;
    if (!activeIframe) {
      console.warn('[BannerBatch] restoreSnapshotFromHistory skipped: no iframe');
      return;
    }
    
    isRestoringRef.current = true;
    console.log('[BannerBatch] isRestoringRef set to true');
    
    try {
      const iframeDoc = activeIframe.contentDocument || activeIframe.contentWindow?.document;
      if (!iframeDoc) {
        console.warn('[BannerBatch] restoreSnapshotFromHistory: iframe not ready, retrying in 100ms');
        setTimeout(() => {
          restoreSnapshotFromHistory(snapshot);
        }, 100);
        return;
      }
      
      console.log('[BannerBatch] 开始恢复 meta');
      // 恢复 meta（只恢复 iframeSize，BannerBatchPage 没有 templateSize）
      if (snapshot.meta.width && snapshot.meta.height) {
        console.log('[BannerBatch] 恢复 iframeSize:', snapshot.meta.width, 'x', snapshot.meta.height);
        setIframeSize({ width: snapshot.meta.width, height: snapshot.meta.height });
      }
      
      // 等待 state 更新后再恢复元素
      setTimeout(() => {
        try {
          const iframeDoc2 = activeIframe.contentDocument || activeIframe.contentWindow?.document;
          if (!iframeDoc2) {
            console.warn('[BannerBatch] restoreSnapshotFromHistory: iframe doc not available after delay');
            isRestoringRef.current = false;
            return;
          }
          
          console.log('[BannerBatch] 开始恢复元素，元素数量:', Object.keys(snapshot.elements).length);
          
          // 恢复元素
          restoreSnapshot(
            iframeDoc2,
            snapshot,
            undefined, // meta 已经通过 setState 更新
            undefined  // background 不需要恢复
          );
          
          // 同步更新 editedValues 中的所有字段值，使其与快照一致
          // 这样 Effect 1 重新执行时不会覆盖恢复的状态
          const activeIndex = getActiveIndex();
          const updatedEditedValues: Record<string, string> = {};
          
          // 获取原始 JSON 数据，用于比较
          const originalData = jsonData[activeIndex] || {};
          
          // 从快照中直接读取值，而不是从恢复后的 DOM 读取（避免路径格式差异导致判断失败）
          Object.entries(snapshot.elements).forEach(([fieldName, elementSnap]) => {
            // 跳过价格字段，后面单独处理
            if (fieldName === 'sec_price_int' || fieldName === 'sec_price_decimal') {
              return;
            }
            
            const elements = Array.from(iframeDoc2.querySelectorAll(`[data-field="${fieldName}"]`)) as HTMLElement[];
            if (elements.length === 0) return;
            
            if (elementSnap.tag === 'IMG') {
              // 对于图片元素，使用快照中保存的 src（而不是从 DOM 读取）
              // 这样可以避免绝对路径 vs 相对路径的格式差异问题
              if (elementSnap.src) {
                const snapshotSrc = elementSnap.src;
                const originalSrc = originalData[fieldName];
                
                // 标准化路径比较（移除协议和域名，只比较路径部分）
                const normalizePath = (path: string): string => {
                  try {
                    // 如果是绝对 URL，提取路径部分
                    if (path.startsWith('http://') || path.startsWith('https://')) {
                      const url = new URL(path);
                      return url.pathname;
                    }
                    // 如果是相对路径，移除开头的斜杠
                    return path.startsWith('/') ? path.substring(1) : path;
                  } catch {
                    return path;
                  }
                };
                
                const normalizedSnapshotSrc = normalizePath(snapshotSrc);
                const normalizedOriginalSrc = originalSrc ? normalizePath(String(originalSrc)) : '';
                
                // 只有当 src 与原始 JSON 数据不同时，才保存到 editedValues
                if (normalizedSnapshotSrc !== normalizedOriginalSrc) {
                  // 保存快照中的原始 src（保持原始格式）
                  updatedEditedValues[fieldName] = snapshotSrc;
                } else {
                  // 如果与原始数据相同，确保 editedValues 中不包含该字段（使用原始数据）
                  // 不添加到 updatedEditedValues，这样会从 editedValues 中移除
                }
              }
              
              // 读取 transform（从快照的 style 中读取，而不是从 DOM）
              const imgs = elements.filter(el => el.tagName === 'IMG') as HTMLImageElement[];
              imgs.forEach((img, imgIndex) => {
                const transformKey = `${fieldName}_transform_${imgIndex}`;
                // 从快照的 style 中读取 transform
                const snapshotTransform = elementSnap.style.transform || '';
                if (snapshotTransform) {
                  updatedEditedValues[transformKey] = snapshotTransform;
                } else {
                  // 如果快照中没有 transform，确保 editedValues 中不包含该字段
                  // 不添加到 updatedEditedValues，这样会从 editedValues 中移除
                }
              });
            } else {
              // 对于文字元素，使用快照中保存的文本（而不是从 DOM 读取）
              // 优先使用 html，如果没有则使用 text
              const snapshotText = elementSnap.html !== undefined 
                ? elementSnap.html 
                : (elementSnap.text !== undefined ? elementSnap.text : '');
              
              if (snapshotText !== undefined) {
                // 从快照的文本中提取纯文本内容（用于比较）
                const tempDiv = iframeDoc2.createElement('div');
                tempDiv.innerHTML = snapshotText;
                const snapshotTextContent = tempDiv.textContent?.trim() || tempDiv.innerText?.trim() || '';
                const originalText = originalData[fieldName];
                
                // 只有当文本与原始 JSON 数据不同时，才保存到 editedValues
                if (snapshotTextContent && snapshotTextContent !== originalText && String(originalText) !== snapshotTextContent) {
                  // 保存快照中的原始文本（保留 HTML 结构）
                  updatedEditedValues[fieldName] = snapshotText;
                }
              }
            }
          });
          
          // 特殊处理价格字段（价格字段有特殊的结构）
          const priceEl = iframeDoc2.querySelector('[data-field-int]') as HTMLElement;
          if (priceEl) {
            const priceInt2 = priceEl.querySelector('.price-int-2') as HTMLElement;
            const priceInt3 = priceEl.querySelector('.price-int-3') as HTMLElement;
            const priceDecimal2 = priceEl.querySelector('.price-decimal-2') as HTMLElement;
            const priceDecimal3 = priceEl.querySelector('.price-decimal-3') as HTMLElement;
            
            let intValue = '';
            let decValue = '';
            
            if (priceInt2 || priceInt3 || priceDecimal2 || priceDecimal3) {
              intValue = (priceInt2?.textContent || priceInt3?.textContent || '').trim();
              decValue = (priceDecimal2?.textContent || priceDecimal3?.textContent || '').trim();
            } else {
              const signNode = priceEl.querySelector('.sign');
              const decimalNode = priceEl.querySelector('.decimal');
              intValue = signNode?.nextSibling?.nodeValue?.trim() || '';
              decValue = decimalNode?.textContent?.trim() || '';
            }
            
            // 只有当价格与原始 JSON 数据不同时，才保存到 editedValues
            const originalInt = String(originalData.sec_price_int || '');
            const originalDec = String(originalData.sec_price_decimal || '');
            
            if (intValue && intValue !== originalInt) {
              updatedEditedValues['sec_price_int'] = intValue;
            }
            if (decValue && decValue !== originalDec) {
              updatedEditedValues['sec_price_decimal'] = decValue;
            }
          }
          
          // 更新 editedValues
          setEditedValues(prev => ({
            ...prev,
            [activeIndex]: updatedEditedValues,
          }));
          
          console.log('[BannerBatch] 恢复快照完成，已同步 editedValues，字段数量:', 
            Object.keys(updatedEditedValues).length,
            'transform 键数量:', 
            Object.keys(updatedEditedValues).filter(k => k.includes('_transform_')).length);
          console.log('[BannerBatch] 恢复后的 editedValues 详情:', {
            activeIndex,
            updatedEditedValues,
            product_main_src: updatedEditedValues.product_main_src,
            product_main_src_transforms: Object.keys(updatedEditedValues).filter(k => k.startsWith('product_main_src_transform_')),
          });
        } catch (e) {
          console.error('[BannerBatch] 恢复元素失败:', e);
        } finally {
          // 延长释放时间，确保 Effect 1 不会在恢复后立即触发
          setTimeout(() => {
            requestAnimationFrame(() => {
              setTimeout(() => {
                isRestoringRef.current = false;
                console.log('[BannerBatch] isRestoringRef set to false (after restore)');
              }, 300); // 额外延迟 300ms，确保所有 effect 都已检查过 isRestoringRef
            });
          }, 200);
        }
      }, 50);
    } catch (e) {
      console.error('[BannerBatch] 恢复快照失败:', e);
      isRestoringRef.current = false;
      console.log('[BannerBatch] isRestoringRef set to false (error)');
    }
  }, [jsonData, getActiveIndex]);

  // Undo/Redo effect（和 TemplateGenPage 一样）
  useEffect(() => {
    const activeIndex = getActiveIndex();
    const debugInfo = {
      productIndex: activeIndex,
      hasCurrentState: !!currentUndoRedo.currentState,
      lastAction: currentUndoRedo.lastAction,
      canUndo: currentUndoRedo.canUndo,
      canRedo: currentUndoRedo.canRedo,
      currentStateType: currentUndoRedo.currentState ? typeof currentUndoRedo.currentState : 'null',
    };
    
    console.log('[BannerBatch] undo/redo effect triggered:', debugInfo);
    
    // 只在 undo/redo/reset 时恢复，push 时不恢复
    if (currentUndoRedo.lastAction === 'undo' || currentUndoRedo.lastAction === 'redo' || currentUndoRedo.lastAction === 'reset') {
      if (!currentUndoRedo.currentState) {
        console.error('[BannerBatch] undo/redo effect: lastAction is', currentUndoRedo.lastAction, 'but currentState is null!', debugInfo);
        return;
      }
      console.log('[BannerBatch] undo/redo effect: restoring snapshot, action:', currentUndoRedo.lastAction);
      restoreSnapshotFromHistory(currentUndoRedo.currentState);
    } else {
      if (currentUndoRedo.lastAction === 'push') {
        console.log('[BannerBatch] undo/redo effect: push action, skipping restore');
      } else if (!currentUndoRedo.currentState) {
        console.log('[BannerBatch] undo/redo effect: no current state and not undo/redo action, skipping');
      } else {
        console.log('[BannerBatch] undo/redo effect: skipping restore, action:', currentUndoRedo.lastAction);
      }
    }
  }, [currentUndoRedo.currentState, currentUndoRedo.lastAction, currentUndoRedo.canUndo, currentUndoRedo.canRedo, restoreSnapshotFromHistory, getActiveIndex, undoRedoStateVersion]);

  // 在恢复快照完成后，同步更新编辑栏中的字段值
  useEffect(() => {
    // 只在编辑模式下同步
    if (isPreviewMode) return;
    
    // 检查是否刚刚完成恢复（通过监听 undo/redo 操作）
    if (currentUndoRedo.lastAction === 'undo' || currentUndoRedo.lastAction === 'redo' || currentUndoRedo.lastAction === 'reset') {
      if (!currentUndoRedo.currentState || !selectedField) return;
      
      // 延迟执行，确保快照恢复完成（restoreSnapshotFromHistory 内部有延迟约 500ms）
      const timer = setTimeout(() => {
        const activeIndex = getActiveIndex();
        console.log('[BannerBatch] syncing selectedFieldValue after undo/redo, field:', selectedField, 'index:', activeIndex);
        
        // 内联同步逻辑，避免依赖顺序问题
        let iframe: HTMLIFrameElement | null = null;
        
        // 编辑模式：使用预览 iframe
        if (!isPreviewMode) {
          iframe = previewIframeRef.current || iframeRef.current;
        }
        
        if (!iframe) return;
        
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iframeDoc) return;
          
          const fieldName = selectedField;
          
          // 特殊处理价格字段
          if (fieldName === 'sec_price_int' || fieldName === 'sec_price_decimal') {
            const priceEl = iframeDoc.querySelector('[data-field-int]') as HTMLElement;
            if (priceEl) {
              const priceInt2 = priceEl.querySelector('.price-int-2') as HTMLElement;
              const priceInt3 = priceEl.querySelector('.price-int-3') as HTMLElement;
              const priceDecimal2 = priceEl.querySelector('.price-decimal-2') as HTMLElement;
              const priceDecimal3 = priceEl.querySelector('.price-decimal-3') as HTMLElement;
              
              let intValue = '';
              let decValue = '';
              
              if (priceInt2 || priceInt3 || priceDecimal2 || priceDecimal3) {
                intValue = (priceInt2?.textContent || priceInt3?.textContent || '').trim();
                decValue = (priceDecimal2?.textContent || priceDecimal3?.textContent || '').trim();
              } else {
                const signNode = priceEl.querySelector('.sign');
                const decimalNode = priceEl.querySelector('.decimal');
                intValue = signNode?.nextSibling?.nodeValue?.trim() || '';
                decValue = decimalNode?.textContent?.trim() || '';
              }
              
              setSelectedFieldValue(fieldName === 'sec_price_int' ? intValue : decValue);
            }
          } else {
            // 普通字段处理
            const element = iframeDoc.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
            if (element) {
              let value = "";
              if (element.tagName === "IMG") {
                value = (element as HTMLImageElement).src || "";
              } else {
                value = element.textContent?.trim() || element.innerText?.trim() || "";
              }
              setSelectedFieldValue(value);
            }
          }
        } catch (e) {
          console.warn("无法从 iframe 同步字段值:", e);
        }
      }, 600); // 等待恢复完成
      
      return () => clearTimeout(timer);
    }
  }, [currentUndoRedo.lastAction, currentUndoRedo.currentState, selectedField, getActiveIndex, isPreviewMode]);

  // 监听 2×2 预览网格宽度变化，用于计算缩放比例
  useLayoutEffect(() => {
    if (!gridRef.current) return;
    
    const obs = new ResizeObserver(([entry]) => {
      setGridWidth(entry.contentRect.width);
    });
    
    obs.observe(gridRef.current);
    
    return () => obs.disconnect();
  }, [isPreviewMode]);

  // 处理 HTML 文件上传
  const handleHtmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    handleHtmlUploadUtil(
      file,
      (result) => {
        setTemplateFields(result.fields);
        setHtmlContent(result.html);
        setHtmlFileName(file.name);
        if (result.css && !cssContent) {
          setCssContent(result.css);
        }
        // 设置统一模板状态（用于一键保存判断）
        setTemplateAssets({
          html: result.html,
          css: result.css || "",
          fields: result.fields,
          fileName: file.name,
        });
        // ✅ 清除旧的 JSON 数据，避免新模板使用旧数据
        setJsonData([]);
        setCurrentIndex(0);
        setSelectedBannerIndex(null);
        setSuccess(result.successMessage);
        if (htmlInputRef.current) {
          htmlInputRef.current.value = "";
        }
      },
      (message) => {
        setError(message);
        if (htmlInputRef.current) {
          htmlInputRef.current.value = "";
        }
      }
    );
  };

  // 处理 CSS 文件上传
  const handleCssUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    handleCssUploadUtil(
      file,
      (css, successMessage) => {
        setCssContent(css);
        setCssFileName(file.name);
        setSuccess(successMessage);
        if (cssInputRef.current) {
          cssInputRef.current.value = "";
        }
      },
      (message) => {
        setError(message);
        if (cssInputRef.current) {
          cssInputRef.current.value = "";
        }
      }
    );
  };

  // 清除 HTML
  const handleClearHtml = () => {
    setHtmlContent("");
    setHtmlFileName("");
    setTemplateFields([]); // 清除字段列表
    setSelectedField(null); // 清除选中字段
    setSelectedFieldValue("");
    setTemplateAssets(null); // 清除统一模板状态
    clearBannerGenData(); // 清除保存的数据
    setSuccess("已清除 HTML 模板");
  };


  // 处理 ZIP 文件上传
  const handleZipUpload = async (file: File | null) => {
    if (!file) return;

    setError("");
    setSuccess("");

    try {
      const result = await processZipFile(file);
      
      setTemplateFields(result.fields);
      setHtmlContent(result.html);
      setCssContent(result.css);
      setHtmlFileName(file.name);
      setCssFileName("");
      
      // 设置统一模板状态（用于一键保存判断）
      setTemplateAssets({
        html: result.html,
        css: result.css,
        fields: result.fields,
        fileName: file.name,
      });
      
      // ✅ 如果 ZIP 中有 JSON 数据，将模板的 data-field 值填充到第一个 JSON 数据项
      if (result.jsonData.length > 0) {
        const { extractTemplateDataFields, populateTemplateDataToJson } = await import('./templateExtractor');
        const templateData = extractTemplateDataFields(result.html);
        const finalJsonData = populateTemplateDataToJson(result.jsonData, templateData);
        setJsonData(finalJsonData);
        setCurrentIndex(0);
        setSelectedBannerIndex(isPreviewMode ? 0 : null);
      } else {
        // 如果 ZIP 中没有 JSON 数据，也要清除旧的 JSON 数据
        setJsonData([]);
        setCurrentIndex(0);
        setSelectedBannerIndex(null);
      }
      
      setSuccess(result.successMessage);
    } catch (err) {
      const message = err instanceof Error ? err.message : "ZIP 文件处理失败";
      setError(message);
      console.error("ZIP 处理错误:", err);
    }

    // 清空 input
    if (zipInputRef.current) {
      zipInputRef.current.value = "";
    }
  };

  // 处理 Excel 上传
  const handleExcelUpload = async (file: File | null) => {
    if (!file) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      // 1. 解析 Excel 文件（初步解析，用于扫描表头）
      const parsedSheet = await parseFirstSheet(file);
      console.log("解析的 Excel sheet:", parsedSheet);
      console.log("Sheet 名称:", parsedSheet.sheetName);
      console.log("原始行数据（前10行）:", parsedSheet.rawRows);

      // 2. 检测是否为 offer 表（会扫描前10行）
      // 注意：detectOfferSheet 要求有 brief 列，但新的 detectSheetKindByPricePattern 只需要价格列
      // 所以即使 detectOfferSheet 返回 UNKNOWN，我们仍然可以尝试用 detectSheetKindByPricePattern
      const detection = detectOfferSheet(parsedSheet);
      console.log("检测结果:", detection);
      console.log("找到的表头行号:", detection.headerRowIndex);

      // 如果 detectOfferSheet 返回 UNKNOWN，我们仍然可以继续，因为 detectSheetKindByPricePattern 只需要价格列
      // 但我们需要先确保表头行被正确识别（用于后续重新解析）
      let headerRowIndex = detection.headerRowIndex;
      if (headerRowIndex === undefined) {
        // 如果 detectOfferSheet 没找到表头，尝试从 parsedSheet 获取
        headerRowIndex = parsedSheet.headerRowIndex || 0;
        console.log("使用默认表头行号:", headerRowIndex);
      }

      // 3. 重新解析数据，确保字段名匹配（即使表头行是第一行，也要确保字段名正确）
      // 因为 sheetToVisibleJson 可能生成 __EMPTY_ 这样的字段名，而不是实际的表头名
      let finalParsedSheet = parsedSheet;
      // 如果表头行不是第一行，或者我们需要确保字段名匹配，就重新解析
      if (headerRowIndex !== undefined && (headerRowIndex !== 0 || true)) { // 暂时总是重新解析以确保字段名匹配
        // 重新解析，从找到的表头行开始
        const XLSX = await import("xlsx");
        const reader = new FileReader();
        const reparsePromise = new Promise<ParsedSheet>((resolve, reject) => {
          reader.onload = (e) => {
            try {
              const data = new Uint8Array(e.target?.result as ArrayBuffer);
              const workbook = XLSX.read(data, { type: "array" });
              
              // 使用新的工具函数获取第一个可见的 sheet
              const targetSheetName = getFirstVisibleSheetName(workbook);
              if (!targetSheetName) {
                throw new Error("No visible sheet found in workbook");
              }
              const sheet = workbook.Sheets[targetSheetName];

              // 获取所有原始行（不限制行数，确保获取完整数据）
              const allRawRowsForHeader = XLSX.utils.sheet_to_json<any[]>(sheet, {
                defval: "",
                header: 1,
              }) as any[][];
              
              // 找到表头行在原始 sheet 中的实际行号
              let actualHeaderRowIndex = 0;
              let visibleRowCount = 0;
              for (let i = 0; i < allRawRowsForHeader.length; i++) {
                const rowMeta = sheet["!rows"]?.[i];
                const isHidden = rowMeta && rowMeta.hidden;
                if (!isHidden) {
                  if (visibleRowCount === headerRowIndex) {
                    actualHeaderRowIndex = i;
                    break;
                  }
                  visibleRowCount++;
                }
              }
              
              // 获取表头行的完整内容（从原始行中获取，确保包含所有列）
              const headerRow = allRawRowsForHeader[actualHeaderRowIndex];
              const headerRowValues = headerRow ? headerRow.map((cell: any) => String(cell || "").trim()) : [];
              console.log("表头行的内容（完整）:", headerRowValues);
              console.log("表头行的列数:", headerRowValues.length);

              console.log("重新解析：表头行在可见行中的索引:", headerRowIndex, "在原始 sheet 中的行号:", actualHeaderRowIndex);

              // 手动映射：获取所有原始行数据（和表头行使用同一个数据源，确保列数一致）
              const allRawRowsForData = allRawRowsForHeader;
              
              // 从表头行的下一行开始获取数据行，只处理可见的行
              const dataStartRow = actualHeaderRowIndex + 1;
              const mappedJson = allRawRowsForData
                .map((row, rowIndex) => ({ row, rowIndex }))
                .filter(({ row, rowIndex }) => {
                  // 只处理表头行之后的行
                  if (rowIndex <= actualHeaderRowIndex) return false;
                  // 过滤隐藏行
                  const rowMeta = sheet["!rows"]?.[rowIndex];
                  const isHidden = rowMeta && rowMeta.hidden;
                  return !isHidden;
                })
                .map(({ row, rowIndex }) => {
                  // 手动映射字段名
                  // 确保使用表头行的所有列，即使数据行的列数不同
                  const mappedRow: Record<string, any> = {};
                  
                  // 处理重复字段名：
                  // 1. 第一次遍历：收集所有字段的值（按列索引顺序）
                  const fieldValuesByCol: Array<{ headerName: string; value: any; colIdx: number }> = [];
                  
                  for (let colIdx = 0; colIdx < headerRowValues.length; colIdx++) {
                    const headerName = headerRowValues[colIdx];
                    if (headerName) {  // 只映射有名称的列
                      // 确保 colIdx 在 row 数组范围内
                      const cellValue = colIdx < row.length ? row[colIdx] : undefined;
                      
                      // 检查值是否为空
                      const hasValue = cellValue !== null && cellValue !== undefined && cellValue !== "" && String(cellValue).trim() !== "";
                      
                      fieldValuesByCol.push({ headerName, value: cellValue, colIdx });
                      
                      // 调试第一行数据
                      if (rowIndex === actualHeaderRowIndex + 1 && colIdx < 20) {
                        console.log(`  列 ${colIdx} (${headerName}):`, cellValue, hasValue ? '(有值)' : '(空值)');
                      }
                    }
                  }
                  
                  // 2. 第二次遍历：处理重复字段名
                  // 统计每个字段名出现的次数和位置
                  const fieldNameCount = new Map<string, number>();
                  const fieldNameIndices = new Map<string, number[]>();
                  
                  fieldValuesByCol.forEach(({ headerName, colIdx }) => {
                    const count = fieldNameCount.get(headerName) || 0;
                    fieldNameCount.set(headerName, count + 1);
                    
                    if (!fieldNameIndices.has(headerName)) {
                      fieldNameIndices.set(headerName, []);
                    }
                    fieldNameIndices.get(headerName)!.push(colIdx);
                  });
                  
                  // 3. 第三次遍历：生成最终字段名并添加有值的字段
                  fieldValuesByCol.forEach(({ headerName, value, colIdx }) => {
                    // 检查值是否为空
                    const hasValue = value !== null && value !== undefined && value !== "" && String(value).trim() !== "";
                    
                    if (!hasValue) {
                      return; // 跳过空值
                    }
                    
                    // 确定最终字段名
                    let finalFieldName = headerName;
                    const count = fieldNameCount.get(headerName)!;
                    
                    if (count > 1) {
                      // 有重复字段名，需要添加序号
                      const indices = fieldNameIndices.get(headerName)!;
                      const position = indices.indexOf(colIdx);
                      
                      // 检查其他同名字段是否有值
                      const otherValues = indices
                        .filter(idx => idx !== colIdx)
                        .map(idx => {
                          const item = fieldValuesByCol.find(f => f.colIdx === idx && f.headerName === headerName);
                          return item ? item.value : null;
                        })
                        .filter(v => v !== null && v !== undefined && v !== "" && String(v).trim() !== "");
                      
                      // 如果其他同名字段也有值，添加序号
                      if (otherValues.length > 0) {
                        finalFieldName = `${headerName}${position + 1}`;
                      }
                      // 如果其他同名字段都没有值，使用原始字段名（不加序号）
                    }
                    
                    mappedRow[finalFieldName] = value; // 保留原始类型
                  });
                  
                  if (rowIndex === actualHeaderRowIndex + 1) {
                    // 只打印第一行数据的调试信息
                    console.log("第一行数据映射 - 表头字段数:", headerRowValues.filter(h => h).length);
                    console.log("第一行数据映射 - 数据行列数:", row.length);
                    console.log("第一行数据映射 - 映射后字段数:", Object.keys(mappedRow).length);
                    console.log("第一行数据映射 - 所有字段名:", Object.keys(mappedRow));
                    console.log("第一行数据映射 - 是否包含'主图brief':", '主图brief' in mappedRow);
                    console.log("第一行数据映射 - 是否包含'主图brief1':", '主图brief1' in mappedRow);
                    if ('主图brief' in mappedRow) {
                      console.log("第一行数据映射 - '主图brief'的值:", mappedRow['主图brief']);
                    }
                    if ('主图brief1' in mappedRow) {
                      console.log("第一行数据映射 - '主图brief1'的值:", mappedRow['主图brief1']);
                    }
                  }
                  return mappedRow;
                });
              
              console.log("重新解析：可见数据行数:", mappedJson.length);
              console.log("重新解析后的数据（前3行）:", mappedJson.slice(0, 3));
              if (mappedJson.length > 0) {
                const firstRowKeys = Object.keys(mappedJson[0]);
                console.log("第一行的字段名（数量）:", firstRowKeys.length);
                console.log("第一行的所有字段名:", firstRowKeys);
                console.log("表头行的字段名（数量）:", headerRowValues.filter(h => h).length);
                console.log("表头行的所有字段名:", headerRowValues.filter(h => h));
              }
              
              resolve({
                sheetName: targetSheetName,
                headers: headerRowValues,
                headerRowIndex: actualHeaderRowIndex, // 保存原始行号
                rows: mappedJson,
                rawRows: parsedSheet.rawRows,  // 保留原始扫描用的 rawRows
              });
            } catch (err) {
              reject(err);
            }
          };
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        });
        finalParsedSheet = await reparsePromise;
        console.log("重新解析后的数据（从第", headerRowIndex! + 1, "行开始）:", finalParsedSheet);
      }

      // 4. 判断 sheet 类型：多行一个产品 vs 一行一个产品
      const sheetKind = detectSheetKindByPricePattern(finalParsedSheet);
      console.log("Sheet 类型检测结果:", sheetKind);

      // 5. 根据类型解析为 ProductBlock[]
      let products: ProductBlock[] = [];
      
      if (sheetKind === "MULTIROW_PRODUCT") {
        products = parseMultiRowProducts(finalParsedSheet);
        console.log("多行产品解析结果:", products);
        console.log("产品数量:", products.length);
        if (products.length > 0) {
          console.log("第一个产品包含的行数:", products[0].rows.length);
        }
      } else if (sheetKind === "ROW_PER_SKU") {
        products = parseRowPerSkuProducts(finalParsedSheet);
        console.log("单行产品解析结果:", products);
        console.log("产品数量:", products.length);
      } else {
        setError("未识别为可用的 Excel 结构（MULTIROW_PRODUCT 或 ROW_PER_SKU），请检查表头字段。");
        return;
      }

      if (products.length === 0) {
        const rowCount = finalParsedSheet.rows.length;
        setError(`未能从 Excel 中提取到有效产品数据。总行数: ${rowCount}。请检查数据行或表头识别是否正确。`);
        return;
      }

      // 6. 显示成功消息和预览（前3条）
      const headerInfo = headerRowIndex !== undefined && headerRowIndex > 0 
        ? `（表头在第${headerRowIndex + 1}行）`
        : "";
      const kindText = sheetKind === "MULTIROW_PRODUCT" ? "多行产品" : "单行产品";
      setSuccess(`成功解析 ${products.length} 个产品（${kindText}模式${headerInfo}）`);
      console.log("前3个产品预览:", products.slice(0, 3));

      // 7. 自动下载 JSON 文件
      try {
        const jsonString = JSON.stringify(products, null, 2); // 格式化 JSON，缩进2空格
        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // 生成文件名：使用原文件名 + 时间戳
        const originalFileName = file.name.replace(/\.[^/.]+$/, ""); // 去掉扩展名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // 格式：2024-01-01T12-00-00
        link.download = `${originalFileName}_OfferProducts_${timestamp}.json`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log("JSON 文件已下载:", link.download);
      } catch (downloadErr) {
        console.warn("下载 JSON 文件失败:", downloadErr);
        // 下载失败不影响主流程，只记录警告
      }

      // TODO: 后续 Brief 可以将 products 转换为 BannerData[] 并应用到模板

    } catch (err) {
      const message = err instanceof Error ? err.message : "Excel 文件处理失败";
      setError(message);
      console.error("Excel 处理错误:", err);
    }

    // 清空 input
    if (excelInputRef.current) {
      excelInputRef.current.value = "";
    }
  };

  // 点击预览区域上传 ZIP
  const handlePreviewAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 如果已经有 HTML 内容，不触发上传
    if (htmlContent) {
      return;
    }
    // 如果点击的是 iframe，不触发上传
    const target = e.target as HTMLElement;
    if (target.tagName === 'IFRAME') {
      return;
    }
    // 触发 ZIP 文件选择（包括点击 placeholder 和空白区域）
    if (zipInputRef.current) {
      zipInputRef.current.click();
    }
  };

  // 从指定 iframe 同步字段值到右侧面板
  const syncSelectedFieldValueFromIframe = useCallback((fieldName: string, dataIndex: number) => {
    let iframe: HTMLIFrameElement | null = null;
    
    // 多图模式：找到对应的 iframe
    if (isPreviewMode) {
      const offset = dataIndex - currentIndex;
      if (offset >= 0 && offset < 4) {
        iframe = multiIframeRefs.current[offset];
      }
    }
    
    // 单图模式或找不到对应 iframe：使用预览 iframe
    if (!iframe) {
      iframe = previewIframeRef.current || iframeRef.current;
    }
    
    if (!iframe) return;

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      // 特殊处理价格字段
      if (fieldName === 'sec_price_int' || fieldName === 'sec_price_decimal') {
        const priceEl = iframeDoc.querySelector('[data-field-int]') as HTMLElement;
        if (priceEl) {
          const priceInt2 = priceEl.querySelector('.price-int-2') as HTMLElement;
          const priceInt3 = priceEl.querySelector('.price-int-3') as HTMLElement;
          const priceDecimal2 = priceEl.querySelector('.price-decimal-2') as HTMLElement;
          const priceDecimal3 = priceEl.querySelector('.price-decimal-3') as HTMLElement;
          
          let intValue = '';
          let decValue = '';
          
          if (priceInt2 || priceInt3 || priceDecimal2 || priceDecimal3) {
            intValue = (priceInt2?.textContent || priceInt3?.textContent || '').trim();
            decValue = (priceDecimal2?.textContent || priceDecimal3?.textContent || '').trim();
          } else {
            const signNode = priceEl.querySelector('.sign');
            const decimalNode = priceEl.querySelector('.decimal');
            intValue = signNode?.nextSibling?.nodeValue?.trim() || '';
            decValue = decimalNode?.textContent?.trim() || '';
          }
          
          setSelectedFieldValue(fieldName === 'sec_price_int' ? intValue : decValue);
        }
      } else {
        // 普通字段处理
        const element = iframeDoc.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
        if (element) {
          let value = "";
          if (element.tagName === "IMG") {
            value = (element as HTMLImageElement).src || "";
          } else {
            value = element.textContent?.trim() || element.innerText?.trim() || "";
          }
          setSelectedFieldValue(value);
        }
      }
    } catch (e) {
      console.warn("无法从 iframe 同步字段值:", e);
    }
  }, [isPreviewMode, currentIndex]);
  
  // 清除所有 iframe 中的字段高亮
  const clearAllFieldHighlights = useCallback(() => {
    // 清除多图模式下的所有 iframe
    if (isPreviewMode) {
      multiIframeRefs.current.forEach((iframe) => {
        if (iframe) {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc) {
              const highlighted = iframeDoc.querySelectorAll(".field-highlight");
              highlighted.forEach((el) => el.classList.remove("field-highlight"));
            }
          } catch (e) {
            // 忽略错误
          }
        }
      });
    }
    
    // 清除单图模式的 iframe
    const previewIframe = previewIframeRef.current || iframeRef.current;
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
  }, [isPreviewMode]);
  
  // 高亮 iframe 中的元素（根据 activeIndex 选择正确的 iframe，只高亮选中的那个）
  const highlightElementInIframe = useCallback((fieldName: string, dataIndex?: number) => {
    const activeIndex = dataIndex !== undefined ? dataIndex : getActiveIndex();
    
    // 先清除所有 iframe 中的高亮
    clearAllFieldHighlights();
    
    let iframe: HTMLIFrameElement | null = null;
    
    // 多图模式：找到对应的 iframe（只高亮选中的那个）
    if (isPreviewMode) {
      const offset = activeIndex - currentIndex;
      if (offset >= 0 && offset < 4) {
        iframe = multiIframeRefs.current[offset];
      }
    }
    
    // 单图模式或找不到对应 iframe：使用预览 iframe
    if (!iframe) {
      iframe = previewIframeRef.current || iframeRef.current;
    }
    
    if (!iframe) return;

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      // 特殊处理价格字段
      if (fieldName === 'sec_price_int' || fieldName === 'sec_price_decimal') {
        const priceEl = iframeDoc.querySelector('[data-field-int]') as HTMLElement;
        if (priceEl) {
          priceEl.classList.add("field-highlight");
          
          // 优先查找新的价格结构：.price-int-2, .price-int-3 和 .price-decimal-2, .price-decimal-3
          const priceInt2 = priceEl.querySelector('.price-int-2') as HTMLElement;
          const priceInt3 = priceEl.querySelector('.price-int-3') as HTMLElement;
          const priceDecimal2 = priceEl.querySelector('.price-decimal-2') as HTMLElement;
          const priceDecimal3 = priceEl.querySelector('.price-decimal-3') as HTMLElement;

          let intValue = '';
          let decValue = '';

          if (priceInt2 || priceInt3 || priceDecimal2 || priceDecimal3) {
            // 使用新的价格结构
            intValue = (priceInt2?.textContent || priceInt3?.textContent || '').trim();
            decValue = (priceDecimal2?.textContent || priceDecimal3?.textContent || '').trim();
          } else {
            // 回退到旧逻辑：sign 后的文本节点 + .decimal span
          const signNode = priceEl.querySelector('.sign');
          const decimalNode = priceEl.querySelector('.decimal');
            intValue = signNode?.nextSibling?.nodeValue || '';
            decValue = decimalNode?.textContent || '';
          }
          
          setSelectedFieldValue(fieldName === 'sec_price_int' ? intValue : decValue);
          
          // 只在单图模式下滚动，多图模式下 iframe 是缩放的，滚动会导致布局问题
          if (!isPreviewMode) {
          try {
              priceEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          } catch (e) {
            // 忽略错误
            }
          }
        } else {
          setSelectedFieldValue("未找到对应元素");
        }
      } else {
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

          // 只在单图模式下滚动，多图模式下 iframe 是缩放的，滚动会导致布局问题
          if (!isPreviewMode) {
          try {
              element.scrollIntoView({ behavior: "smooth", block: "nearest" });
          } catch (e) {
            // 如果滚动失败，忽略错误
            }
          }
        } else {
          setSelectedFieldValue("未找到对应元素");
        }
      }
    } catch (e) {
      console.warn("无法访问 iframe 内容:", e);
      setSelectedFieldValue("无法访问预览内容");
    }
  }, [isPreviewMode, currentIndex, getActiveIndex, clearAllFieldHighlights]);

  // 处理选中 banner（2×2 模式下点击某个图）
  const handleSelectBanner = useCallback((index: number) => {
    setSelectedBannerIndex(index);
    
    // 点击 cell 时如果当前已经选中了某个字段，需要同步字段值并重新高亮
    if (selectedField) {
      syncSelectedFieldValueFromIframe(selectedField, index);
      // 重新高亮选中字段（只高亮新选中的产品）
      highlightElementInIframe(selectedField, index);
    }
  }, [selectedField, syncSelectedFieldValueFromIframe, highlightElementInIframe]);

  // 处理 iframe 内元素点击，自动选中对应的 data-field
  const handleIframeElementClick = useCallback((e: MouseEvent, dataIndex?: number) => {
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
      
      // 如果是多图模式且提供了 dataIndex，先选中对应的 banner
      if (isPreviewMode && dataIndex !== undefined) {
        handleSelectBanner(dataIndex);
      }
      
      // 选中字段
      const activeIndex = dataIndex !== undefined ? dataIndex : getActiveIndex();
      if (selectedField === fieldName) {
        // 如果点击的是已选中的字段，则取消选中
        setSelectedField(null);
        setSelectedFieldValue("");
        clearAllFieldHighlights();
      } else {
        // 选中新字段
        setSelectedField(fieldName);
        highlightElementInIframe(fieldName, activeIndex);
        syncSelectedFieldValueFromIframe(fieldName, activeIndex);
      }
    } else if (isPreviewMode && dataIndex !== undefined) {
      // 如果没有点击 data-field 元素，但在多图模式下，仍然选中对应的 banner
      handleSelectBanner(dataIndex);
    }
  }, [isPreviewMode, selectedField, getActiveIndex, handleSelectBanner, highlightElementInIframe, syncSelectedFieldValueFromIframe, clearAllFieldHighlights, setSelectedField, setSelectedFieldValue]);

  // 处理字段点击
  const handleFieldClick = (fieldName: string) => {
    const activeIndex = getActiveIndex();
    
    // 如果点击的是已选中的字段，则取消选中；否则选中新字段
    if (selectedField === fieldName) {
      setSelectedField(null);
      setSelectedFieldValue("");
      // 清除所有 iframe 中的高亮
      clearAllFieldHighlights();
    } else {
      setSelectedField(fieldName);
      highlightElementInIframe(fieldName, activeIndex);
      syncSelectedFieldValueFromIframe(fieldName, activeIndex);
    }
  };

  // 更新价格字段（特殊处理，因为价格结构特殊）
  // 统一价格系统：根据整数位数自动切换 class，确保 DOM 结构统一
  // updatePriceFields 已移至 dataApplier.ts，直接使用导入的函数

  // 辅助函数：更新文档中的字段值
  const updateFieldInDocument = useCallback((iframeDoc: Document, fieldName: string, newValue: string, isPreview: boolean = false, isSelectedIframe: boolean = false) => {
    // 特殊处理价格字段
    if (fieldName === 'sec_price_int' || fieldName === 'sec_price_decimal') {
      const priceEl = iframeDoc.querySelector('[data-field-int]') as HTMLElement;
      if (priceEl) {
        // 预览模式下且是选中的 iframe 才高亮
        if (isPreview && isSelectedIframe) {
          if (!priceEl.classList.contains("field-highlight")) {
            const previousHighlighted = iframeDoc.querySelector(".field-highlight");
            if (previousHighlighted) {
              previousHighlighted.classList.remove("field-highlight");
            }
            priceEl.classList.add("field-highlight");
          }
        } else if (isPreview && !isSelectedIframe) {
          // 如果不是选中的 iframe，清除高亮
          priceEl.classList.remove("field-highlight");
        }

        // 获取当前价格值（用于确定需要更新的值）
        const priceInt2 = priceEl.querySelector('.price-int-2') as HTMLElement;
        const priceInt3 = priceEl.querySelector('.price-int-3') as HTMLElement;
        const priceDecimal2 = priceEl.querySelector('.price-decimal-2') as HTMLElement;
        const priceDecimal3 = priceEl.querySelector('.price-decimal-3') as HTMLElement;

        let currentIntValue = (priceInt2?.textContent || priceInt3?.textContent || '').trim();
        let currentDecValue = (priceDecimal2?.textContent || priceDecimal3?.textContent || '').trim();
        
        // 如果没有找到新结构，尝试从旧结构读取
        if (!currentIntValue && !currentDecValue) {
          const signNode = priceEl.querySelector('.sign');
          const decimalNode = priceEl.querySelector('.decimal');
          currentIntValue = signNode?.nextSibling?.nodeValue?.trim() || '';
          currentDecValue = decimalNode?.textContent?.trim() || '';
        }

        // 确定要更新的值
        let finalIntValue = fieldName === 'sec_price_int' ? newValue : currentIntValue;
        let finalDecValue = fieldName === 'sec_price_decimal' 
          ? (newValue.startsWith('.') ? newValue : '.' + newValue)
          : currentDecValue;

        // 使用 updatePriceFields 统一处理（会自动切换 class 和创建缺失的 span）
        updatePriceFields(iframeDoc, finalIntValue, finalDecValue.replace(/^\./, ''));
      }
    } else {
      // 普通字段处理
      const element = iframeDoc.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
      if (element) {
        // 预览模式下且是选中的 iframe 才高亮
        if (isPreview && isSelectedIframe) {
          if (!element.classList.contains("field-highlight")) {
            // 清除其他高亮
            const previousHighlighted = iframeDoc.querySelector(".field-highlight");
            if (previousHighlighted) {
              previousHighlighted.classList.remove("field-highlight");
            }
            element.classList.add("field-highlight");
          }
        } else if (isPreview && !isSelectedIframe) {
          // 如果不是选中的 iframe，清除高亮
          element.classList.remove("field-highlight");
        }

        if (element.tagName === "IMG") {
          // 如果是图片，更新 src
          (element as HTMLImageElement).src = newValue;
        } else {
          // 如果是文本元素，更新内容
          element.textContent = newValue;
        }
      }
    }
  }, [updatePriceFields]);

  // 更新 iframe 中字段的值（根据 activeIndex 更新对应的 iframe）
  const updateFieldValue = useCallback((fieldName: string, newValue: string) => {
    // 预览模式下不允许编辑
    if (isPreviewMode) {
      return;
    }
    
    const activeIndex = getActiveIndex();
    let targetIframe: HTMLIFrameElement | null = null;
    let targetIframeOffset: number | null = null;
    
    // 多图模式：找到对应的 iframe
    if (isPreviewMode) {
      const offset = activeIndex - currentIndex;
      if (offset >= 0 && offset < 4) {
        targetIframe = multiIframeRefs.current[offset];
        targetIframeOffset = offset;
      }
    }
    
    // 单图模式或找不到对应 iframe：使用预览 iframe
    if (!targetIframe) {
      targetIframe = previewIframeRef.current;
    }
    
    // 先清除所有 iframe 中的高亮
    clearAllFieldHighlights();
    
    // 更新目标 iframe
    if (targetIframe) {
      try {
        const iframeDoc = targetIframe.contentDocument || targetIframe.contentWindow?.document;
        if (iframeDoc) {
          // 判断是否是选中的 iframe（多图模式下需要检查 offset）
          const isSelectedIframe = isPreviewMode 
            ? (targetIframeOffset !== null && selectedBannerIndex !== null && activeIndex === selectedBannerIndex)
            : true;
          updateFieldInDocument(iframeDoc, fieldName, newValue, true, isSelectedIframe);
          
          // 更新显示值（从目标 iframe 读取）
          if (fieldName === 'sec_price_int' || fieldName === 'sec_price_decimal') {
            const priceEl = iframeDoc.querySelector('[data-field-int]') as HTMLElement;
            if (priceEl) {
              const priceInt2 = priceEl.querySelector('.price-int-2') as HTMLElement;
              const priceInt3 = priceEl.querySelector('.price-int-3') as HTMLElement;
              const priceDecimal2 = priceEl.querySelector('.price-decimal-2') as HTMLElement;
              const priceDecimal3 = priceEl.querySelector('.price-decimal-3') as HTMLElement;
              const intValue = (priceInt2?.textContent || priceInt3?.textContent || '').trim();
              const decValue = (priceDecimal2?.textContent || priceDecimal3?.textContent || '').trim();
              setSelectedFieldValue(fieldName === 'sec_price_int' ? intValue : decValue);
            }
          } else {
            const element = iframeDoc.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
            if (element) {
              if (element.tagName === "IMG") {
                // 对于图片字段，直接使用新值，避免从 iframe 读取时图片还未加载完成
                setSelectedFieldValue(newValue);
              } else {
                setSelectedFieldValue(element.textContent?.trim() || "");
              }
            } else {
              // 如果元素不存在，也直接使用新值
              setSelectedFieldValue(newValue);
            }
          }
        }
      } catch (e) {
        console.warn("无法更新预览 iframe 内容:", e);
      }
    }

    // 更新导出 iframe（用于批量生成）
    const exportIframe = iframeRef.current;
    if (exportIframe) {
      try {
        const iframeDoc = exportIframe.contentDocument || exportIframe.contentWindow?.document;
        if (iframeDoc) {
          updateFieldInDocument(iframeDoc, fieldName, newValue, false, false);
        }
      } catch (e) {
        console.warn("无法更新导出 iframe 内容:", e);
      }
    }
      
    // 保存编辑的值到 editedValues（使用 activeIndex）
    setEditedValues(prev => ({
      ...prev,
      [activeIndex]: {
        ...prev[activeIndex],
        [fieldName]: newValue
      }
    }));
    
    // 注意：不再在每次输入时提交快照，改为在 onBlur 或 Enter 时提交
  }, [isPreviewMode, currentIndex, getActiveIndex, updateFieldInDocument, selectedBannerIndex, clearAllFieldHighlights]);

  // 调整图片位置和缩放
  const adjustImageTransform = useCallback((fieldName: string, direction: 'up' | 'down' | 'left' | 'right' | 'zoomIn' | 'zoomOut') => {
    // 预览模式下不允许编辑
    if (isPreviewMode) {
      return;
    }
    
    const activeIndex = getActiveIndex();
    let targetIframe: HTMLIFrameElement | null = null;
    
    // 多图模式：找到对应的 iframe
    if (isPreviewMode) {
      const offset = activeIndex - currentIndex;
      if (offset >= 0 && offset < 4) {
        targetIframe = multiIframeRefs.current[offset];
      }
    }
    
    // 单图模式或找不到对应 iframe：使用预览 iframe
    if (!targetIframe) {
      targetIframe = previewIframeRef.current;
    }
    
    if (!targetIframe) return;
    
    try {
      const iframeDoc = targetIframe.contentDocument || targetIframe.contentWindow?.document;
      if (!iframeDoc) return;
      
      // 找到所有具有相同 data-field 的图片（支持 x2、x3 等多图片情况）
      const elements = Array.from(iframeDoc.querySelectorAll(`[data-field="${fieldName}"]`)) as HTMLImageElement[];
      const imgs = elements.filter(el => el.tagName === 'IMG');
      
      if (imgs.length === 0) return;
      
      // 获取图片的父容器尺寸（用于计算百分比，使用第一个图片）
      const firstImg = imgs[0];
      const parent = firstImg.parentElement;
      const parentWidth = parent?.offsetWidth || firstImg.offsetWidth || 750;
      const parentHeight = parent?.offsetHeight || firstImg.offsetHeight || 1125;
      
      // 计算移动步长（5%）
      const stepX = parentWidth * 0.05;
      const stepY = parentHeight * 0.05;
      const scaleStep = 0.05;
      
      // 对每个图片单独应用变化，保持各自的 transform
      imgs.forEach((img, imgIndex) => {
        // 获取当前图片的 transform 值
        let currentTransform = img.style.transform || '';
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
        
        // 如果没有 transform，尝试从 editedValues 读取（使用索引）
        if (translateX === 0 && translateY === 0 && scale === 1) {
          const transformKey = `${fieldName}_transform_${imgIndex}`;
          const savedTransform = editedValues[activeIndex]?.[transformKey];
          if (savedTransform) {
            const translateMatch = savedTransform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
            if (translateMatch) {
              translateX = parseFloat(translateMatch[1]) || 0;
              translateY = parseFloat(translateMatch[2]) || 0;
            }
            const scaleMatch = savedTransform.match(/scale\(([\d.]+)\)/);
            if (scaleMatch) {
              scale = parseFloat(scaleMatch[1]) || 1;
            }
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
        
        // 应用新的 transform 到当前图片
        img.style.transform = newTransform;
        img.style.transformOrigin = 'center center';
        
        // 同时更新导出 iframe 中对应索引的图片
        if (iframeRef.current) {
          try {
            const exportDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
            if (exportDoc) {
              const exportElements = Array.from(exportDoc.querySelectorAll(`[data-field="${fieldName}"]`)) as HTMLImageElement[];
              const exportImgs = exportElements.filter(el => el.tagName === 'IMG');
              if (exportImgs[imgIndex]) {
                exportImgs[imgIndex].style.transform = newTransform;
                exportImgs[imgIndex].style.transformOrigin = 'center center';
              }
            }
          } catch (e) {
            console.warn('无法更新导出 iframe:', e);
          }
        }
        
        // 保存变换值到 editedValues（使用索引区分不同的图片）
        const transformKey = `${fieldName}_transform_${imgIndex}`;
        setEditedValues(prev => ({
          ...prev,
          [activeIndex]: {
            ...prev[activeIndex],
            [transformKey]: newTransform,
          }
        }));
      });
      
      // 按钮操作结束后提交快照
      if (undoReadyRef.current) {
        setTimeout(() => {
          commitSnapshot('button-action-end');
        }, 50);
      }
    } catch (e) {
      console.warn('调整图片变换失败:', e);
    }
  }, [isPreviewMode, currentIndex, getActiveIndex, multiIframeRefs, previewIframeRef, iframeRef, commitSnapshot]);

  // 为选中的图片字段添加拖拽和缩放功能
  useEffect(() => {
    // 预览模式下不设置拖拽和缩放功能
    if (isPreviewMode) return;
    
    if (!selectedField) return;
    
    const isImageField = selectedField.includes("_src") || selectedField.includes("image") || selectedField.includes("img");
    if (!isImageField) return;

    // 获取所有需要设置事件监听器的 iframe
    const iframesToSetup: HTMLIFrameElement[] = [];
    
    // 编辑模式：只设置预览 iframe
    if (previewIframeRef.current) {
      iframesToSetup.push(previewIframeRef.current);
    }
    
    if (iframesToSetup.length === 0) return;

    const setupDragAndZoom = (targetIframe: HTMLIFrameElement, iframeIndex: number) => {
      try {
        const iframeDoc = targetIframe?.contentDocument || targetIframe?.contentWindow?.document;
        if (!iframeDoc) return () => {}; // 返回空清理函数
        
        // 计算当前 iframe 对应的数据索引
        // 使用 ref 获取最新的 currentIndex，避免闭包捕获过时值
        const latestCurrentIndex = currentIndexRef.current;
        const dataIndex = latestCurrentIndex;

        // 找到所有具有相同 data-field 的图片
        const imgs = Array.from(iframeDoc.querySelectorAll(`[data-field="${selectedField}"]`)) as HTMLImageElement[];
        const imageElements = imgs.filter(el => el.tagName === 'IMG');
        
        if (imageElements.length === 0) return () => {}; // 返回空清理函数

        let isDragging = false;
        let draggedImg: HTMLImageElement | null = null;
        let draggedImgIndex = -1;
        let startX = 0;
        let startY = 0;
        let startTranslateX = 0;
        let startTranslateY = 0;
        let currentScale = 1;
        let wheelDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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

        // 获取图片在数组中的索引（通过 src 或位置）
        const getImageIndex = (img: HTMLImageElement): number => {
          return imageElements.indexOf(img);
        };

        const applyTransform = (img: HTMLImageElement, tx: number, ty: number, s: number) => {
          const transform = `translate(${tx}px, ${ty}px) scale(${s})`;
          img.style.transform = transform;
          img.style.transformOrigin = 'center center';
          img.style.cursor = 'move';

          // 注意：不在拖拽时更新导出 iframe
          // 导出 iframe 只在批量生成时使用，每次生成时会重新应用数据，包括 transform
          // 在拖拽时更新导出 iframe 可能导致其他记录的数据被错误修改

          // 保存到 editedValues（使用索引区分不同的图片）
          const imgIndex = getImageIndex(img);
          const transformKey = `${selectedField}_transform_${imgIndex}`;
          setEditedValues(prev => ({
            ...prev,
            [dataIndex]: {
              ...prev[dataIndex],
              [transformKey]: transform,
            }
          }));
        };

        const handleMouseDown = (e: MouseEvent) => {
          if (e.button !== 0) return; // 只处理左键
          const target = e.target as HTMLElement;
          if (!target || target.tagName !== 'IMG' || !target.hasAttribute(`data-field`) || target.getAttribute('data-field') !== selectedField) {
            return;
          }

          isDragging = true;
          draggedImg = target as HTMLImageElement;
          draggedImgIndex = getImageIndex(draggedImg);
          startX = e.clientX;
          startY = e.clientY;

          const currentTransform = draggedImg.style.transform || '';
          const parsed = parseTransform(currentTransform);
          startTranslateX = parsed.tx;
          startTranslateY = parsed.ty;
          currentScale = parsed.s;

          e.preventDefault();
          e.stopPropagation();
        };

        const handleMouseMove = (e: MouseEvent) => {
          if (!isDragging || !draggedImg) return;

          const deltaX = e.clientX - startX;
          const deltaY = e.clientY - startY;

          // 计算新的位置（需要考虑 iframe 的缩放）
          const iframeRect = targetIframe?.getBoundingClientRect();
          const scaleX = iframeRect ? (iframeRect.width / (iframeSize?.width || 750)) : 1;
          const scaleY = iframeRect ? (iframeRect.height / (iframeSize?.height || 1125)) : 1;

          const newTx = startTranslateX + (deltaX / scaleX);
          const newTy = startTranslateY + (deltaY / scaleY);

          // 只对当前拖拽的图片应用 transform
          applyTransform(draggedImg, newTx, newTy, currentScale);
          e.preventDefault();
        };

        const handleMouseUp = () => {
          if (isDragging) {
            // 拖拽结束时提交快照（只在 undo ready 时记录）
            if (undoReadyRef.current) {
              setTimeout(() => {
                commitSnapshot('drag-end');
              }, 50);
            }
          }
          isDragging = false;
          draggedImg = null;
          draggedImgIndex = -1;
        };

        const handleWheel = (e: WheelEvent) => {
          const target = e.target as HTMLElement;
          if (!target || target.tagName !== 'IMG' || !target.hasAttribute(`data-field`) || target.getAttribute('data-field') !== selectedField) {
            return;
          }

          e.preventDefault();
          e.stopPropagation();

          const img = target as HTMLImageElement;
          const currentTransform = img.style.transform || '';
          const parsed = parseTransform(currentTransform);
          
          const scaleStep = 0.05;
          const delta = e.deltaY > 0 ? -scaleStep : scaleStep;
          const newScale = Math.max(0.1, Math.min(3, parsed.s + delta));

          // 只对当前滚轮的图片应用缩放
          applyTransform(img, parsed.tx, parsed.ty, newScale);

          // 清除之前的定时器
          if (wheelDebounceTimer) {
            clearTimeout(wheelDebounceTimer);
          }

          // 设置新的定时器，在滚轮停止300ms后提交快照（只在 undo ready 时记录）
          wheelDebounceTimer = setTimeout(() => {
            if (undoReadyRef.current) {
              commitSnapshot('wheel-zoom-end');
            }
            wheelDebounceTimer = null;
          }, 300);
        };

        // 添加事件监听器
        const mouseEnterHandlers: Map<HTMLImageElement, (e: MouseEvent) => void> = new Map();
        const mouseLeaveHandlers: Map<HTMLImageElement, (e: MouseEvent) => void> = new Map();
        
        imageElements.forEach(img => {
          img.addEventListener('mousedown', handleMouseDown);
          img.style.userSelect = 'none';
          
          // 鼠标移动到图片上时显示 move 光标
          const enterHandler = (e: MouseEvent) => {
            (e.target as HTMLElement).style.cursor = 'move';
          };
          img.addEventListener('mouseenter', enterHandler);
          mouseEnterHandlers.set(img, enterHandler);
          
          // 鼠标离开图片时恢复默认光标
          const leaveHandler = (e: MouseEvent) => {
            if (!isDragging) {
              (e.target as HTMLElement).style.cursor = '';
            }
          };
          img.addEventListener('mouseleave', leaveHandler);
          mouseLeaveHandlers.set(img, leaveHandler);
          
          // 滚轮缩放只在图片上生效
          img.addEventListener('wheel', handleWheel, { passive: false });
        });

        // 全局鼠标移动和抬起事件，用于拖拽
        iframeDoc.addEventListener('mousemove', handleMouseMove);
        iframeDoc.addEventListener('mouseup', handleMouseUp);

        // 清理函数
        return () => {
          // 清除滚轮防抖定时器
          if (wheelDebounceTimer) {
            clearTimeout(wheelDebounceTimer);
            wheelDebounceTimer = null;
          }

          imageElements.forEach(img => {
            img.removeEventListener('mousedown', handleMouseDown);
            img.style.cursor = '';
            img.style.userSelect = '';
            
            // 移除鼠标进入和离开事件
            const enterHandler = mouseEnterHandlers.get(img);
            const leaveHandler = mouseLeaveHandlers.get(img);
            if (enterHandler) {
              img.removeEventListener('mouseenter', enterHandler);
            }
            if (leaveHandler) {
              img.removeEventListener('mouseleave', leaveHandler);
            }
            
            img.removeEventListener('wheel', handleWheel);
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

    // 为所有 iframe 设置事件监听器
    const cleanupFunctions: (() => void)[] = [];
    
    iframesToSetup.forEach((iframe, idx) => {
      const timer = setTimeout(() => {
        const cleanup = setupDragAndZoom(iframe, idx);
        cleanupFunctions.push(cleanup);
      }, 100);
      cleanupFunctions.push(() => clearTimeout(timer));
    });

    // 清理函数
    return () => {
      cleanupFunctions.forEach(cleanup => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
      });
    };
  }, [selectedField, currentIndex, isPreviewMode, getActiveIndex, multiIframeRefs, previewIframeRef, iframeRef, iframeSize, setEditedValues, commitSnapshot]);

  // 为选中的文字字段添加宽度调整功能
  useEffect(() => {
    // 预览模式下不设置宽度调整功能
    if (isPreviewMode) return;
    
    if (!selectedField) return;
    
    // 只处理非图片字段（文字字段）
    const isImageField = selectedField.includes("_src") || selectedField.includes("image") || selectedField.includes("img");
    if (isImageField) return;
    
    // 跳过价格字段（价格字段有特殊结构）
    if (selectedField === 'sec_price_int' || selectedField === 'sec_price_decimal') return;

    // 获取所有需要设置事件监听器的 iframe
    const iframesToSetup: HTMLIFrameElement[] = [];
    
    // 编辑模式：只设置预览 iframe
    if (previewIframeRef.current) {
      iframesToSetup.push(previewIframeRef.current);
    }
    
    if (iframesToSetup.length === 0) return;

    const setupWidthResize = (targetIframe: HTMLIFrameElement, iframeIndex: number) => {
      try {
        const iframeDoc = targetIframe?.contentDocument || targetIframe?.contentWindow?.document;
        if (!iframeDoc) return () => {}; // 返回空清理函数
        
        // 计算当前 iframe 对应的数据索引
        const latestCurrentIndex = currentIndexRef.current;
        const dataIndex = latestCurrentIndex;

        // 找到所有具有相同 data-field 的元素
        const elements = Array.from(iframeDoc.querySelectorAll(`[data-field="${selectedField}"]`)) as HTMLElement[];
        const textElements = elements.filter(el => el.tagName !== 'IMG');
        
        if (textElements.length === 0) return () => {}; // 返回空清理函数

        let isResizing = false;
        let resizedElement: HTMLElement | null = null;
        let startX = 0;
        let startWidth = 0;

        // 创建调整手柄
        const createResizeHandle = (element: HTMLElement) => {
          // 移除已存在的手柄
          const existingHandle = iframeDoc.querySelector(`.width-resize-handle[data-field="${selectedField}"]`);
          if (existingHandle) {
            existingHandle.remove();
          }

          const handle = iframeDoc.createElement('div');
          handle.className = 'width-resize-handle';
          handle.setAttribute('data-field', selectedField);
          handle.style.cssText = `
            position: absolute;
            right: -6px;
            top: 0;
            bottom: 0;
            width: 12px;
            cursor: ew-resize;
            z-index: 10000;
            background-color: rgba(102, 126, 234, 0.3);
            border-right: 3px solid #667eea;
            pointer-events: auto;
          `;
          
          // 将手柄添加到元素中
          const currentPosition = iframeDoc.defaultView?.getComputedStyle(element).position || '';
          if (currentPosition === 'static') {
            element.style.position = 'relative';
          }
          element.appendChild(handle);
          
          return handle;
        };

        // 移除调整手柄
        const removeResizeHandle = () => {
          const handle = iframeDoc.querySelector(`.width-resize-handle[data-field="${selectedField}"]`);
          if (handle) {
            handle.remove();
          }
        };

        // 应用宽度
        const applyWidth = (element: HTMLElement, width: number) => {
          // 确保宽度是正数
          const newWidth = Math.max(50, width); // 最小宽度 50px
          element.style.width = `${newWidth}px`;
          element.style.maxWidth = `${newWidth}px`;
          element.style.overflow = 'hidden';
          element.style.whiteSpace = 'nowrap';
          element.style.textOverflow = 'ellipsis';

          // 保存到 editedValues
          const widthKey = `${selectedField}_width`;
          setEditedValues(prev => ({
            ...prev,
            [dataIndex]: {
              ...prev[dataIndex],
              [widthKey]: `${newWidth}px`,
            }
          }));
        };

        const handleMouseDown = (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          if (!target || !target.classList.contains('width-resize-handle')) {
            return;
          }

          isResizing = true;
          resizedElement = target.parentElement as HTMLElement;
          if (!resizedElement) return;

          startX = e.clientX;
          const computedStyle = iframeDoc.defaultView?.getComputedStyle(resizedElement);
          startWidth = computedStyle ? parseFloat(computedStyle.width) || resizedElement.offsetWidth : resizedElement.offsetWidth;

          e.preventDefault();
          e.stopPropagation();
        };

        const handleMouseMove = (e: MouseEvent) => {
          if (!isResizing || !resizedElement) return;

          const deltaX = e.clientX - startX;

          // 计算新的宽度（需要考虑 iframe 的缩放）
          const iframeRect = targetIframe?.getBoundingClientRect();
          const scaleX = iframeRect ? (iframeRect.width / (iframeSize?.width || 750)) : 1;

          const newWidth = startWidth + (deltaX / scaleX);
          applyWidth(resizedElement, newWidth);

          e.preventDefault();
        };

        const handleMouseUp = () => {
          if (isResizing) {
            // 调整结束时提交快照（只在 undo ready 时记录）
            if (undoReadyRef.current) {
              setTimeout(() => {
                commitSnapshot('width-resize-end');
              }, 50);
            }
          }
          isResizing = false;
          resizedElement = null;
        };

        // 为所有文字元素添加调整手柄
        textElements.forEach(element => {
          // 检查是否已经有保存的宽度（使用 ref 避免依赖问题）
          const widthKey = `${selectedField}_width`;
          const currentEditedValues = editedValuesRef.current;
          const savedWidth = currentEditedValues[dataIndex]?.[widthKey];
          if (savedWidth) {
            const widthValue = parseFloat(savedWidth);
            if (!isNaN(widthValue)) {
              applyWidth(element, widthValue);
            }
          }

          // 创建调整手柄
          const handle = createResizeHandle(element);
          handle.addEventListener('mousedown', handleMouseDown);
        });

        // 全局鼠标移动和抬起事件，用于调整宽度
        iframeDoc.addEventListener('mousemove', handleMouseMove);
        iframeDoc.addEventListener('mouseup', handleMouseUp);

        // 清理函数
        return () => {
          removeResizeHandle();
          iframeDoc.removeEventListener('mousemove', handleMouseMove);
          iframeDoc.removeEventListener('mouseup', handleMouseUp);
        };
      } catch (e) {
        console.warn('设置宽度调整失败:', e);
        return () => {};
      }
    };

    // 为所有 iframe 设置事件监听器
    const cleanupFunctions: (() => void)[] = [];
    
    iframesToSetup.forEach((iframe, idx) => {
      const timer = setTimeout(() => {
        const cleanup = setupWidthResize(iframe, idx);
        if (cleanup) {
          cleanupFunctions.push(cleanup);
        }
      }, 100);
      
      return () => {
        clearTimeout(timer);
        cleanupFunctions.forEach(cleanup => cleanup());
      };
    });

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, [isPreviewMode, selectedField, currentIndex, getActiveIndex, previewIframeRef, iframeSize, commitSnapshot, setEditedValues]);

  // 清除 CSS
  const handleClearCss = () => {
    setCssContent("");
    setCssFileName("");
    setSuccess("已清除 CSS 样式");
    // 注意：这里不清除整个持久化数据，只清除 CSS
  };

  // JSON 文件上传处理
  const handleJsonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    try {
      const parsed = await parseJsonFile(file);
      
      // 如果已有模板，将模板的 data-field 值填充到第一个 JSON 数据项
      let finalJsonData = parsed;
      if (htmlContent) {
        const { extractTemplateDataFields, populateTemplateDataToJson } = await import('./templateExtractor');
        const templateData = extractTemplateDataFields(htmlContent);
        finalJsonData = populateTemplateDataToJson(parsed, templateData);
      }
      
      setJsonData(finalJsonData);
      setCurrentIndex(0);
      setSelectedBannerIndex(isPreviewMode ? 0 : null);
      setSuccess(`成功加载 ${finalJsonData.length} 条数据`);
      // 应用第一条数据到预览
      if (finalJsonData.length > 0) {
        applyJsonDataToIframe(finalJsonData[0], 0);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "JSON 解析失败";
      setError(message);
      setJsonData([]);
    }

    if (jsonInputRef.current) {
      jsonInputRef.current.value = "";
    }
  };

  // applyJsonDataToMultiIframe 已移至 dataApplier.ts，使用导入的函数
  const applyJsonDataToMultiIframeWrapper = useCallback((iframe: HTMLIFrameElement, data: BannerData, index: number) => {
    if (!iframe || !htmlContent) return;
    applyJsonDataToMultiIframeUtil(iframe, data, index, editedValues);
  }, [htmlContent, editedValues]);

  // applyJsonDataToIframe 已移至 dataApplier.ts，使用导入的函数
  // 同时应用到预览和导出 iframe
  const applyJsonDataToIframe = useCallback((data: BannerData, index: number) => {
    if (!htmlContent) return;
    
    // 使用 ref 获取最新的 editedValues，避免依赖 editedValues 导致 Effect 1 频繁触发
    const currentEditedValues = editedValuesRef.current;
    
    // 应用到导出 iframe（用于批量生成）
    if (iframeRef.current) {
      applyJsonDataToIframeUtil(iframeRef.current, data, index, currentEditedValues);
    }
    
    // 应用到预览 iframe（用于单图预览）
    if (previewIframeRef.current) {
      applyJsonDataToIframeUtil(previewIframeRef.current, data, index, currentEditedValues);
    }
  }, [htmlContent]);

  // 多图模式：更新4个iframe的数据
  useEffect(() => {
    if (isPreviewMode && jsonData.length > 0 && htmlContent) {
      // 如果还没有选中任何 banner，默认选中左上角（currentIndex）
      if (selectedBannerIndex === null) {
        setSelectedBannerIndex(currentIndex);
      }
      
      const timer = setTimeout(() => {
        [0, 1, 2, 3].forEach((idx) => {
          const dataIndex = currentIndex + idx;
          if (dataIndex < jsonData.length && multiIframeRefs.current[idx]) {
            const iframe = multiIframeRefs.current[idx];
            if (iframe) {
              applyJsonDataToMultiIframeWrapper(iframe, jsonData[dataIndex], dataIndex);
            }
          }
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isPreviewMode, jsonData, currentIndex, htmlContent, applyJsonDataToMultiIframeWrapper, selectedBannerIndex]);

  // Effect 1: 数据应用 (Data Application) - 仅负责在数据变化时应用数据到 iframe
  useEffect(() => {
    if (!isPreviewMode && jsonData.length > 0 && currentIndex >= 0 && currentIndex < jsonData.length) {
      // 模板加载阶段（undoReadyRef.current === false）不执行任何操作，等待 iframe 加载完成
      if (!undoReadyRef.current) {
        return;
      }
      
      // 恢复期间不应用数据，避免覆盖恢复的快照状态
      if (isRestoringRef.current) {
        console.log('[BannerBatch] Effect 1: 恢复期间，跳过数据应用');
        return;
      }
      
      const timer = setTimeout(() => {
        // 再次检查恢复状态（可能在延迟期间开始恢复）
        if (isRestoringRef.current) {
          console.log('[BannerBatch] Effect 1: 延迟期间检测到恢复，跳过数据应用');
          return;
        }
        // 如果是第一个索引（索引0），且是空对象，且没有编辑的值，重置 iframe 到原始 HTML
        const isEmptyTemplate = currentIndex === 0 && Object.keys(jsonData[currentIndex]).length === 0;
        // 使用 ref 获取最新的 editedValues，避免依赖 editedValues 导致 Effect 1 频繁触发
        const currentEditedValues = editedValuesRef.current;
        const hasEdits = currentEditedValues[0] && Object.keys(currentEditedValues[0]).length > 0;
        
        if (isEmptyTemplate && !hasEdits) {
          // 空模板且没有编辑，重置到原始 HTML
          if (htmlContent) {
            const srcDoc = buildSrcDoc(htmlContent, cssContent);
            
            // 重置预览 iframe
            if (previewIframeRef.current) {
              previewIframeRef.current.srcdoc = srcDoc;
            }
            
            // 重置导出 iframe
            if (iframeRef.current) {
              iframeRef.current.srcdoc = srcDoc;
            }
          }
        } else {
          // 对于其他情况（包括有编辑值的空模板），正常应用 JSON 数据（会自动合并 editedValues）
          applyJsonDataToIframe(jsonData[currentIndex], currentIndex);
        }
        
        // 切换产品后，如果该产品还没有初始快照，提交一个初始快照
        const activeIndex = getActiveIndex();
        if (!initialSnapshotCommittedRef.current[activeIndex] && undoReadyRef.current && iframeSize) {
          // 延迟一点确保数据已应用
          setTimeout(() => {
            if (!initialSnapshotCommittedRef.current[activeIndex] && undoReadyRef.current && iframeSize) {
              const activeIframe = previewIframeRef.current || iframeRef.current;
              if (activeIframe) {
                const iframeDoc = activeIframe.contentDocument || activeIframe.contentWindow?.document;
                if (iframeDoc && iframeDoc.querySelectorAll('[data-field]').length > 0) {
                  initialSnapshotCommittedRef.current[activeIndex] = true;
                  commitSnapshot('product-switch-initial');
                  console.log('[BannerBatch] 切换产品后提交初始快照，产品索引:', activeIndex);
                }
              }
            }
          }, 300);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [jsonData, currentIndex, applyJsonDataToIframe, htmlContent, cssContent, isPreviewMode, getActiveIndex, iframeSize, commitSnapshot]);

  // 自动保存数据到 localStorage（防抖，只保存关键信息）
  useEffect(() => {
    const timer = setTimeout(() => {
      // 只在有实际数据时才保存，但不保存大的内容
      if (htmlFileName || cssFileName || templateFields.length > 0 || currentIndex > 0) {
        saveBannerGenData({
          htmlFileName,
          cssFileName,
          templateFields,
          currentIndex,
          // 不保存大的内容，只保存文件名和索引
          // htmlContent, cssContent, jsonData, editedValues, linkedAssets 不保存
        });
      }
    }, 2000); // 防抖：2秒后保存，减少保存频率

    return () => clearTimeout(timer);
  }, [htmlFileName, cssFileName, templateFields, currentIndex]);

  // 切换到上一条
  const handlePrev = () => {
    const step = isPreviewMode ? 4 : 1;
    const activeIndex = getActiveIndex();
    
    if (currentIndex >= step) {
      // 保存当前编辑的值（如果有）
      if (selectedField && selectedFieldValue) {
        setEditedValues(prev => ({
          ...prev,
          [activeIndex]: {
            ...prev[activeIndex],
            [selectedField]: selectedFieldValue
          }
        }));
      }
      const newIndex = currentIndex - step;
      setCurrentIndex(newIndex);
      // 多图模式：默认选中左上角那张
      if (isPreviewMode) {
        setSelectedBannerIndex(newIndex);
      }
    } else if (currentIndex > 0) {
      // 如果不足4步，至少回到0
      if (selectedField && selectedFieldValue) {
        setEditedValues(prev => ({
          ...prev,
          [activeIndex]: {
            ...prev[activeIndex],
            [selectedField]: selectedFieldValue
          }
        }));
      }
      setCurrentIndex(0);
      // 多图模式：默认选中左上角那张
      if (isPreviewMode) {
        setSelectedBannerIndex(0);
      }
    }
  };

  // 切换到下一条
  const handleNext = () => {
    const step = isPreviewMode ? 4 : 1;
    const maxIndex = isPreviewMode 
      ? Math.max(0, jsonData.length - 4)  // 多图模式：确保最后4个都能显示
      : jsonData.length - 1;
    const activeIndex = getActiveIndex();
    
    if (currentIndex < maxIndex) {
      // 保存当前编辑的值（如果有）
      if (selectedField && selectedFieldValue) {
        setEditedValues(prev => ({
          ...prev,
          [activeIndex]: {
            ...prev[activeIndex],
            [selectedField]: selectedFieldValue
          }
        }));
      }
      const newIndex = Math.min(currentIndex + step, maxIndex);
      setCurrentIndex(newIndex);
      // 多图模式：默认选中左上角那张
      if (isPreviewMode) {
        setSelectedBannerIndex(newIndex);
      }
    }
  };

  // 等待 iframe 内部字体加载完成
  const waitForIframeFonts = async (doc: Document) => {
    const anyDoc: any = doc;
    if (anyDoc.fonts && anyDoc.fonts.ready) {
      try {
        await anyDoc.fonts.ready;
      } catch {
        // ignore
      }
    } else {
      // 老一点的浏览器兜底等一会儿
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  };

  // 清除导出 iframe 中的所有 highlight（用于批量生成）
  const clearExportIframeHighlights = () => {
    if (iframeRef.current) {
      try {
        const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
        if (iframeDoc) {
          const highlighted = iframeDoc.querySelectorAll(".field-highlight");
          highlighted.forEach((el) => el.classList.remove("field-highlight"));
        }
      } catch (e) {
        // 忽略错误
      }
    }
  };

  // 批量生成所有 Banner（打包成 ZIP）
  const handleGenerateAll = async () => {
    // 检查模板是否已加载：检查 htmlContent 和导出 iframe
    const hasTemplate = !!(htmlContent && iframeRef.current);
    
    if (!hasTemplate) {
      setError("请先上传模板");
      return;
    }

    setIsGenerating(true);
    setError("");
    setSuccess("");

    try {
      const zip = new JSZip();
      let successCount = 0;
      let bannerIndex = 0; // 用于文件名的序号，从1开始

      // 生成时间戳（年月日时分，如 202511300120）
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(now.getMinutes()).padStart(2, '0');
      const timestamp = `${year}${month}${day}${hour}${minute}`;

      // 现在所有数据都在 JSON 中，第一个 JSON 数据项就是模板数据
      // 直接循环所有 JSON 数据项，包括第一个（模板）
      for (let i = 0; i < jsonData.length; i++) {
        
        bannerIndex++; // 文件序号从1开始
        setCurrentIndex(i);
        
        // 第一个数据项是模板，使用特殊文件名
        const isTemplate = i === 0;
        
        // 每次循环前，重置 iframe 到原始 HTML 状态，确保每次导出都是干净的状态
        if (iframeRef.current && htmlContent) {
          iframeRef.current.srcdoc = buildSrcDoc(htmlContent, cssContent);
          // 等待 iframe 重置完成
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        
        // 应用数据（包括编辑的值）
        applyJsonDataToIframe(jsonData[i], i);
        
        // 等待数据应用和渲染
        await new Promise((resolve) => setTimeout(resolve, 300));

        const iframe = iframeRef.current;
        if (!iframe) continue;

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) continue;
        
        // 确保 transform 被应用（图片加载可能需要时间）
        const edits = editedValues[i] || {};
        Object.entries(edits).forEach(([fieldName, value]) => {
          if (fieldName.endsWith('_transform')) {
            const transformMatch = fieldName.match(/^(.+)_transform_(\d+)$/);
            if (transformMatch) {
              const originalFieldName = transformMatch[1];
              const imgIndex = parseInt(transformMatch[2], 10);
              const allElements = Array.from(iframeDoc.querySelectorAll(`[data-field="${originalFieldName}"]`)) as HTMLImageElement[];
              const imgElements = allElements.filter(el => el.tagName === "IMG");
              if (imgElements[imgIndex]) {
                imgElements[imgIndex].style.transform = String(value);
                imgElements[imgIndex].style.transformOrigin = 'center center';
              }
            } else {
              // 不带索引的 transform
              const originalFieldName = fieldName.replace(/_transform$/, '');
              const allElements = Array.from(iframeDoc.querySelectorAll(`[data-field="${originalFieldName}"]`)) as HTMLImageElement[];
              allElements.forEach(el => {
                if (el.tagName === "IMG") {
                  el.style.transform = String(value);
                  el.style.transformOrigin = 'center center';
                }
              });
            }
          }
        });
        
        // 再等待一下，确保 transform 已应用
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 等待字体加载完成
        await waitForIframeFonts(iframeDoc);

        // 清除所有 highlight，确保导出的图片没有高亮印记
        clearExportIframeHighlights();

        // 优先导出 .container 元素，如果没有则使用 body
        const container = iframeDoc.querySelector('.container') as HTMLElement;
        const exportElement = container || iframeDoc.body;
        if (!exportElement) continue;

        const row = jsonData[i];
        
        // 第一个数据项是模板，使用 template_时间戳.png
        // 其他数据项：如果有 id，使用 id_时间戳，否则使用 banner_序号_时间戳
        const fileName = isTemplate
          ? `template_${timestamp}.png`
          : (row.id 
              ? `${row.id}_${timestamp}.png`
              : `banner_${bannerIndex}_${timestamp}.png`);

        try {
          // 导出为 Data URL
          const dataUrl = await exportNodeToPngDataUrl(exportElement, { fontEmbedCSS: cssContent });
          
          // 将 Data URL 转换为 Blob
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          
          // 添加到 ZIP
          zip.file(fileName, blob);
          successCount++;
        } catch (err) {
          console.error(`导出第 ${i + 1} 条失败:`, err);
        }
      }

      if (successCount > 0) {
        // 生成 ZIP 文件
        const zipBlob = await zip.generateAsync({ type: "blob" });
        
        // 下载 ZIP 文件
        const a = document.createElement("a");
        a.href = URL.createObjectURL(zipBlob);
        a.download = `banners_${timestamp}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);

        // 计算实际生成的数量：第一个是模板，其余是数据项
        const templateCount = 1; // 第一个数据项是模板
        const dataCount = Math.max(0, jsonData.length - 1); // 其余是数据项
        setSuccess(`成功生成 ${successCount} 张 Banner（${templateCount} 个模板 + ${dataCount} 个数据项），已打包为 ZIP 文件`);

        // ✅ 生成完成后，把 currentIndex 复位，避免 2×2 预览全部指到最后一张
        setCurrentIndex(0);
      } else {
        setError("没有成功生成任何 Banner");
      }
    } catch (err) {
      setError("批量生成过程中出现错误，请查看控制台");
      console.error("批量生成错误:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // 打包并分享到服务器
  const handleShareZip = async () => {
    // 检查模板是否已加载
    const hasTemplate = !!(htmlContent && iframeRef.current);
    
    if (!hasTemplate) {
      setError("请先上传模板");
      return;
    }

    setIsSharing(true);
    setError("");
    setSuccess("");

    try {
      const zip = new JSZip();
      let successCount = 0;
      let bannerIndex = 0;

      // 生成时间戳
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(now.getMinutes()).padStart(2, '0');
      const timestamp = `${year}${month}${day}${hour}${minute}`;

      // 循环所有 JSON 数据项生成图片
      for (let i = 0; i < jsonData.length; i++) {
        bannerIndex++;
        setCurrentIndex(i);
        
        const isTemplate = i === 0;
        
        // 重置 iframe 到原始 HTML 状态
        if (iframeRef.current && htmlContent) {
          iframeRef.current.srcdoc = buildSrcDoc(htmlContent, cssContent);
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        
        // 应用数据
        applyJsonDataToIframe(jsonData[i], i);
        await new Promise((resolve) => setTimeout(resolve, 300));

        const iframe = iframeRef.current;
        if (!iframe) continue;

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) continue;
        
        // 应用编辑的值
        const edits = editedValues[i] || {};
        Object.entries(edits).forEach(([fieldName, value]) => {
          if (fieldName.endsWith('_transform')) {
            const transformMatch = fieldName.match(/^(.+)_transform_(\d+)$/);
            if (transformMatch) {
              const originalFieldName = transformMatch[1];
              const imgIndex = parseInt(transformMatch[2], 10);
              const allElements = Array.from(iframeDoc.querySelectorAll(`[data-field="${originalFieldName}"]`)) as HTMLImageElement[];
              const imgElements = allElements.filter(el => el.tagName === "IMG");
              if (imgElements[imgIndex]) {
                imgElements[imgIndex].style.transform = String(value);
                imgElements[imgIndex].style.transformOrigin = 'center center';
              }
            } else {
              const originalFieldName = fieldName.replace(/_transform$/, '');
              const allElements = Array.from(iframeDoc.querySelectorAll(`[data-field="${originalFieldName}"]`)) as HTMLImageElement[];
              allElements.forEach(el => {
                if (el.tagName === "IMG") {
                  el.style.transform = String(value);
                  el.style.transformOrigin = 'center center';
                }
              });
            }
          }
        });
        
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 等待字体加载完成
        await waitForIframeFonts(iframeDoc);

        // 清除所有 highlight
        clearExportIframeHighlights();

        // 优先导出 .container 元素，如果没有则使用 body
        const container = iframeDoc.querySelector('.container') as HTMLElement;
        const exportElement = container || iframeDoc.body;
        if (!exportElement) continue;

        const row = jsonData[i];
        
        const fileName = isTemplate
          ? `template_${timestamp}.png`
          : (row.id 
              ? `${row.id}_${timestamp}.png`
              : `banner_${bannerIndex}_${timestamp}.png`);

        try {
          // 导出为 Data URL
          const dataUrl = await exportNodeToPngDataUrl(exportElement, { fontEmbedCSS: cssContent });
          
          // 将 Data URL 转换为 Blob
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          
          // 添加到 ZIP
          zip.file(fileName, blob);
          successCount++;
        } catch (err) {
          console.error(`导出第 ${i + 1} 条失败:`, err);
        }
      }

      if (successCount > 0) {
        // 生成 ZIP 文件
        const zipBlob = await zip.generateAsync({ type: "blob" });
        
        // 上传到服务器并获取分享链接
        try {
          const result = await shareBannerZip(zipBlob);
          
          if (result.success && result.shareUrl) {
            setShareUrl(result.shareUrl);
            setShowShareDialog(true);
            setSuccess(`成功生成 ${successCount} 张 Banner 并已上传，分享链接已生成`);
            setCurrentIndex(0);
          } else {
            throw new Error(result.message || '分享失败');
          }
        } catch (uploadError: any) {
          console.error('上传失败:', uploadError);
          setError(`上传失败：${uploadError.message || '未知错误'}`);
        }
      } else {
        setError("没有成功生成任何 Banner");
      }
    } catch (err) {
      setError("打包分享过程中出现错误，请查看控制台");
      console.error("打包分享错误:", err);
    } finally {
      setIsSharing(false);
    }
  };

  // 复制分享链接到剪贴板
  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setSuccess("分享链接已复制到剪贴板");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      // 降级方案
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setSuccess("分享链接已复制到剪贴板");
        setTimeout(() => setSuccess(""), 3000);
      } catch (e) {
        setError("复制失败，请手动复制链接");
      }
      document.body.removeChild(textArea);
    }
  };

  // 调整 iframe 尺寸以匹配内容（使用预览 iframe）
  const adjustIframeSize = useCallback(() => {
    const iframe = previewIframeRef.current || iframeRef.current;
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

  // 当 HTML 或 CSS 内容变化时，调整 iframe 尺寸，并同步更新导出 iframe
  useEffect(() => {
    if (htmlContent) {
      // 模板内容变化时，重置 undo ready 状态（等待 iframe 重新加载）
      undoReadyRef.current = false;
      initialSnapshotCommittedRef.current = {};
      // 清除所有产品的 undo/redo 历史
      undoRedoHistoryRef.current.clear();
      
      // 同步更新导出 iframe 的内容
      if (iframeRef.current) {
        iframeRef.current.srcdoc = buildSrcDoc(htmlContent, cssContent);
      }
      
      // 重置尺寸，等待重新计算
      setIframeSize(null);
      // 清除选中字段（因为内容已变化）
      setSelectedField(null);
      setSelectedFieldValue("");
      // 延迟一下，确保 iframe 内容已渲染
      const timer1 = setTimeout(() => {
        adjustIframeSize();
      }, 100);
      const timer2 = setTimeout(() => {
        adjustIframeSize();
      }, 500);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    } else {
      // 模板被清除时，也重置 undo ready
      undoReadyRef.current = false;
      initialSnapshotCommittedRef.current = {};
      // 清除所有产品的 undo/redo 历史
      undoRedoHistoryRef.current.clear();
      setIframeSize(null);
      setSelectedField(null);
      setSelectedFieldValue("");
    }
  }, [htmlContent, cssContent, adjustIframeSize]);

  // 当切换产品（currentIndex 或 selectedBannerIndex 变化）时，检查并提交该产品的初始快照
  useEffect(() => {
    if (!htmlContent || !jsonData.length || !undoReadyRef.current || !iframeSize) return;
    if (isRestoringRef.current) return; // 恢复期间不提交
    
    const activeIndex = getActiveIndex();
    
    // 如果该产品还没有初始快照，提交一个
    if (!initialSnapshotCommittedRef.current[activeIndex]) {
      const checkAndCommit = () => {
        if (initialSnapshotCommittedRef.current[activeIndex]) return; // 已经提交过了
        if (isRestoringRef.current) return; // 恢复期间不提交
        
        const activeIframe = previewIframeRef.current || iframeRef.current;
        if (!activeIframe) {
          setTimeout(checkAndCommit, 100);
          return;
        }
        
        const iframeDoc = activeIframe.contentDocument || activeIframe.contentWindow?.document;
        if (!iframeDoc) {
          setTimeout(checkAndCommit, 100);
          return;
        }
        
        // 检查是否有 data-field 元素（确保模板内容已加载）
        const hasFields = iframeDoc.querySelectorAll('[data-field]').length > 0;
        if (!hasFields) {
          setTimeout(checkAndCommit, 100);
          return;
        }
        
        console.log('[BannerBatch] 切换产品后提交初始快照，产品索引:', activeIndex);
        initialSnapshotCommittedRef.current[activeIndex] = true;
        commitSnapshot('product-switch-initial');
      };
      
      // 延迟一点确保数据已应用
      setTimeout(checkAndCommit, 300);
    }
  }, [currentIndex, selectedBannerIndex, jsonData.length, htmlContent, iframeSize, getActiveIndex, commitSnapshot]);

  // Effect 2: 字段高亮 (Field Highlighting) - 仅负责在字段变化时高亮对应元素
  useEffect(() => {
    if (selectedField && htmlContent) {
      // 延迟一下，确保 iframe 内容已渲染
      const timer = setTimeout(() => {
        const activeIndex = getActiveIndex();
        highlightElementInIframe(selectedField, activeIndex);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [selectedField, htmlContent, highlightElementInIframe, getActiveIndex]);
  
  // Effect 3: 输入框值同步 (Input Sync) - 负责同步右侧输入框的值
  useEffect(() => {
    if (selectedField) {
      // 优先从 editedValues 获取已编辑的值
      const edits = editedValues[currentIndex];
      if (edits && edits[selectedField] !== undefined) {
        setSelectedFieldValue(edits[selectedField]);
      } else {
        // 如果没有编辑过，从 iframe DOM 读取当前值
        const activeIndex = getActiveIndex();
        syncSelectedFieldValueFromIframe(selectedField, activeIndex);
      }
    }
  }, [currentIndex, selectedField, editedValues, syncSelectedFieldValueFromIframe, getActiveIndex]);
  
  // 当 selectedBannerIndex 变化时，同步字段值（如果已选中字段）
  useEffect(() => {
    if (isPreviewMode && selectedBannerIndex !== null && selectedField) {
      syncSelectedFieldValueFromIframe(selectedField, selectedBannerIndex);
    }
  }, [isPreviewMode, selectedBannerIndex, selectedField, syncSelectedFieldValueFromIframe]);

  // 缓存单图模式的 srcDoc，避免切换字段时重新计算导致 iframe 刷新
  const singleViewSrcDoc = useMemo(() => {
    if (!htmlContent) return "";
    return buildSrcDoc(htmlContent, cssContent);
  }, [htmlContent, cssContent]);

  return (
    <div className="banner-batch-page">
      <div className="banner-batch-header">
        <h1>Banner Generator - 广告模板素材组装中心</h1>
      </div>

      <div className="banner-batch-content">
        {/* 左侧预览区 */}
        <div className="banner-preview-section">
          {!isPreviewMode ? (
            // 编辑模式：单图显示
            <div 
              className={`banner-preview-wrapper ${!htmlContent ? 'clickable-upload' : ''}`}
              onClick={handlePreviewAreaClick}
              title={htmlContent ? '' : '点击上传 ZIP 模板'}
            >
              {htmlContent ? (
                <iframe
                  ref={previewIframeRef}
                  title="banner-preview"
                  className="preview-iframe"
                  srcDoc={singleViewSrcDoc}
                  sandbox="allow-same-origin allow-scripts"
                  // 注意：同时使用 allow-scripts 和 allow-same-origin 会有安全警告，但这是必要的，因为我们需要在 iframe 中执行脚本并访问父窗口
                  style={
                    iframeSize
                      ? {
                          width: `${iframeSize.width}px`,
                          height: `${iframeSize.height}px`,
                          maxWidth: "100%",
                        }
                      : undefined
                  }
                  onLoad={(e) => {
                    adjustIframeSize();
                    // 模板和 iframe 完全 ready 后，允许 undo/redo
                    undoReadyRef.current = true;
                    // 延迟提交当前产品的初始快照，确保所有内容已加载
                    setTimeout(() => {
                      const activeIndex = getActiveIndex();
                      if (!initialSnapshotCommittedRef.current[activeIndex] && undoReadyRef.current && iframeSize) {
                        initialSnapshotCommittedRef.current[activeIndex] = true;
                        commitSnapshot('template-loaded-initial');
                      }
                    }, 500);
                    // 添加点击事件监听，点击 data-field 元素时自动选中字段
                    try {
                      const iframe = e.currentTarget;
                      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
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
                      // 忽略跨域错误
                      console.warn('无法添加 iframe 点击事件:', err);
                    }
                  }}
                />
              ) : (
                <div className="banner-placeholder">
                  <p>上传 ZIP 模板文件</p>
                  <p className="hint">包含 HTML、CSS、图片和Json替换文件的 ZIP 文件</p>
                </div>
              )}
            </div>
          ) : (
            // 预览模式：4个画布（2x2布局）
            <div className={`banner-preview-wrapper multi-mode`}>
              <div className="multi-preview-grid" ref={gridRef}>
                {[0, 1, 2, 3].map((idx) => {
                  const dataIndex = currentIndex + idx;
                  const hasData = jsonData.length > 0 && dataIndex < jsonData.length;
                  // 如果没有数据，不显示（而不是显示 currentIndex 的数据）
                  const displayIndex = hasData ? dataIndex : -1;
                  const activeIndex = getActiveIndex();
                  const isSelectedItem = isPreviewMode && selectedBannerIndex !== null && displayIndex === activeIndex && displayIndex >= 0;
                  
                  // 计算缩放比例
                  const templateWidth = iframeSize?.width ?? 750;
                  const templateHeight = iframeSize?.height ?? 1125;
                  const gap = 16;
                  const cellWidth = gridWidth > 0 ? (gridWidth - gap) / 2 : templateWidth;
                  const scale = Math.min(1, cellWidth / templateWidth);
                  
                  return (
                    <div 
                      key={idx} 
                      className={`multi-preview-item ${isSelectedItem ? 'selected' : ''}`}
                      onClick={() => {
                        if (hasData) {
                          handleSelectBanner(dataIndex);
                        }
                      }}
                      style={{ cursor: hasData ? 'pointer' : 'default' }}
                    >
                      <div className="multi-preview-label">
                        {hasData ? `图 ${idx + 1} (${displayIndex + 1}/${jsonData.length})` : `图 ${idx + 1}`}
                      </div>
                      {htmlContent ? (
                        hasData ? (
                          <div
                            className="multi-preview-iframe-wrapper"
                            style={{
                              width: templateWidth * scale,
                              height: templateHeight * scale,
                            }}
                          >
                            <iframe
                              ref={(el) => {
                                multiIframeRefs.current[idx] = el;
                              }}
                              title={`banner-preview-${idx}`}
                              className="preview-iframe multi-preview-iframe"
                              srcDoc={buildSrcDoc(htmlContent, cssContent)}
                              sandbox="allow-same-origin allow-scripts"
                  // 注意：同时使用 allow-scripts 和 allow-same-origin 会有安全警告，但这是必要的，因为我们需要在 iframe 中执行脚本并访问父窗口
                              style={{
                                width: templateWidth,
                                height: templateHeight,
                                transform: `scale(${scale})`,
                                transformOrigin: 'top left',
                              }}
                              onLoad={(e) => {
                                const iframe = e.currentTarget;
                                if (idx === 0) {
                                  adjustIframeSize();
                                  // 多图模式下，第一个 iframe 加载完成后允许 undo/redo
                                  undoReadyRef.current = true;
                                  // 延迟提交当前产品的初始快照，确保所有内容已加载
                                  setTimeout(() => {
                                    const activeIndex = getActiveIndex();
                                    if (!initialSnapshotCommittedRef.current[activeIndex] && undoReadyRef.current && iframeSize) {
                                      initialSnapshotCommittedRef.current[activeIndex] = true;
                                      commitSnapshot('template-loaded-initial');
                                    }
                                  }, 500);
                                }
                                
                                // 给 iframe 内部添加点击事件
                                try {
                                  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                                  if (iframeDoc) {
                                    const latestCurrentIndex = currentIndexRef.current;
                                    const latestJsonData = jsonDataRef.current;
                                    const latestDataIndex = latestCurrentIndex + idx;
                                    const latestHasData = latestJsonData.length > 0 && latestDataIndex < latestJsonData.length;
                                    
                                    const clickHandler = (event: MouseEvent) => {
                                      if (latestHasData) {
                                        // 使用统一的处理函数
                                        handleIframeElementClick(event, latestDataIndex);
                                      }
                                    };
                                    
                                    // 移除旧的监听器（如果存在）
                                    iframeDoc.removeEventListener('click', clickHandler);
                                    // 添加新的监听器
                                    iframeDoc.addEventListener('click', clickHandler);
                                  }
                                } catch (e) {
                                  // 忽略跨域错误
                                }
                                
                                // 延迟应用数据，确保iframe已完全加载
                                // 使用 ref 获取最新的 currentIndex 和 jsonData，避免闭包捕获过时值
                                setTimeout(() => {
                                  // 从 ref 获取最新值，而不是使用闭包捕获的值
                                  const latestCurrentIndex = currentIndexRef.current;
                                  const latestJsonData = jsonDataRef.current;
                                  
                                  const latestDataIndex = latestCurrentIndex + idx;
                                  const latestHasData = latestJsonData.length > 0 && latestDataIndex < latestJsonData.length;
                                  
                                  if (latestHasData && latestJsonData[latestDataIndex]) {
                                    applyJsonDataToMultiIframeWrapper(iframe, latestJsonData[latestDataIndex], latestDataIndex);
                                  }
                                }, 100);
                              }}
                            />
                          </div>
                        ) : (
                          <div className="banner-placeholder" style={{ minHeight: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <p style={{ color: 'rgba(0, 0, 0, 0.3)', fontSize: '12px' }}>无数据</p>
                          </div>
                        )
                      ) : (
                        <div className="banner-placeholder">
                          <p>上传 ZIP 模板文件</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 预览控制 */}
          {jsonData.length > 0 && (
            <div className="preview-controls-container">
              <div className="preview-controls">
                <button
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="btn btn-secondary"
                >
                  ← {isPreviewMode ? '上4条' : '上一条'}
                </button>
                <span className="preview-index">
                  {isPreviewMode ? (
                    <>
                      {currentIndex + 1}-{Math.min(currentIndex + 4, jsonData.length)} / {jsonData.length}
                      <span className="preview-mode-badge">预览</span>
                    </>
                  ) : (
                    <>
                      {currentIndex + 1} / {jsonData.length}
                      <span className="preview-mode-badge">编辑</span>
                    </>
                  )}
                </span>
                <button
                  onClick={handleNext}
                  disabled={isPreviewMode 
                    ? currentIndex >= Math.max(0, jsonData.length - 4)
                    : currentIndex === jsonData.length - 1
                  }
                  className="btn btn-secondary"
                >
                  {isPreviewMode ? '下4条' : '下一条'} →
                </button>
              </div>
            </div>
          )}

          {/* 模板选择区域 */}
          <div className="template-selector">
            <h3>选择模板</h3>
            
            <div className="template-selector-content">
              {/* 统一上传区域 */}
              <div className="template-upload-section template-upload-unified">
                <h3>上传文件</h3>
                <div className="template-upload-row">
                  <div className="template-upload-left-area">
                    <label className="template-upload-label">
                      <input
                        ref={zipInputRef}
                        type="file"
                        accept=".zip,.xlsx,.xls"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          if (!file) return;
                          
                          // 根据文件类型调用不同的处理函数
                          const fileName = file.name.toLowerCase();
                          if (fileName.endsWith('.zip')) {
                            handleZipUpload(file);
                          } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                            handleExcelUpload(file);
                          } else {
                            setError('不支持的文件类型，请上传 ZIP 或 Excel 文件');
                          }
                          
                          // 清空 input 以便可以重复选择同一文件
                          if (e.target) {
                            e.target.value = '';
                          }
                        }}
                        className="template-file-input"
                      />
                      <span className="btn btn-primary btn-small">上传文件</span>
                    </label>
                  </div>
                  <div className="template-upload-right-area">
                    <p className="template-upload-hint">
                      支持 ZIP 模板文件（包含 HTML、CSS、图片和 Json 替换文件）或 Excel 数据文件
                    </p>
                  </div>
                </div>
              </div>

              {/* 编辑/预览模式切换（右侧一半） */}
              <div className="template-view-mode-section">
                <h3>{isPreviewMode ? '预览模式' : '编辑模式'}</h3>
                <div className="view-mode-toggle">
                  <button
                    className={`view-mode-btn ${!isPreviewMode ? 'active' : ''}`}
                    onClick={() => {
                      // 预览 → 编辑：同步 currentIndex
                      if (isPreviewMode) {
                        setCurrentIndex(selectedBannerIndex ?? currentIndex);
                        setSelectedBannerIndex(null);
                      }
                      setIsPreviewMode(false);
                    }}
                    title="编辑模式"
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11.5 3.5L16.5 8.5L11.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      <path d="M3.5 3.5V16.5H16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    </svg>
                  </button>
                  <button
                    className={`view-mode-btn ${isPreviewMode ? 'active' : ''}`}
                    onClick={() => {
                      // 编辑 → 预览：调整 currentIndex 确保能显示尽可能多的产品
                      if (!isPreviewMode) {
                        // 如果数据不足4个，从0开始显示
                        if (jsonData.length <= 4) {
                          setCurrentIndex(0);
                          setSelectedBannerIndex(0);
                        } else {
                          // 如果当前索引太靠后，调整到能显示4个产品的位置
                          const maxStartIndex = Math.max(0, jsonData.length - 4);
                          const adjustedIndex = Math.min(currentIndex, maxStartIndex);
                          setCurrentIndex(adjustedIndex);
                          setSelectedBannerIndex(adjustedIndex);
                        }
                      }
                      setIsPreviewMode(true);
                    }}
                    title="预览模式（2x2）"
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {htmlContent ? (
              <div className="template-info">
                <div className="template-status">
                  <span className="template-status-icon">✓</span>
                  <span>已加载模板文件</span>
                </div>
                {htmlFileName && (
                  <div className="template-file-name">
                    <span>模板: {htmlFileName}</span>
                    <button
                      onClick={() => {
                        setHtmlContent("");
                        setCssContent("");
                        setHtmlFileName("");
                        setCssFileName("");
                        setTemplateFields([]);
                        setSelectedField(null);
                        setSelectedFieldValue("");
                        setTemplateAssets(null); // ✅ 清除统一模板状态，与 handleClearHtml 保持一致
                        setSuccess("已清除模板");
                      }}
                      className="template-clear-btn"
                      title="清除模板"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* 分发中心区域 */}
          <div className="template-selector">
            <h3>分发中心</h3>
            <div className="template-selector-content">
              {/* Banner图片批量下载按钮 */}
              <div className="template-upload-section template-upload-unified">
                <button
                  onClick={handleGenerateAll}
                  disabled={isGenerating || jsonData.length === 0 || !templateAssets}
                  className="btn btn-primary btn-export"
                >
                  {isGenerating ? "生成中..." : "Banner图片批量下载"}
                </button>
                {isGenerating && (
                  <div className="info-text">
                    正在生成，请稍候...
                  </div>
                )}
              </div>

              {/* 打包Share按钮 */}
              <div className="template-view-mode-section">
                <button
                  onClick={handleShareZip}
                  disabled={isSharing || jsonData.length === 0 || !templateAssets}
                  className="btn btn-primary btn-import"
                >
                  {isSharing ? "打包上传中..." : "打包Share"}
                </button>
                {isSharing && (
                  <div className="info-text">
                    正在打包并上传，请稍候...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 隐藏的导出 iframe：始终存在，用于 handleGenerateAll 导出 */}
        {htmlContent && (
          <div style={{ position: "absolute", left: "-99999px", top: "-99999px", width: "1px", height: "1px", overflow: "hidden" }}>
            <iframe
              ref={iframeRef}
              title="banner-export"
              srcDoc={buildSrcDoc(htmlContent, cssContent)}
              sandbox="allow-same-origin"
              style={{ 
                width: iframeSize?.width || 750, 
                height: iframeSize?.height || 1125 
              }}
            />
          </div>
        )}

        {/* 右侧控制面板 */}
        <div className="banner-control-panel">
          {/* 消息提示 */}
          {error && (
            <div className="message message-error">
              <span>⚠️</span> {error}
            </div>
          )}
          {success && (
            <div className="message message-success">
              <span>✓</span> {success}
            </div>
          )}

          {/* 分享链接对话框 */}
          {showShareDialog && (
            <div className="share-dialog-overlay" onClick={() => setShowShareDialog(false)}>
              <div className="share-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="share-dialog-header">
                  <h3>分享链接已生成</h3>
                  <button
                    className="share-dialog-close"
                    onClick={() => setShowShareDialog(false)}
                    title="关闭"
                  >
                    ×
                  </button>
                </div>
                <div className="share-dialog-content">
                  <p style={{ marginBottom: '12px', color: '#666' }}>
                    文件已上传到服务器，链接将在24小时后自动失效
                  </p>
                  <div className="share-url-container">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="share-url-input"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      className="btn btn-primary btn-small"
                      onClick={copyShareUrl}
                    >
                      复制链接
                    </button>
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-small"
                    >
                      打开链接
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 模板字段列表 */}
          <div className="control-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>本模板可编辑字段</h3>
              {templateFields.length > 0 && !isPreviewMode && (
                <UndoRedoButtons
                  onUndo={currentUndoRedo.undo}
                  onRedo={currentUndoRedo.redo}
                  canUndo={currentUndoRedo.canUndo}
                  canRedo={currentUndoRedo.canRedo}
                />
              )}
            </div>
            {templateFields.length === 0 ? (
              <p style={{ color: "#999", fontSize: 12 }}>
                尚未检测到任何 data-field
              </p>
            ) : (
              <ul className="template-fields-list">
                {templateFields.map((f) => {
                  const isSelected = selectedField === f.name;
                  const isImageField = f.name.includes("_src") || f.name.includes("image") || f.name.includes("img");
                  
                  return (
                    <li
                      key={f.name}
                      className={`template-field-item ${isSelected ? "selected" : ""}`}
                    >
                      <div
                        className="template-field-header"
                        onClick={() => {
                          handleFieldClick(f.name);
                        }}
                        style={{ cursor: "pointer", opacity: isPreviewMode ? 0.8 : 1 }}
                      >
                        <strong>{f.label || f.name}</strong>
                        <span style={{ marginLeft: 8, color: "#999", fontSize: 12 }}>
                          ({f.name})
                        </span>
                      </div>
                      {isSelected && (
                        <div className="template-field-editor">
                          {isPreviewMode ? (
                            <>
                              {!isImageField && <div className="field-value-label">当前值：</div>}
                              {isImageField ? (
                                <div 
                                  style={{ position: 'relative' }}
                                  title="预览模式下无法编辑"
                                >
                                  {selectedFieldValue ? (
                                    <div style={{ 
                                      padding: '8px', 
                                      border: '1px solid #ddd', 
                                      borderRadius: '4px',
                                      backgroundColor: '#f9f9f9',
                                      textAlign: 'center'
                                    }}>
                                      <img 
                                        src={selectedFieldValue} 
                                        alt={f.label || f.name}
                                        style={{ 
                                          maxWidth: '100%', 
                                          maxHeight: '200px',
                                          objectFit: 'contain'
                                        }}
                                      />
                                      {!selectedFieldValue.startsWith('data:image') && (
                                        <div style={{ 
                                          marginTop: '8px', 
                                          fontSize: '11px', 
                                          color: '#999',
                                          wordBreak: 'break-all'
                                        }}>
                                          {selectedFieldValue}
                                        </div>
                                      )}
                                      {selectedFieldValue.startsWith('data:image') && (
                                        <div style={{ 
                                          marginTop: '8px', 
                                          fontSize: '11px', 
                                          color: '#999'
                                        }}>
                                          [Base64 图片数据]
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div style={{ 
                                      padding: '8px', 
                                      color: '#999', 
                                      fontSize: '12px',
                                      textAlign: 'center',
                                      border: '1px dashed #ddd',
                                      borderRadius: '4px'
                                    }}>
                                      暂无图片
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  className="field-value-input"
                                  value={selectedFieldValue}
                                  disabled={true}
                                  readOnly={true}
                                  title="预览模式下无法编辑"
                                  style={{
                                    backgroundColor: '#f5f5f5',
                                    cursor: 'not-allowed',
                                    opacity: 0.8
                                  }}
                                  placeholder="暂无内容"
                                />
                              )}
                            </>
                          ) : (
                            <>
                          {!isImageField && <div className="field-value-label">当前值：</div>}
                          {isImageField ? (
                            <>
                              <div 
                                className="image-drop-zone"
                                onDragOver={(e) => {
                                  if (!isPreviewMode) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.currentTarget.classList.add('drag-over');
                                  }
                                }}
                                onDragLeave={(e) => {
                                  if (!isPreviewMode) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.currentTarget.classList.remove('drag-over');
                                  }
                                }}
                                onDrop={(e) => {
                                  if (isPreviewMode) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    return;
                                  }
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
                                    // 替换素材后立即提交快照
                                    if (undoReadyRef.current) {
                                      setTimeout(() => {
                                        commitSnapshot('replace-asset');
                                      }, 50);
                                    }
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="drop-zone-content">
                                  <div className="drop-zone-icon">📎</div>
                                  <div className="drop-zone-text">从右侧素材库拖拽素材到这里替换</div>
                                </div>
                              </div>
                              {/* 控制按钮 - 放在拖拽区域下方 */}
                              <div className="image-control-buttons" onClick={(e) => e.stopPropagation()}>
                                {/* 方向键 - WASD 方式排列，靠左 */}
                                <div className="dpad-container">
                                  <button
                                    className="image-control-btn dpad-btn dpad-up"
                                    title="向上 (W)"
                                    disabled={isPreviewMode}
                                    onClick={(e) => {
                                      if (isPreviewMode) return;
                                      e.stopPropagation();
                                      adjustImageTransform(f.name, 'up');
                                    }}
                                  >
                                    ↑
                                  </button>
                                  <div className="dpad-middle">
                                    <button
                                      className="image-control-btn dpad-btn dpad-left"
                                      title="向左 (A)"
                                      disabled={isPreviewMode}
                                      onClick={(e) => {
                                        if (isPreviewMode) return;
                                        e.stopPropagation();
                                        adjustImageTransform(f.name, 'left');
                                      }}
                                    >
                                      ←
                                    </button>
                                    <button
                                      className="image-control-btn dpad-btn dpad-down"
                                      title="向下 (S)"
                                      disabled={isPreviewMode}
                                      onClick={(e) => {
                                        if (isPreviewMode) return;
                                        e.stopPropagation();
                                        adjustImageTransform(f.name, 'down');
                                      }}
                                    >
                                      ↓
                                    </button>
                                    <button
                                      className="image-control-btn dpad-btn dpad-right"
                                      title="向右 (D)"
                                      disabled={isPreviewMode}
                                      onClick={(e) => {
                                        if (isPreviewMode) return;
                                        e.stopPropagation();
                                        adjustImageTransform(f.name, 'right');
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
                                    disabled={isPreviewMode}
                                    onClick={(e) => {
                                      if (isPreviewMode) return;
                                      e.stopPropagation();
                                      adjustImageTransform(f.name, 'zoomIn');
                                    }}
                                  >
                                    +
                                  </button>
                                  <button
                                    className="image-control-btn zoom-btn zoom-out"
                                    title="缩小"
                                    disabled={isPreviewMode}
                                    onClick={(e) => {
                                      if (isPreviewMode) return;
                                      e.stopPropagation();
                                      adjustImageTransform(f.name, 'zoomOut');
                                    }}
                                  >
                                    −
                                  </button>
                                </div>
                              </div>
                            </>
                          ) : (
                            <input
                              type="text"
                              className="field-value-input"
                              value={selectedFieldValue}
                              disabled={isPreviewMode}
                              onChange={(e) => {
                                if (isPreviewMode) return;
                                const newValue = e.target.value;
                                setSelectedFieldValue(newValue);
                                updateFieldValue(f.name, newValue);
                              }}
                              onBlur={() => {
                                if (isPreviewMode) return;
                                // 失去焦点时提交快照
                                if (undoReadyRef.current) {
                                  commitSnapshot('text-field-blur');
                                }
                              }}
                              onKeyDown={(e) => {
                                if (isPreviewMode) return;
                                // 按 Enter 键时提交快照
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (undoReadyRef.current) {
                                    commitSnapshot('text-field-enter');
                                  }
                                  // 失去焦点
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              placeholder="输入文本内容"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* JSON 数据上传 */}
          <div className="control-section">
            <h3>批量替换素材</h3>
            <label className="template-upload-label">
              <input
                ref={jsonInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleJsonUpload}
                className="file-input"
              />
              <span className="file-input-label">
                {jsonData.length > 0 ? `批量替换素材 (已加载 ${jsonData.length} 条)` : "选择 JSON 文件"}
              </span>
            </label>
            {jsonData.length > 0 && (
              <div className="info-text">
                <strong>✓ 已加载 {jsonData.length} 条数据</strong>
              </div>
            )}
          </div>

        </div>

        {/* 右侧素材面板 */}
        <div className="banner-asset-sidebar-wrapper">
          <ResizableSidebar
            width={assetSidebarCollapsed ? 0 : assetSidebarWidth}
            onWidthChange={setAssetSidebarWidth}
            collapsed={assetSidebarCollapsed}
            onToggleCollapse={() => setAssetSidebarCollapsed(!assetSidebarCollapsed)}
          >
            <div className="banner-asset-sidebar">
              <AssetSidebar
                jsonData={jsonData}
                currentIndex={currentIndex}
                extraAssets={[...linkedAssets, ...localAssets]}
                sidebarWidth={assetSidebarWidth}
                onAssetClick={(assetUrl, fieldName) => {
                  // 点击素材时，可以高亮对应的字段
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
