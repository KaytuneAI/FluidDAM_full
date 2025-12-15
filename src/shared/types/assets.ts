// 统一的素材资产类型，兼容本地文件和外部 DAM URL

export type AssetSource = 'local-upload' | 'external-url' | 'dam-api' | 'ai-generated';

export type TempAsset = {
  id: string;          // 唯一 ID（可以是 uuid 或 `${Date.now()}-${index}`）
  name: string;        // 文件名或逻辑名称

  // 渲染用：优先 dataUrl，没有则用 url
  url?: string;        // HTTP(S) 链接，比如外部 DAM / CDN
  dataUrl?: string;    // base64 data URL，用于本地上传/导出

  source: AssetSource;

  // 预留字段，方便未来接 DAM
  damId?: string;      // 外部 DAM 的 asset id（如有）
  mimeType?: string;
  width?: number;
  height?: number;

  // AI 生成相关字段
  prompt?: string;        // 生成时使用的提示词
  generatedAt?: number;   // 生成时间戳
  templateSize?: string;  // 模板尺寸（如 "800x800"）
};








