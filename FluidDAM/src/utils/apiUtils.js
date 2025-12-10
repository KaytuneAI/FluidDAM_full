// API工具函数 - 处理云端部署时的API端点问题

// 动态获取API基础URL
export function getApiBaseUrl() {
  // 检查是否有自定义API地址
  const customApiUrl = window.FLUIDDAM_API_URL || process.env.REACT_APP_API_URL;
  if (customApiUrl) {
    return customApiUrl;
  }
  
  // 在开发环境中
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const port = window.location.port;
    
    // 如果通过统一入口（端口 3000）访问，使用相对路径让 vite 代理转发
    if (port === '3000' || port === '') {
      return '/api'; // 使用相对路径，会被 vite proxy 转发到 3001
    }
    
    // 如果直接访问 FluidDAM 前端（端口 5173），使用 3001 端口
    if (port === '5173') {
      return 'http://localhost:3001';
    }
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
  
  // 否则使用当前主机和3001端口
  return `${protocol}//${hostname}:3001`;
}

// 检查API是否可用
export async function checkApiAvailability() {
  try {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl) return false;
    
    // 使用AbortController设置超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时
    
    const response = await fetch(`${apiBaseUrl}/api/get-image-data`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('API连接超时，将使用localStorage');
    } else {
      console.warn('API不可用，将使用localStorage:', error.message);
    }
    return false;
  }
}

// 保存图片数据到API
export async function saveImageDataToApi(imageData) {
  try {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl) {
      throw new Error('API base URL not available');
    }
    
    // 设置超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
    
    const response = await fetch(`${apiBaseUrl}/api/save-image-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(imageData),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('API连接超时');
    }
    throw error;
  }
}

// 从API获取图片数据
export async function getImageDataFromApi() {
  try {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl) {
      throw new Error('API base URL not available');
    }
    
    // 设置超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时
    
    const response = await fetch(`${apiBaseUrl}/api/get-image-data`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('API连接超时');
    }
    throw error;
  }
}

// 保存图片数据（带fallback到localStorage）
export async function saveImageData(imageData) {
  try {
    // 首先尝试使用API
    const result = await saveImageDataToApi(imageData);
    return result;
  } catch (apiError) {
    // API失败，回退到localStorage
    console.warn('API保存失败，回退到localStorage:', apiError);
    
    const savedData = localStorage.getItem('imagesDatabase') || '{"images":[],"lastUpdated":"","totalImages":0}';
    const database = JSON.parse(savedData);
    database.images.push(imageData);
    database.lastUpdated = new Date().toISOString();
    database.totalImages = database.images.length;
    localStorage.setItem('imagesDatabase', JSON.stringify(database));
    
    return { success: true, message: '数据已保存到本地存储', totalImages: database.totalImages };
  }
}

// 获取图片数据（带fallback到localStorage）
export async function getImageData() {
  try {
    // 首先尝试使用API
    return await getImageDataFromApi();
  } catch (apiError) {
    // API失败，回退到localStorage
    console.warn('API获取失败，回退到localStorage:', apiError);
    
    const savedData = localStorage.getItem('imagesDatabase');
    if (savedData) {
      return JSON.parse(savedData);
    } else {
      return { images: [], lastUpdated: "", totalImages: 0 };
    }
  }
}
