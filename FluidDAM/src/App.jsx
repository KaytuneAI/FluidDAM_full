import React from "react";
import MainCanvas from "./MainCanvas";
import ErrorBoundary from "./ErrorBoundary";
import { FloatingMenu } from "./components/FloatingMenu";
import { navigateToLink, navigateToBannerGen, navigateToHome } from "./utils/navigation";
import { getIconPath } from "./utils/iconPath.js";

export default function App() {
  const handleNavigateToLink = () => {
    navigateToLink();
  };

  const handleNavigateToBannerGen = () => {
    navigateToBannerGen();
  };

  const handleNavigateToSpotStudio = () => {
    // 当前已经在 SpotStudio，可以刷新或不做任何操作
    window.location.href = window.location.pathname;
  };

  const handleNavigateToHome = () => {
    navigateToHome();
  };

  // 检查是否在 SpotStudio 模式
  const isSpotStudio = window.location.pathname.includes('/spotstudio') || 
                       window.location.pathname === '/' ||
                       (!window.location.pathname.includes('/bannergen') && 
                        !window.location.pathname.includes('/link'));

  return (
    <ErrorBoundary>
      {!isSpotStudio && (
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
            },
            {
              label: 'BannerGen',
              description: '素材组装',
              onClick: handleNavigateToBannerGen,
            },
            {
              label: 'SpotStudio',
              description: '排期管理',
              onClick: handleNavigateToSpotStudio,
              active: false,
            },
          ]}
          triggerHeight={60}
          logoUrl={getIconPath('image/kaytuneai logo.png')}
        />
      )}
      <MainCanvas />
    </ErrorBoundary>
  );
}