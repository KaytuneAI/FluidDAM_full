import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { BannerBatchPage } from "./pages/BannerBatchPage";
import { LinkPage } from "./pages/LinkPage";
import { TemplateGenPage } from "./pages/TemplateGenPage";
import { FloatingMenu } from "./components/FloatingMenu";
import { navigateToLink, navigateToFluidDAM, navigateToHome, navigateToTemplateGen, getFluidDAMUrl } from "./utils/navigation";
import "./App.css";

// 辅助函数：检查是否在生产模式
function isProductionMode(): boolean {
  return import.meta.env.MODE === 'production' || 
         import.meta.env.PROD ||
         (window.location.port === '' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1');
}

function AppContent() {
  const location = useLocation();
  const basename = import.meta.env.MODE === 'production' ? '/bannergen' : '';
  
  const handleNavigateToLink = () => {
    // In production, Link is at /bannergen/link (within BannerGen app)
    // In development, use navigation utility
    if (import.meta.env.MODE === 'production') {
      window.location.href = '/bannergen/link';
    } else {
      navigateToLink();
    }
  };

  const handleNavigateToBannerGen = () => {
    // Navigate to BannerGen page (relative to current basename)
    window.location.href = `${basename}/banner-batch`;
  };

  const handleNavigateToSpotStudio = (e?: React.MouseEvent) => {
    // 阻止事件冒泡，避免触发其他处理
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // SpotStudio 是另一个应用，运行在独立的端口 5174
    // 开发模式：使用动态 hostname（支持 localhost、127.0.0.1 和实际 IP 地址）
    // 生产模式：跳转到 /spotstudio（由 nginx 处理）
    const isProd = import.meta.env.MODE === 'production' || 
                   import.meta.env.PROD ||
                   (window.location.port === '' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1');
    
    const spotStudioUrl = isProd 
      ? '/spotstudio' 
      : `${window.location.protocol}//${window.location.hostname}:5174`;
    
    console.log('[BannerGen] handleNavigateToSpotStudio: 跳转到', spotStudioUrl);
    console.log('[BannerGen] handleNavigateToSpotStudio: 生产模式?', isProd);
    
    // 立即跳转
    window.location.href = spotStudioUrl;
  };

  const handleNavigateToHome = () => {
    navigateToHome();
  };

  const handleNavigateToTemplateGen = () => {
    window.location.href = `${basename}/template-gen`;
  };

  // 判断当前页面
  const isLinkPage = location.pathname.includes('/link');
  const isBannerGenPage = location.pathname.includes('/banner-batch');
  const isTemplateGenPage = location.pathname.includes('/template-gen');
  
  return (
    <>
      <FloatingMenu
        items={[
          {
            label: 'Home',
            description: '返回主页',
            onClick: handleNavigateToHome,
          },
          {
            label: 'Link',
            description: '素材链接',
            onClick: handleNavigateToLink,
            active: isLinkPage,
          },
          {
            label: 'TemplateGen',
            description: '模板生成器',
            onClick: handleNavigateToTemplateGen,
            active: isTemplateGenPage,
          },
          {
            label: 'BannerGen',
            description: '素材组装',
            onClick: handleNavigateToBannerGen,
            active: isBannerGenPage,
          },
          {
            label: 'SpotStudio',
            description: '排期管理',
            onClick: handleNavigateToSpotStudio,
          },
        ]}
        triggerHeight={60}
        title="Banner Generator - 广告模板素材组装中心"
        logoUrl={`${import.meta.env.BASE_URL || ''}image/kaytuneai logo.png`}
      />
      <Routes>
        <Route path="/" element={<Navigate to="/banner-batch" replace />} />
        <Route path="/banner-batch" element={<BannerBatchPage />} />
        <Route path="/link" element={<LinkPage />} />
        <Route path="/template-gen" element={<TemplateGenPage />} />
        {/* 
          注意：/spotstudio 路径不应该在这里定义路由
          因为 vite 插件 (spotstudio-html-plugin) 应该在中间件层面处理 /spotstudio 路径
          返回 FluidDAM 的 HTML，所以 React Router 不应该匹配到这个路径
          如果 React Router 匹配到了 /spotstudio，说明 vite 插件没有正常工作
        */}
      </Routes>
    </>
  );
}

function App() {
  const basename = import.meta.env.MODE === 'production' ? '/bannergen' : '';
  
  return (
    <BrowserRouter 
      basename={basename}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AppContent />
    </BrowserRouter>
  );
}

export default App;



