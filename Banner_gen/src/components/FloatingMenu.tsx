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
  // 固定菜单：始终显示，不再使用悬浮逻辑
  const menuRef = useRef<HTMLDivElement>(null);

  // 控制页面内容下移（固定菜单，始终下移）
  useEffect(() => {
    const menuHeight = 40; // 菜单高度缩小到一半（原来80px，现在40px）
      document.body.style.paddingTop = `${menuHeight}px`;
    // 移除过渡动画，让界面立即呈现，无下滑动效
    document.body.style.transition = 'none';

    return () => {
      document.body.style.paddingTop = '0';
      document.body.style.transition = '';
    };
  }, []);

  return (
    <div 
      ref={menuRef}
      className="floating-menu fixed"
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

