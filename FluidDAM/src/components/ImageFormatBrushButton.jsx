import React, { useState, useEffect, useRef } from 'react';
import { getIconPath } from '../utils/iconPath.js';

export default function ImageFormatBrushButton({ editor }) {
  const [isActive, setIsActive] = useState(false);
  const [sourceSize, setSourceSize] = useState(null);
  const sourceShapeIdRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const lastSelectedIdRef = useRef(null);

  // 获取图片的尺寸
  const getImageSize = (shapeId) => {
    if (!editor || !shapeId) return null;
    try {
      const shape = editor.getShape(shapeId);
      if (!shape || shape.type !== 'image') return null;
      
      const bounds = editor.getShapePageBounds(shapeId);
      if (!bounds) return null;
      
      return {
        width: bounds.w,
        height: bounds.h
      };
    } catch (error) {
      console.error('获取图片尺寸时出错:', error);
      return null;
    }
  };

  // 应用尺寸到目标图片
  const applySizeToTarget = (targetShapeId, sourceWidth, sourceHeight) => {
    if (!editor || !targetShapeId) return false;
    
    try {
      const targetShape = editor.getShape(targetShapeId);
      if (!targetShape || targetShape.type !== 'image') {
        console.error('目标形状不是图片类型');
        return false;
      }
      
      const targetBounds = editor.getShapePageBounds(targetShapeId);
      if (!targetBounds) {
        console.error('无法获取目标图片边界');
        return false;
      }
      
      // 获取目标图片的原始宽高比
      const targetAspectRatio = targetBounds.w / targetBounds.h;
      const sourceAspectRatio = sourceWidth / sourceHeight;
      
      let finalWidth = sourceWidth;
      let finalHeight = sourceHeight;
      
      // 如果宽高比不一致，高度优先
      // 高度优先：保持源图片的高度，宽度按目标图片的宽高比调整（避免目标图片变形）
      if (Math.abs(targetAspectRatio - sourceAspectRatio) > 0.01) {
        // 保持源图片的高度
        finalHeight = sourceHeight;
        // 宽度按目标图片的宽高比调整，尽量接近源图片的宽度
        finalWidth = Math.round(sourceHeight * targetAspectRatio);
      }
      
      console.log('格式刷：应用尺寸', {
        targetId: targetShapeId,
        sourceSize: { width: sourceWidth, height: sourceHeight },
        finalSize: { width: finalWidth, height: finalHeight },
        targetAspectRatio,
        sourceAspectRatio
      });
      
      // 更新目标图片的尺寸 - 使用 batch 确保原子性
      editor.batch(() => {
        editor.updateShapes([{
          id: targetShapeId,
          type: 'image',
          props: {
            ...targetShape.props,
            w: finalWidth,
            h: finalHeight
          }
        }]);
      });
      
      // 验证更新是否成功
      setTimeout(() => {
        const updatedBounds = editor.getShapePageBounds(targetShapeId);
        if (updatedBounds) {
          console.log('格式刷：更新后的尺寸', {
            width: updatedBounds.w,
            height: updatedBounds.h
          });
        }
      }, 100);
      
      return true;
    } catch (error) {
      console.error('应用尺寸时出错:', error);
      return false;
    }
  };

  // 监听选中变化
  useEffect(() => {
    if (!editor || !isActive) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      return;
    }

    // 监听选中变化 - 使用轮询方式检查选中状态
    let checkInterval = null;
    const checkSelection = () => {
      try {
        const selectedShapeIds = editor.getSelectedShapeIds();
        
        // 如果没有选中任何东西，清除记录
        if (selectedShapeIds.length === 0) {
          lastSelectedIdRef.current = null;
          return;
        }
        
        const selectedShapeId = selectedShapeIds[0];
        
        // 如果选中的和上次一样，不处理（避免重复触发）
        if (selectedShapeId === lastSelectedIdRef.current) {
          return;
        }
        
        const selectedShape = editor.getShape(selectedShapeId);
        
        if (!selectedShape || selectedShape.type !== 'image') {
          lastSelectedIdRef.current = selectedShapeId;
          return;
        }
        
        // 更新最后选中的ID
        lastSelectedIdRef.current = selectedShapeId;
        
        // 如果还没有源图片，设置当前选中的为源图片
        if (!sourceSize || !sourceShapeIdRef.current) {
          const size = getImageSize(selectedShapeId);
          if (size) {
            setSourceSize(size);
            sourceShapeIdRef.current = selectedShapeId;
            console.log('格式刷：已记录源图片尺寸', size, '源图片ID:', selectedShapeId);
          }
        } else {
          // 如果已经有源图片，且选中的不是源图片，则应用尺寸
          if (selectedShapeId !== sourceShapeIdRef.current) {
            console.log('格式刷：检测到目标图片选中', selectedShapeId, '源图片ID:', sourceShapeIdRef.current);
            const applied = applySizeToTarget(
              selectedShapeId,
              sourceSize.width,
              sourceSize.height
            );
            
            if (applied) {
              // 应用成功后，重置格式刷状态，让用户可以继续使用
              setTimeout(() => {
                setSourceSize(null);
                sourceShapeIdRef.current = null;
                setIsActive(false);
                lastSelectedIdRef.current = null;
                console.log('格式刷：已应用尺寸到目标图片，格式刷已关闭');
              }, 100);
            } else {
              console.error('格式刷：应用尺寸失败');
            }
          } else {
            // 如果选中的是源图片本身，不做任何操作（保持格式刷激活状态）
            console.log('格式刷：选中的是源图片本身，保持激活状态');
          }
        }
      } catch (error) {
        console.error('格式刷检查选中状态时出错:', error);
      }
    };
    
    // 立即检查一次
    checkSelection();
    
    // 定期检查选中状态（每100ms检查一次）
    checkInterval = setInterval(checkSelection, 100);
    
    // 同时监听 store 变化作为补充
    const unsubscribe = editor.store.listen(() => {
      checkSelection();
    }, { scope: 'document' });
    
    unsubscribeRef.current = () => {
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
      unsubscribe();
    };
    
    return () => {
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [editor, isActive, sourceSize]);

  // 处理格式刷按钮点击
  const handleFormatBrushClick = () => {
    if (!editor) {
      alert('编辑器未就绪');
      return;
    }
    
    if (isActive) {
      // 如果已经激活，则取消激活
      setIsActive(false);
      setSourceSize(null);
      sourceShapeIdRef.current = null;
      return;
    }
    
    // 检查是否有选中的图片
    const selectedShapeIds = editor.getSelectedShapeIds();
    if (selectedShapeIds.length === 0) {
      alert('请先选中一个源图片，然后点击格式刷按钮');
      return;
    }
    
    const selectedShapeId = selectedShapeIds[0];
    const selectedShape = editor.getShape(selectedShapeId);
    
    if (!selectedShape || selectedShape.type !== 'image') {
      alert('请先选中一个图片作为源图片');
      return;
    }
    
    // 获取源图片尺寸
    const size = getImageSize(selectedShapeId);
    if (!size) {
      alert('无法获取源图片尺寸');
      return;
    }
    
    // 激活格式刷
    setSourceSize(size);
    sourceShapeIdRef.current = selectedShapeId;
    setIsActive(true);
    
    console.log('格式刷已激活，源图片尺寸:', size);
  };

  return (
    <button 
      onClick={handleFormatBrushClick}
      style={{
        fontSize: 12,
        padding: "2px",
        border: isActive ? "2px solid #007bff" : "0.5px solid #dee2e6",
        borderRadius: 2,
        background: isActive ? "#e3f2fd" : "#dee2e6",
        color: "white",
        cursor: "pointer",
        fontWeight: "bold",
        whiteSpace: "nowrap",
        width: 40,
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        position: "relative"
      }}
      title={isActive 
        ? "格式刷已激活 - 点击其他图片应用尺寸（高度优先）" 
        : "格式刷 - 先选中源图片，点击此按钮，再选中目标图片"}
    >
      <img 
        src={getIconPath('icons/format.jpg')} 
        alt="格式刷" 
        style={{
          width: 32, 
          height: 32,
          opacity: isActive ? 1 : 0.8,
          filter: isActive ? 'none' : 'grayscale(20%)'
        }}
        onError={(e) => {
          console.error('格式刷图标加载失败，路径:', getIconPath('icons/format.jpg'));
          // 备用方案：使用 emoji
          e.target.style.display = 'none';
          const parent = e.target.parentElement;
          if (parent && !parent.querySelector('.format-brush-fallback')) {
            const fallback = document.createElement('span');
            fallback.className = 'format-brush-fallback';
            fallback.textContent = '🖌️';
            fallback.style.fontSize = '20px';
            parent.appendChild(fallback);
          }
        }}
      />
      {isActive && (
        <span style={{
          position: "absolute",
          top: -2,
          right: -2,
          width: 8,
          height: 8,
          background: "#4caf50",
          borderRadius: "50%",
          border: "1px solid white"
        }} />
      )}
    </button>
  );
}

