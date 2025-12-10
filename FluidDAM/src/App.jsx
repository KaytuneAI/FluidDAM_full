import React from "react";
import MainCanvas from "./MainCanvas";
import ErrorBoundary from "./ErrorBoundary";
import { FloatingMenu } from "./components/FloatingMenu";

export default function App() {
  const handleNavigateToLink = () => {
    // 跳转到 Banner_gen 的 Link 页面
    const bannerGenUrl = import.meta.env.VITE_BANNER_GEN_URL || "http://localhost:5174";
    window.location.href = `${bannerGenUrl}/link`;
  };

  const handleNavigateToBannerGen = () => {
    // 跳转到 Banner_gen (BannerGen)
    const bannerGenUrl = import.meta.env.VITE_BANNER_GEN_URL || "http://localhost:5174";
    window.location.href = bannerGenUrl;
  };

  const handleNavigateToSpotStudio = () => {
    // 当前已经在 SpotStudio，可以刷新或不做任何操作
    window.location.href = window.location.pathname;
  };

  const handleNavigateToHome = () => {
    // 跳转到统一入口页面
    const homeUrl = import.meta.env.VITE_HOME_URL || "http://localhost:3000";
    window.location.href = homeUrl;
  };

  return (
    <ErrorBoundary>
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
            active: true, // 当前页面
          },
        ]}
        triggerHeight={60}
        logoUrl="/image/kaytuneai logo.png"
      />
      <MainCanvas />
    </ErrorBoundary>
  );
}