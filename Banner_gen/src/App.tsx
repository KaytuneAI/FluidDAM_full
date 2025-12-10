import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { BannerBatchPage } from "./pages/BannerBatchPage";
import { LinkPage } from "./pages/LinkPage";
import { FloatingMenu } from "./components/FloatingMenu";
import { navigateToLink, navigateToFluidDAM, navigateToHome } from "./utils/navigation";
import "./App.css";

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

  const handleNavigateToSpotStudio = () => {
    navigateToFluidDAM();
  };

  const handleNavigateToHome = () => {
    navigateToHome();
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



