import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { navigateToBannerGen, navigateToFluidDAM, navigateToLink, navigateToTemplateGen } from "../utils/navigation";
import "./HomePage.css";

export default function HomePage() {
  const navigate = useNavigate();
  
  const carouselTexts = [
    { product: "FluidDAM", description: "管理素材，生产全链路智能化。" },
    { product: "LinkDAM", description: "一键接入品牌 DAM，素材随取随用" },
    { product: "SpotStudio", description: "用数据驱动画布，用画布驱动决策" },
    { product: "BannerGen", description: "高定高速，SKU电商素材批量生成" },
    { product: "TemplateGen", description: "自由搭建，万能模板" }
  ];
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) {
      // 如果暂停，清除所有定时器
      return;
    }

    // 立即执行一次切换（如果之前暂停过）
    const immediateTimeout = setTimeout(() => {
      if (!isPaused) {
        setIsVisible(false);
        setTimeout(() => {
          if (!isPaused) {
            setCurrentIndex((prev) => (prev + 1) % carouselTexts.length);
            setIsVisible(true);
          }
        }, 500);
      }
    }, 500);

    // 然后设置定期切换
    const interval = setInterval(() => {
      if (!isPaused) {
        setIsVisible(false);
        setTimeout(() => {
          if (!isPaused) {
            setCurrentIndex((prev) => (prev + 1) % carouselTexts.length);
            setIsVisible(true);
          }
        }, 500); // 淡出时间
      }
    }, 4000); // 每4秒切换一次

    return () => {
      clearInterval(interval);
      clearTimeout(immediateTimeout);
    };
  }, [carouselTexts.length, isPaused]);

  const handleNavigateToBannerGen = () => {
    // In development, use direct port; in production, use directory path
    navigateToBannerGen();
  };

  const handleNavigateToFluidDAM = () => {
    // In development, use direct port; in production, use directory path
    navigateToFluidDAM();
  };

  const handleNavigateToLink = () => {
    // In development, use direct port; in production, use directory path
    navigateToLink();
  };

  const handleNavigateToTemplateGen = () => {
    // In development, use direct port; in production, use directory path
    navigateToTemplateGen();
  };

  return (
    <div className="home-page">
      <div className="home-header">
        <div className="home-logo">
          <img 
            src={`${import.meta.env.BASE_URL || ''}image/kaytuneai logo.png`}
            alt="Kaytune AI Logo" 
            className="logo-image"
            onError={(e) => {
              // Fallback: try BannerGen path if local fails
              const target = e.target as HTMLImageElement;
              const isProduction = import.meta.env.MODE === 'production';
              if (isProduction) {
                target.src = '/bannergen/image/kaytuneai logo.png';
              } else {
                // 开发模式：使用动态 hostname（支持 localhost、127.0.0.1 和实际 IP 地址）
                const fallbackUrl = import.meta.env.VITE_BANNER_GEN_URL || `${window.location.protocol}//${window.location.hostname}:5173`;
                target.src = `${fallbackUrl}/image/kaytuneai logo.png`;
              }
            }}
          />
        </div>
      </div>
      
      <div className="home-container">
        <h1 
          className={`home-title ${isVisible ? 'visible' : 'hidden'}`}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <span className="title-product">{carouselTexts[currentIndex].product}</span>
          <span className="title-description">{carouselTexts[currentIndex].description}</span>
        </h1>
        
        <div className="app-buttons">
          <button 
            className="app-button app-button-link"
            onClick={handleNavigateToLink}
          >
            <div className="button-content">
              <h2>Link</h2>
              <p>素材链接与管理</p>
            </div>
          </button>

          <button 
            className="app-button app-button-templategen"
            onClick={handleNavigateToTemplateGen}
          >
            <div className="button-content">
              <h2>Template Generator</h2>
              <p>自由模板创建中心</p>
            </div>
          </button>

          <button 
            className="app-button app-button-banner"
            onClick={handleNavigateToBannerGen}
          >
            <div className="button-content">
              <h2>Banner Generator</h2>
              <p>广告模板素材组装中心</p>
            </div>
          </button>

          <button 
            className="app-button app-button-fluiddam"
            onClick={handleNavigateToFluidDAM}
          >
            <div className="button-content">
              <h2>SpotStudio</h2>
              <p>交互式画布和素材管理</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
