import React, { useState } from 'react';

export default function FormatBrushButton({ editor, iconSrc }) {
  const [showDialog, setShowDialog] = useState(false);
  const [suggestedSize, setSuggestedSize] = useState({ width: 0, height: 0 });
  const [customSize, setCustomSize] = useState({ width: 0, height: 0 });
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);
  const [originalRatios, setOriginalRatios] = useState([]);

  // 计算选中图片的尺寸统计
  const calculateImageSizes = () => {
    if (!editor) return { width: 0, height: 0 };

    try {
      const selectedShapeIds = editor.getSelectedShapeIds();
      if (selectedShapeIds.length === 0) {
        alert('请先选择要修改的图片元素');
        return { width: 0, height: 0 };
      }

      // 过滤出图片类型的选中元素
      const imageShapes = selectedShapeIds
        .map(id => editor.getShape(id))
        .filter(shape => shape && shape.type === 'image');

      if (imageShapes.length === 0) {
        alert('选中的元素中没有图片，请选择图片元素');
        return { width: 0, height: 0 };
      }

      // 计算尺寸统计
      const sizes = imageShapes.map(shape => {
        const bounds = editor.getShapePageBounds(shape.id);
        return { width: bounds?.w || 0, height: bounds?.h || 0 };
      });

      // 保存原始比例
      const ratios = sizes.map(size => size.width / size.height);
      setOriginalRatios(ratios);

      // 计算最常见的尺寸（众数）
      const widthCounts = {};
      const heightCounts = {};
      
      sizes.forEach(size => {
        widthCounts[size.width] = (widthCounts[size.width] || 0) + 1;
        heightCounts[size.height] = (heightCounts[size.height] || 0) + 1;
      });

      const mostCommonWidth = Object.keys(widthCounts).reduce((a, b) => 
        widthCounts[a] > widthCounts[b] ? a : b
      );
      const mostCommonHeight = Object.keys(heightCounts).reduce((a, b) => 
        heightCounts[a] > heightCounts[b] ? a : b
      );

      return {
        width: parseInt(mostCommonWidth),
        height: parseInt(mostCommonHeight),
        imageCount: imageShapes.length
      };
    } catch (error) {
      console.error('计算图片尺寸时出错:', error);
      return { width: 0, height: 0 };
    }
  };

  // 批量修改图片尺寸
  const applySizeToSelectedImages = (width, height) => {
    if (!editor) return;

    try {
      const selectedShapeIds = editor.getSelectedShapeIds();
      const imageShapes = selectedShapeIds
        .map(id => editor.getShape(id))
        .filter(shape => shape && shape.type === 'image');

      if (imageShapes.length === 0) {
        alert('选中的元素中没有图片');
        return;
      }

      // 批量更新图片尺寸
      const updates = imageShapes.map((shape, index) => {
        const currentBounds = editor.getShapePageBounds(shape.id);
        
        let finalWidth = width;
        let finalHeight = height;
        
        // 如果保持比例，根据原始比例计算
        if (keepAspectRatio && originalRatios[index]) {
          const ratio = originalRatios[index];
          if (width > 0) {
            finalHeight = Math.round(width / ratio);
          } else if (height > 0) {
            finalWidth = Math.round(height * ratio);
          }
        }
        
        return {
          id: shape.id,
          type: 'image',
          x: currentBounds?.x || 0,
          y: currentBounds?.y || 0,
          props: {
            ...shape.props,
            w: finalWidth,
            h: finalHeight
          }
        };
      });

      editor.updateShapes(updates);
      
      // 关闭对话框
      setShowDialog(false);
      
      // 显示成功消息
      const message = keepAspectRatio 
        ? `已成功将 ${imageShapes.length} 个图片按比例缩放`
        : `已成功将 ${imageShapes.length} 个图片的尺寸修改为 ${width} x ${height} 像素`;
      alert(message);
      
    } catch (error) {
      console.error('修改图片尺寸时出错:', error);
      alert('修改图片尺寸时出错，请重试');
    }
  };

  // 处理格式刷按钮点击
  const handleFormatBrushClick = () => {
    const sizeInfo = calculateImageSizes();
    
    if (sizeInfo.width === 0 && sizeInfo.height === 0) {
      return; // 已经在calculateImageSizes中显示了错误消息
    }

    setSuggestedSize(sizeInfo);
    setCustomSize(sizeInfo);
    setShowDialog(true);
  };

  // 处理宽度变化
  const handleWidthChange = (newWidth) => {
    if (keepAspectRatio && originalRatios.length > 0) {
      // 使用第一个图片的比例作为参考
      const ratio = originalRatios[0];
      const newHeight = Math.round(newWidth / ratio);
      setCustomSize({ width: newWidth, height: newHeight });
    } else {
      setCustomSize(prev => ({ ...prev, width: newWidth }));
    }
  };

  // 处理高度变化
  const handleHeightChange = (newHeight) => {
    if (keepAspectRatio && originalRatios.length > 0) {
      // 使用第一个图片的比例作为参考
      const ratio = originalRatios[0];
      const newWidth = Math.round(newHeight * ratio);
      setCustomSize({ width: newWidth, height: newHeight });
    } else {
      setCustomSize(prev => ({ ...prev, height: newHeight }));
    }
  };

  // 处理确认按钮
  const handleConfirm = () => {
    const width = customSize.width || suggestedSize.width;
    const height = customSize.height || suggestedSize.height;
    
    if (width <= 0 || height <= 0) {
      alert('请输入有效的尺寸数值');
      return;
    }

    applySizeToSelectedImages(width, height);
  };

  // 处理取消按钮
  const handleCancel = () => {
    setShowDialog(false);
  };

  return (
    <>
      <button 
        onClick={handleFormatBrushClick}
        style={{
          fontSize: 12,
          padding: "2px",
          border: "0.5px solid #dee2e6",
          borderRadius: 2,
          background: "#dee2e6",
          color: "white",
          cursor: "pointer",
          fontWeight: "bold",
          whiteSpace: "nowrap",
          width: 40,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
        title="批量调整尺寸 - 修改选中图片尺寸"
      >
        {iconSrc ? (
          <img src={iconSrc} alt="调整尺寸" style={{width: 32, height: 32, border: 'none', outline: 'none'}} />
        ) : (
          '🎨'
        )}
      </button>

      {/* 尺寸设置对话框 */}
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
              批量修改图片尺寸
            </h3>
            
            <div style={{ marginBottom: '15px' }}>
              <p style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>
                已选中 {suggestedSize.imageCount} 个图片元素
              </p>
              <p style={{ margin: '0 0 15px 0', color: '#666', fontSize: '14px' }}>
                建议尺寸: {suggestedSize.width} x {suggestedSize.height} 像素
              </p>
            </div>

            {/* 比例保持开关 */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                fontSize: '14px', 
                cursor: 'pointer' 
              }}>
                <input
                  type="checkbox"
                  checked={keepAspectRatio}
                  onChange={(e) => setKeepAspectRatio(e.target.checked)}
                  style={{ margin: 0 }}
                />
                保持宽高比例
              </label>
              {keepAspectRatio && (
                <p style={{ 
                  margin: '5px 0 0 0', 
                  fontSize: '12px', 
                  color: '#666',
                  fontStyle: 'italic'
                }}>
                  修改宽度或高度时，另一个维度会自动按比例调整
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  宽度 (像素)
                </label>
                <input
                  type="number"
                  value={customSize.width || ''}
                  onChange={(e) => handleWidthChange(parseInt(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                  placeholder={suggestedSize.width.toString()}
                />
              </div>
              
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  高度 (像素)
                </label>
                <input
                  type="number"
                  value={customSize.height || ''}
                  onChange={(e) => handleHeightChange(parseInt(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                  placeholder={suggestedSize.height.toString()}
                />
              </div>
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
                onClick={handleConfirm}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  background: '#007bff',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
