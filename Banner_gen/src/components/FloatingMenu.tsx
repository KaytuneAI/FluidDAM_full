import React, { useState, useEffect, useRef } from 'react';
import './FloatingMenu.css';

interface FloatingMenuProps {
  items: Array<{
    label: string;
    description?: string; // 中文描述
    onClick: () => void;
    active?: boolean;
  }>;
  triggerHeight?: number; // 触发区域高度（默认 60px）
  title?: string; // 标题文本
  logoUrl?: string; // Logo 图片 URL
}

export const FloatingMenu: React.FC<FloatingMenuProps> = ({ 
  items, 
  triggerHeight = 60,
  title,
  logoUrl
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 控制页面内容下移
  useEffect(() => {
    const menuHeight = 80; // 菜单高度（56px min-height + 24px padding）
    if (isVisible) {
      document.body.style.paddingTop = `${menuHeight}px`;
      document.body.style.transition = 'padding-top 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    } else {
      document.body.style.paddingTop = '0';
    }

    return () => {
      document.body.style.paddingTop = '0';
    };
  }, [isVisible]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const y = e.clientY;
      
      // 清除之前的定时器
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // 鼠标接近顶部区域时显示菜单
      if (y <= triggerHeight) {
        setIsVisible(true);
      } else {
        // 鼠标移开时，延迟隐藏（给用户时间移动到菜单上）
        timeoutRef.current = setTimeout(() => {
          // 检查鼠标是否在菜单区域内
          if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            
            // 如果鼠标不在菜单区域内，才隐藏
            if (
              mouseX < rect.left ||
              mouseX > rect.right ||
              mouseY < rect.top ||
              mouseY > rect.bottom
            ) {
              setIsVisible(false);
            }
          } else {
            setIsVisible(false);
          }
        }, 200); // 200ms 延迟，避免快速移动时闪烁
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [triggerHeight]);

  return (
    <div 
      ref={menuRef}
      className={`floating-menu ${isVisible ? 'visible' : ''}`}
      onMouseEnter={() => {
        // 鼠标进入菜单区域时，清除隐藏定时器
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setIsVisible(true);
      }}
      onMouseLeave={() => {
        // 鼠标离开菜单区域时，延迟隐藏
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          setIsVisible(false);
        }, 500);
      }}
    >
      <div className="floating-menu-content">
        <div className="floating-menu-buttons">
          {items.map((item, index) => (
            <div key={index} className="floating-menu-button-wrapper">
              <button
                className={`floating-menu-item ${item.active ? 'active' : ''}`}
                onClick={item.onClick}
              >
                {item.label}
              </button>
              {item.description && (
                <span className="floating-menu-description">
                  {item.description}
                </span>
              )}
            </div>
          ))}
        </div>
        {logoUrl && (
          <div className="floating-menu-logo">
            <img 
              src={logoUrl}
              alt="Logo" 
              className="floating-menu-logo-image"
            />
          </div>
        )}
      </div>
    </div>
  );
};

