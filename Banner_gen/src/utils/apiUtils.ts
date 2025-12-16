// API工具函数 - 处理云端部署时的API端点问题

// 动态获取API基础URL
export function getApiBaseUrl(): string {
  // 优先检查环境变量 VITE_API_URL（支持 .env 配置）
  const envApiUrl = import.meta.env.VITE_API_URL;
  if (envApiUrl) {
    console.log('[getApiBaseUrl] 使用环境变量 VITE_API_URL:', envApiUrl);
    return envApiUrl;
  }
  
  // 检查是否有全局自定义API地址（运行时覆盖）
  const customApiUrl = (window as any).BANNER_GEN_API_URL;
  if (customApiUrl) {
    console.log('[getApiBaseUrl] 使用自定义 API 地址:', customApiUrl);
    return customApiUrl;
  }
  
  // 在开发环境中（localhost）
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const port = window.location.port;
    
    console.log('[getApiBaseUrl] 开发环境，当前端口:', port);
    
    // 如果通过统一入口（端口 3000）访问，使用相对路径让 vite 代理转发
    if (port === '3000' || port === '') {
      console.log('[getApiBaseUrl] 使用统一入口，返回相对路径 /api');
      return '/api'; // 使用相对路径，会被 vite proxy 转发到 3001
    }
    
    // 如果直接访问 Banner_gen 前端（端口 5173 或 5174），使用 3001 端口（统一后端）
    if (port === '5173' || port === '5174') {
      const apiUrl = 'http://localhost:3001/api';
      console.log('[getApiBaseUrl] 直接访问 Banner_gen 前端（端口', port, '），返回:', apiUrl);
      return apiUrl;
    }
    
    // 默认使用 3001（统一后端）
    const apiUrl = 'http://localhost:3001/api';
    console.log('[getApiBaseUrl] 端口不匹配，默认返回:', apiUrl);
    return apiUrl;
  }
  
  // 生产环境：使用相对路径，让 Nginx 或 vite 代理处理路由
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port;
  
  // 如果使用 Nginx 反向代理，API路径应该通过 Nginx 路由到后端
  // 检查是否在标准端口（80/443）上运行
  if (port === '' || port === '80' || port === '443') {
    return `${protocol}//${hostname}/api`;
  }
  
  // 如果通过统一入口访问，使用相对路径
  if (port === '3000') {
    return '/api';
  }
  
  // 生产环境：统一使用 3001（统一后端）
  return `${protocol}//${hostname}:3001/api`;
}

// 上传zip文件并获取分享链接
export async function shareBannerZip(zipBlob: Blob): Promise<{
  success: boolean;
  shareId?: string;
  shareUrl?: string;
  downloadUrl?: string;
  message?: string;
  error?: string;
}> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl) {
      throw new Error('API base URL not available');
    }
    
    // 创建FormData
    const formData = new FormData();
    formData.append('zipFile', zipBlob, 'banners.zip');
    
    // 设置超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时（大文件上传）
    
    // 构建正确的 API URL
    // getApiBaseUrl() 现在统一返回包含 /api 的 URL（如 http://localhost:3001/api 或 /api）
    // 直接拼接 /share-banner-zip 即可
    const shareUrl = `${apiBaseUrl}/share-banner-zip`;
    
    console.log('[shareBannerZip] apiBaseUrl:', apiBaseUrl);
    console.log('[shareBannerZip] 构建的 API URL:', shareUrl);
    
    const response = await fetch(shareUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('上传超时，请检查网络连接或文件大小');
    }
    throw error;
  }
}

