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

  const htmlInputRef = useRef<HTMLInputElement>(null);
  const cssInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
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

  // 处理 ZIP 文件上传
  const handleZipUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    try {
      const result = await processZipFile(file);
      setHtmlContent(result.html);
      setCssContent(result.css);
      setHtmlFileName(result.htmlFileName || "");
      setCssFileName(result.cssFileName || "");
      setTemplateFields(result.fields);
      setIframeSize(result.iframeSize);
      setSuccess(`模板加载成功！包含 ${result.fields.length} 个可替换字段`);
    } catch (err: any) {
      setError(err.message || "ZIP 文件处理失败");
    }
  }, []);

  // 处理 HTML 文件上传
  const handleHtmlUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    try {
      const result = await handleHtmlUploadUtil(
        file,
        (result) => {
          setHtmlContent(result.html);
          setCssContent(result.css || "");
          setHtmlFileName(file.name);
          setTemplateFields(result.fields);
          setSuccess(`HTML 模板加载成功！包含 ${result.fields.length} 个可替换字段`);
        },
        (message) => {
          setError(message);
        }
      );
    } catch (err: any) {
      setError(err.message || "HTML 文件处理失败");
    }
  }, []);

  // 处理 CSS 文件上传
  const handleCssUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    try {
      const result = await handleCssUploadUtil(
        file,
        (css) => {
          setCssContent(css);
          setCssFileName(file.name);
          setSuccess("CSS 文件加载成功！");
        },
        (message) => {
          setError(message);
        }
      );
    } catch (err: any) {
      setError(err.message || "CSS 文件处理失败");
    }
  }, []);

  // 处理字段点击
  const handleFieldClick = useCallback((fieldName: string) => {
    setSelectedField(fieldName);
    // 从 iframe 中获取当前值
    if (previewIframeRef.current?.contentDocument) {
      const doc = previewIframeRef.current.contentDocument;
      const element = doc.querySelector(`[data-field="${fieldName}"]`);
      if (element) {
        if (element.tagName === 'IMG') {
          setSelectedFieldValue((element as HTMLImageElement).src || "");
        } else {
          setSelectedFieldValue(element.textContent?.trim() || "");
        }
      }
    }
  }, []);

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

  // 预览 iframe 加载完成
  const handlePreviewIframeLoad = useCallback(() => {
    if (!previewIframeRef.current?.contentDocument || !htmlContent) return;

    const doc = previewIframeRef.current.contentDocument;
    const srcDoc = buildSrcDoc(htmlContent, cssContent);
    doc.open();
    doc.write(srcDoc);
    doc.close();

    // 应用 JSON 数据（如果有）
    if (jsonData.length > 0 && jsonData[currentIndex]) {
      applyJsonDataToIframeUtil(previewIframeRef.current, jsonData[currentIndex], updatePriceFields);
    }
  }, [htmlContent, cssContent, jsonData, currentIndex]);

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

      {success && (
        <div className="success-message">
          {success}
        </div>
      )}

      <div className="template-gen-content">
        {/* 左侧控制面板 */}
        <div className="template-gen-controls">
          {/* 模板上传 */}
          <div className="control-section">
            <h3>上传模板</h3>
            <label className="template-upload-label">
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                onChange={handleZipUpload}
                className="file-input"
              />
              <span className="file-input-label">
                {htmlContent ? `已加载模板 (${htmlFileName})` : "选择 ZIP 文件"}
              </span>
            </label>
            
            <label className="template-upload-label">
              <input
                ref={htmlInputRef}
                type="file"
                accept=".html,.htm"
                onChange={handleHtmlUpload}
                className="file-input"
              />
              <span className="file-input-label">
                {htmlContent ? `已加载 HTML (${htmlFileName})` : "选择 HTML 文件"}
              </span>
            </label>

            <label className="template-upload-label">
              <input
                ref={cssInputRef}
                type="file"
                accept=".css"
                onChange={handleCssUpload}
                className="file-input"
              />
              <span className="file-input-label">
                {cssContent ? `已加载 CSS (${cssFileName})` : "选择 CSS 文件"}
              </span>
            </label>
          </div>

          {/* 字段列表 */}
          {templateFields.length > 0 && (
            <div className="control-section">
              <h3>可替换字段 ({templateFields.length})</h3>
              <ul className="field-list">
                {templateFields.map((f) => (
                  <li
                    key={f.name}
                    className={`field-item ${selectedField === f.name ? 'selected' : ''}`}
                    onClick={() => handleFieldClick(f.name)}
                  >
                    <div className="field-name">{f.label || f.name}</div>
                    {selectedField === f.name && (
                      <div className="field-editor">
                        {f.name.includes('_src') || f.name.includes('image') ? (
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
                    )}
                  </li>
                ))}
              </ul>
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

        {/* 中间预览区域 */}
        <div className="template-gen-preview">
          {htmlContent ? (
            <iframe
              ref={previewIframeRef}
              className="preview-iframe"
              style={{
                width: iframeSize?.width || 800,
                height: iframeSize?.height || 800,
              }}
              onLoad={handlePreviewIframeLoad}
              title="Template Preview"
            />
          ) : (
            <div className="preview-placeholder">
              <p>请先上传模板文件</p>
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
                jsonData={jsonData}
                currentIndex={currentIndex}
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

