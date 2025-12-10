import React, { useState } from "react";
import { getSnapshot } from "tldraw";
import { getImageData, getApiBaseUrl } from '../utils/apiUtils.js';

export default function ShareCanvasButton({ editor }) {
  const [isSharing, setIsSharing] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  const shareCanvas = async () => {
    if (!editor) {
      return;
    }

    setIsSharing(true);

    try {
      // 获取当前画布的所有形状
      const currentShapes = editor.getCurrentPageShapes();
      const imageShapes = currentShapes.filter(shape => shape.type === 'image');
      
      // 获取图片信息
      const imageInfo = [];
      for (const shape of imageShapes) {
        try {
          const assetId = shape.props.assetId;
          
          // 尝试从后端API或localStorage获取文件名
          let fileName = `image_${shape.id}`;
          try {
            const database = await getImageData();
            const imageData = database.images.find(img => img.id === shape.id);
            if (imageData) {
              fileName = imageData.fileName;
            }
          } catch {
            // 使用默认名称
          }
          
          imageInfo.push({
            shapeId: shape.id,
            assetId: assetId,
            fileName: fileName,
            fileType: 'image/jpeg',
            width: shape.props.w,
            height: shape.props.h,
            x: shape.x,
            y: shape.y,
            rotation: shape.rotation || 0,
            scale: shape.props.scale || { x: 1, y: 1 }
          });
          
        } catch (error) {
          // 处理图片信息失败，静默处理
        }
      }
      
      // 导出画布状态
      const canvasData = getSnapshot(editor.store);
      
      // 获取当前页面ID
      const currentPageId = editor.getCurrentPageId();
      
      // 调试：打印保存的数据结构
      console.log('保存的画布数据:', canvasData);
      console.log('画布数据类型:', typeof canvasData);
      console.log('画布数据键:', Object.keys(canvasData));
      console.log('当前页面ID:', currentPageId);
      console.log('页面数据:', canvasData.pages);
      console.log('形状数据:', canvasData.shapes);
      console.log('当前页面形状数量:', editor.getCurrentPageShapes().length);
      console.log('当前页面形状:', editor.getCurrentPageShapes().map(s => ({ id: s.id, type: s.type })));
      
      // 创建分享数据 - 使用和SaveCanvasButton相同的数据结构
      const shareData = {
        version: '1.0',
        type: 'shared_canvas',
        sharedAt: new Date().toISOString(),
        canvasData: canvasData,
        currentPageId: currentPageId,
        imageInfo: imageInfo,
        totalImages: imageInfo.length,
        sharedBy: 'Tldraw User'
      };
      
      // 优化数据大小 - 保留完整的画布数据
      const optimizedShareData = {
        version: '1.0',
        type: 'shared_canvas',
        sharedAt: shareData.sharedAt,
        canvasData: canvasData, // 直接使用完整的画布数据，不进行裁剪
        currentPageId: currentPageId,
        imageInfo: imageInfo.map(img => ({
          // 只保留必要的图片信息
          shapeId: img.shapeId,
          assetId: img.assetId,
          fileName: img.fileName,
          width: img.width,
          height: img.height,
          x: img.x,
          y: img.y
        })),
        totalImages: imageInfo.length
      };
      
      // 检查数据大小
      const jsonString = JSON.stringify(optimizedShareData);
      const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
      
      console.log(`优化后分享数据大小: ${sizeInMB.toFixed(2)}MB`);
      
      if (sizeInMB > 50) {
        throw new Error(`画布数据过大 (${sizeInMB.toFixed(2)}MB)，请减少图片数量或大小后重试`);
      }
      
      // 上传到服务器并获取分享链接
      const apiBaseUrl = getApiBaseUrl();
      if (!apiBaseUrl) {
        throw new Error('无法获取API地址');
      }
      
      const response = await fetch(`${apiBaseUrl}/api/share-canvas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(optimizedShareData)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // 稍微延迟一下，让用户看到加载状态
        setTimeout(() => {
          // 设置分享链接并显示对话框
          setShareUrl(result.shareUrl);
          setShowShareDialog(true);
        }, 500);
      } else {
        throw new Error(result.message || '分享失败');
      }
      
    } catch (error) {
      console.error('分享画布时出错:', error);
      alert(`分享失败：${error.message}\n\n请检查网络连接后重试。`);
    } finally {
      setIsSharing(false);
    }
  };

  // 复制链接到剪贴板
  const copyToClipboard = async () => {
    try {
      // 方法1: 使用现代 Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
        showCopySuccess();
        return;
      }
      
      // 方法2: 使用传统的 document.execCommand (备用方案)
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        showCopySuccess();
      } else {
        throw new Error('execCommand failed');
      }
    } catch (error) {
      console.error('复制失败:', error);
      // 如果所有方法都失败，自动选中输入框让用户手动复制
      const input = document.querySelector('.share-url-input');
      if (input) {
        input.focus();
        input.select();
        // 显示提示
        const button = document.querySelector('.copy-button');
        if (button) {
          const originalText = button.textContent;
          button.textContent = '请手动复制';
          button.style.background = '#ffc107';
          setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '#007bff';
          }, 2000);
        }
      }
    }
  };

  // 显示复制成功提示
  const showCopySuccess = () => {
    const button = document.querySelector('.copy-button');
    if (button) {
      const originalText = button.textContent;
      button.textContent = '已复制!';
      button.style.background = '#28a745';
      setTimeout(() => {
        button.textContent = originalText;
        button.style.background = '#007bff';
      }, 1000);
    }
  };

  // 关闭对话框
  const closeDialog = () => {
    setShowShareDialog(false);
    setShareUrl('');
  };

  // 键盘快捷键支持
  React.useEffect(() => {
    const handleKeyDown = (event) => {
      if (showShareDialog) {
        // Ctrl+C 或 Cmd+C 复制链接
        if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
          event.preventDefault();
          copyToClipboard();
        }
        // ESC 关闭对话框
        if (event.key === 'Escape') {
          closeDialog();
        }
      }
    };

    if (showShareDialog) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showShareDialog, shareUrl]);

  return (
    <>
      <button
        onClick={shareCanvas}
        disabled={isSharing}
        title={isSharing ? "正在分享画布..." : "分享画布"}
        style={{
          fontSize: 16,
          padding: "4px",
          border: "0.5px solid #dee2e6",
          borderRadius: 2,
          background: isSharing ? "#6c757d" : "#dee2e6",
          color: "white",
          cursor: isSharing ? "not-allowed" : "pointer",
          fontWeight: "bold",
          whiteSpace: "nowrap",
          width: 40,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: isSharing ? 0.7 : 1,
          transition: "all 0.2s ease"
        }}
      >
        {isSharing ? (
          <div style={{
            width: 20,
            height: 20,
            border: "2px solid #ffffff",
            borderTop: "2px solid transparent",
            borderRadius: "50%",
            animation: "spin 1s linear infinite"
          }} />
        ) : (
          <img src="/icons/share_canvas.png" alt="分享画布" style={{width: 32, height: 32}} />
        )}
      </button>

      {/* 分享对话框 */}
      {showShareDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
            position: 'relative'
          }}>
            {/* 关闭按钮 */}
            <button
              onClick={closeDialog}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                color: '#666',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%'
              }}
            >
              ×
            </button>

            {/* 标题 */}
            <h3 style={{
              margin: '0 0 16px 0',
              color: '#333',
              fontSize: '18px',
              fontWeight: '600'
            }}>
               画布分享
            </h3>

            {/* 说明文字 */}
            <p style={{
              margin: '0 0 16px 0',
              color: '#666',
              fontSize: '14px',
              lineHeight: '1.5'
            }}>
              点击下方"复制链接"按钮，将链接（24小时有效）发送给其他人：
            </p>

            {/* 链接输入框 */}
            <div style={{
              margin: '0 0 16px 0',
              position: 'relative'
            }}>
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="share-url-input"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e1e5e9',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  background: '#f8f9fa',
                  color: '#333',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.target.select()}
              />
            </div>

            {/* 操作按钮 */}
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={closeDialog}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #dee2e6',
                  borderRadius: '6px',
                  background: 'white',
                  color: '#666',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                关闭
              </button>
              <button
                className="copy-button"
                onClick={copyToClipboard}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#007bff',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'background 0.2s ease'
                }}
              >
                复制链接
              </button>
            </div>

           
           
          </div>
        </div>
      )}
    </>
  );
}
