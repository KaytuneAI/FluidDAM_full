import React, { useRef, useState } from 'react';

export default function BatchReplaceButton({ editor, assetId, assetName }) {
  const fileInputRef = useRef(null);
  const [showDialog, setShowDialog] = useState(false);
  const [replacementFile, setReplacementFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');

  // 查找画布上使用该素材的所有图片
  const findShapesUsingAsset = (targetAssetId) => {
    if (!editor) return [];

    try {
      const allShapes = editor.getCurrentPageShapes();
      const imageShapes = allShapes.filter(shape => {
        if (shape.type !== 'image') return false;
        
        const shapeAssetId = shape.props?.assetId;
        if (!shapeAssetId) return false;
        
        // 比较assetId，支持多种格式
        return shapeAssetId === targetAssetId || 
               shapeAssetId === targetAssetId.replace('asset:', '') ||
               `asset:${shapeAssetId}` === targetAssetId;
      });

      return imageShapes;
    } catch (error) {
      console.error('查找使用该素材的形状时出错:', error);
      return [];
    }
  };

  // 处理文件选择
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    setReplacementFile(file);
    
    // 创建预览URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  // 执行批量替换
  const performBatchReplace = async () => {
    if (!editor || !replacementFile || !assetId) {
      alert('缺少必要参数');
      return;
    }

    try {
      // 1. 查找所有使用该素材的图片
      const shapesToReplace = findShapesUsingAsset(assetId);
      
      if (shapesToReplace.length === 0) {
        alert('画布上没有找到使用该素材的图片');
        return;
      }

      // 2. 将新文件转换为data URL
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(replacementFile);
      });

      // 3. 创建新的asset
      const newAssetId = `asset:${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}`;
      
      // 获取新图片的尺寸
      const img = new Image();
      img.onload = () => {
        const newWidth = img.naturalWidth;
        const newHeight = img.naturalHeight;

        // 4. 批量更新所有使用该素材的图片
        const updates = shapesToReplace.map(shape => {
          const currentBounds = editor.getShapePageBounds(shape.id);
          const currentWidth = currentBounds?.w || shape.props?.w || 100;
          const currentHeight = currentBounds?.h || shape.props?.h || 100;
          
          return {
            id: shape.id,
            type: 'image',
            x: currentBounds?.x || 0,
            y: currentBounds?.y || 0,
            props: {
              ...shape.props,
              assetId: newAssetId,
              w: currentWidth,  // 保持原有尺寸
              h: currentHeight  // 保持原有尺寸
            }
          };
        });

        // 5. 创建新asset并更新形状
        editor.store.put([{
          id: newAssetId,
          typeName: 'asset',
          type: 'image',
          props: {
            name: replacementFile.name,
            src: dataUrl,
            w: newWidth,
            h: newHeight,
            mimeType: replacementFile.type,
            isAnimated: false
          },
          meta: {}
        }]);

        // 6. 批量更新所有形状
        editor.updateShapes(updates);

        // 7. 关闭对话框并显示成功消息
        setShowDialog(false);
        setReplacementFile(null);
        setPreviewUrl('');
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        
        alert(`成功替换了 ${shapesToReplace.length} 个图片素材`);
      };
      
      img.src = dataUrl;
      
    } catch (error) {
      console.error('批量替换素材时出错:', error);
      alert('批量替换素材时出错，请重试');
    }
  };

  // 处理取消
  const handleCancel = () => {
    setShowDialog(false);
    setReplacementFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
  };

  // 处理批量替换按钮点击
  const handleBatchReplaceClick = () => {
    const shapesUsingAsset = findShapesUsingAsset(assetId);
    
    if (shapesUsingAsset.length === 0) {
      alert('画布上没有找到使用该素材的图片');
      return;
    }

    setShowDialog(true);
  };

  return (
    <>
      <button 
        onClick={handleBatchReplaceClick}
        style={{
          fontSize: 12,
          padding: "4px 8px",
          border: "1px solid #6c757d",
          borderRadius: 4,
          background: "#6c757d",
          color: "white",
          cursor: "pointer",
          fontWeight: "500",
          whiteSpace: "nowrap",
          width: "100%",
          marginTop: "4px"
        }}
        title={`批量替换 - 替换画布上所有使用"${assetName}"的图片`}
      >
        批量替换素材
      </button>

      {/* 文件选择对话框 */}
      {showDialog && (
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
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            minWidth: '400px',
            maxWidth: '500px'
          }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#333' }}>
              批量替换素材
            </h3>
            
            <div style={{ marginBottom: '15px' }}>
              <p style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>
                将替换画布上所有使用 "<strong>{assetName}</strong>" 的图片
              </p>
              <p style={{ margin: '0 0 15px 0', color: '#666', fontSize: '14px' }}>
                新图片将保持原有的位置和尺寸
              </p>
            </div>

            {/* 文件选择区域 */}
            <div style={{ marginBottom: '20px' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px dashed #007bff',
                  borderRadius: '8px',
                  background: '#f8f9ff',
                  color: '#007bff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                📁 选择新图片文件
              </button>
              
              {replacementFile && (
                <div style={{ marginTop: '10px' }}>
                  <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#333' }}>
                    已选择: {replacementFile.name}
                  </p>
                  {previewUrl && (
                    <img 
                      src={previewUrl} 
                      alt="预览" 
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: '200px', 
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                      }} 
                    />
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCancel}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                取消
              </button>
              <button
                onClick={performBatchReplace}
                disabled={!replacementFile}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  background: replacementFile ? '#007bff' : '#ccc',
                  color: 'white',
                  cursor: replacementFile ? 'pointer' : 'not-allowed',
                  fontSize: '14px'
                }}
              >
                确认替换
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
