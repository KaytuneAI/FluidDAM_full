// 即梦 AI API 工具函数
// 文档：https://www.volcengine.com/docs/85621/1817045?lang=zh

export interface JimengAiConfig {
  apiKey: string;
  apiSecret?: string;
  baseUrl?: string;
}

export interface JimengAiImageGenRequest {
  prompt: string;
  imageUrl?: string; // 图生图时使用（URL 或 dataURL）
  imageBase64?: string; // 图生图时使用（纯 base64 或 dataURL）
  mode?: 't2i' | 'i2i'; // 模式：t2i=文生图, i2i=以图改图（可选，会根据是否有图片自动判断）
  width?: number;
  height?: number;
  style?: string;
  negativePrompt?: string;
}

export interface JimengAiImageGenResponse {
  success: boolean;
  mode?: 't2i' | 'i2i'; // 实际使用的模式
  imageUrl?: string;
  imageBase64?: string;
  taskId?: string;
  error?: string;
  message?: string;
}

// 注意：前端不再需要读取 API Key/Secret，所有认证由后端处理
// 此函数已废弃，保留仅为兼容性（如果其他地方还在使用）
function getJimengAiConfig(): JimengAiConfig {
  // 前端不再读取敏感信息，只返回 baseUrl（如果需要）
  // 注意：baseUrl 实际上也不应该在前端使用，所有请求都通过后端代理
  const baseUrl = 'https://visual.volcengineapi.com'; // 固定值，仅用于类型定义
  
  return {
    apiKey: '', // 不再使用，前端不应包含 ACCESSKEY
    apiSecret: '', // 不再使用，前端不应包含 SECRETKEY
    baseUrl,
  };
}

// 将图片 URL 或 base64 转换为 base64
async function imageToBase64(imageUrl: string): Promise<string> {
  try {
    // 如果是 base64，直接返回
    if (imageUrl.startsWith('data:image')) {
      return imageUrl;
    }

    // 如果是 URL，先获取图片
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    throw new Error(`图片转换失败: ${error}`);
  }
}

// 生成即梦 AI 签名（如果需要）
function generateSignature(config: JimengAiConfig, params: any): string {
  // 根据即梦 AI 文档实现签名逻辑
  // 这里先返回空字符串，需要根据实际文档调整
  return '';
}

// 获取统一 API 服务器地址（与 FluidDAM 共用 3001 端口）
function getBannerGenApiUrl(): string {
  // 使用与 FluidDAM 相同的 API 工具函数逻辑
  // 在开发环境中
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const port = window.location.port;
    // 统一 API 服务器运行在 3001 端口
    if (port === '5174' || port === '5173' || port === '') {
      return 'http://localhost:3001';
    }
    return 'http://localhost:3001';
  }
  
  // 生产环境：使用相对路径，让 Nginx 代理处理
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port;
  
  if (port === '' || port === '80' || port === '443') {
    return `${protocol}//${hostname}/api`;
  }
  
  return `${protocol}//${hostname}:3001`;
}

// 调用即梦 AI 图片生成 API（通过后端代理，避免 CORS 问题）
// 文档：https://www.volcengine.com/docs/85621/1817045?lang=zh
// 注意：jimeng_t2i_v40 要求固定尺寸 1024x1024，不允许自定义尺寸
export async function generateImageWithJimengAi(
  request: JimengAiImageGenRequest
): Promise<JimengAiImageGenResponse> {
  try {
    // jimeng_t2i_v40 固定使用 1024x1024，不允许自定义尺寸
    const width = 1024;
    const height = 1024;

    // 通过后端代理调用，避免 CORS 问题
    const apiBaseUrl = getBannerGenApiUrl();
    const proxyEndpoint = `${apiBaseUrl}/api/jimeng-ai/generate`;

    console.log('[即梦 AI] 通过代理调用:', proxyEndpoint);
    console.log('[即梦 AI] 请求参数:', { 
      prompt: request.prompt,
      width: width,
      height: height,
      hasImage: !!request.imageUrl,
      style: request.style,
      hasNegativePrompt: !!request.negativePrompt,
    });

    // 发送请求到后端代理
    const response = await fetch(proxyEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        imageUrl: request.imageUrl, // 图生图时使用（URL 或 dataURL）
        imageBase64: request.imageBase64, // 图生图时使用（纯 base64 或 dataURL）
        mode: request.mode, // 模式：t2i=文生图, i2i=以图改图（可选）
        width: width,
        height: height,
        style: request.style,
        negativePrompt: request.negativePrompt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText || '请求失败' };
      }
      throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // 后端代理已经处理了响应格式
    return data;
  } catch (error: any) {
    console.error('即梦 AI 调用失败:', error);
    return {
      success: false,
      error: error.message || '生成失败，请检查网络连接和 API 配置',
    };
  }
}

// Prompt enrichment: 根据模板要求增强提示词
export function enrichPrompt(
  userPrompt: string,
  templateWidth: number,
  templateHeight: number,
  isImageToImage: boolean = false
): string {
  // 基础增强：添加尺寸和质量要求
  const sizeInfo = `${templateWidth}x${templateHeight}`;
  
  // 构建增强后的提示词
  let enrichedPrompt = userPrompt;

  // 如果是图生图，添加保持原图风格的提示
  if (isImageToImage) {
    enrichedPrompt = `基于原图风格，${enrichedPrompt}`;
  }

  // 添加通用质量要求
  const qualityEnhancements = [
    '高质量',
    '高清',
    '专业',
    '细节丰富',
    '色彩鲜艳',
    '适合电商广告',
  ];

  // 添加尺寸适配提示
  enrichedPrompt += `，尺寸${sizeInfo}像素，${qualityEnhancements.join('、')}`;

  return enrichedPrompt;
}

