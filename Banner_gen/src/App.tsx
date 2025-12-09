import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { BannerBatchPage } from "./pages/BannerBatchPage";
import { LinkPage } from "./pages/LinkPage";
import { FloatingMenu } from "./components/FloatingMenu";
import "./App.css";

function AppContent() {
  const location = useLocation();
  const basename = import.meta.env.MODE === 'production' ? '/bannergen' : '';
  
  const handleNavigateToLink = () => {
    // 跳转到素材链接页面
    window.location.href = `${basename}/link`;
  };

  const handleNavigateToBannerGen = () => {
    // 跳转到 BannerGen
    window.location.href = `${basename}/banner-batch`;
  };

  const handleNavigateToSpotStudio = () => {
    // 跳转到 FluidDAM (SpotStudio)
    const fluidDAMUrl = import.meta.env.VITE_FLUIDDAM_URL || "http://localhost:5173";
    window.location.href = fluidDAMUrl;
  };

  const handleNavigateToHome = () => {
    // 跳转到统一入口页面
    const homeUrl = import.meta.env.VITE_HOME_URL || "http://localhost:3000";
    window.location.href = homeUrl;
  };

  // 判断当前页面
  const isLinkPage = location.pathname.includes('/link');
  const isBannerGenPage = location.pathname.includes('/banner-batch');
  
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



