// 侧边栏样式定义
export const sidebarStyles = {
  container: {
    height: "100%",
    overflow: "auto",
    fontFamily: "Arial, Helvetica, Microsoft YaHei, 微软雅黑, PingFang SC, Hiragino Sans GB, WenQuanYi Micro Hei, sans-serif"
  },
  header: { 
    padding: "10px 12px", 
    borderBottom: "1px solid #e5e7eb", 
    display: "flex", 
    justifyContent: "space-between", 
    alignItems: "center"
  },
  list: { 
    padding: 12, 
    display: "grid", 
    gridTemplateColumns: "1fr", 
    gap: 8 
  },
  card: (used) => ({
    border: used ? "2px solid #3b82f6" : "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 8,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "flex-start",
    background: used ? "#f0f7ff" : "#fff"
  }),
  thumbWrap: { 
    width: "100%", 
    aspectRatio: "1 / 1",  // 正方形（高度与宽度一致）
    overflow: "hidden", 
    borderRadius: 2, 
    background: "#f9fafb", 
    display: "flex", 
    alignItems: "center", 
    justifyContent: "center" 
  },
  thumb: { 
    maxWidth: "100%", 
    maxHeight: "100%", 
    width: "auto",
    height: "auto",
    objectFit: "contain"  // 保持宽高比，不裁剪
  },
  name: { 
    fontSize: 12, 
    color: "#111827", 
    textAlign: "left", 
    wordBreak: "break-word" 
  },
  btn: { 
    display: "inline-block", 
    fontSize: 12, 
    padding: "6px 10px", 
    borderRadius: 2, 
    border: "1px solid #d1d5db", 
    background: "#fff", 
    cursor: "pointer" 
  },
  plat: { 
    display: "inline-flex", 
    gap: 6 
  }
};

// 高亮样式
export const highlightStyle = `
  .asset-highlight::before {
    content: '';
    position: absolute;
    top: -12px;
    left: -12px;
    right: -12px;
    bottom: -12px;
    border: 6px solid #ff4444;
    border-radius: 12px;
    pointer-events: none;
    z-index: 1000;
    animation: pulse 1.2s ease-in-out infinite alternate;
    box-shadow: 0 0 20px rgba(255, 68, 68, 0.8), 0 0 40px rgba(255, 68, 68, 0.4);
  }
  
  .asset-highlight::after {
    content: '';
    position: absolute;
    top: -18px;
    left: -18px;
    right: -18px;
    bottom: -18px;
    border: 3px solid #ff6666;
    border-radius: 18px;
    pointer-events: none;
    z-index: 999;
    animation: pulse-outer 1.5s ease-in-out infinite alternate;
    opacity: 0.7;
  }
  
  @keyframes pulse {
    0% { 
      opacity: 0.8; 
      transform: scale(1); 
      box-shadow: 0 0 20px rgba(255, 68, 68, 0.8), 0 0 40px rgba(255, 68, 68, 0.4);
    }
    100% { 
      opacity: 1; 
      transform: scale(1.08); 
      box-shadow: 0 0 30px rgba(255, 68, 68, 1), 0 0 60px rgba(255, 68, 68, 0.6);
    }
  }
  
  @keyframes pulse-outer {
    0% { 
      opacity: 0.5; 
      transform: scale(1); 
    }
    100% { 
      opacity: 0.8; 
      transform: scale(1.12); 
    }
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
