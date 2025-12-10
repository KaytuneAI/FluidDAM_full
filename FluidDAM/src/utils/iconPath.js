/**
 * 统一处理资源路径的工具函数
 * 确保在生产环境中路径正确包含 /spotstudio/ 前缀
 * 
 * @param {string} resourcePath - 资源路径，如 'icons/load_canvas.png' 或 'image/kaytuneai logo.png'
 * @returns {string} 完整的资源路径
 */
export function getIconPath(resourcePath) {
  // 获取 BASE_URL，在生产环境中应该是 /spotstudio/
  const baseUrl = import.meta.env.BASE_URL || '';
  
  // 确保 baseUrl 以 / 结尾（如果没有的话）
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  
  // 确保 resourcePath 不以 / 开头
  const normalizedPath = resourcePath.startsWith('/') ? resourcePath.slice(1) : resourcePath;
  
  return `${normalizedBase}${normalizedPath}`;
}

/**
 * 获取图片路径（getIconPath 的别名，用于语义清晰）
 */
export function getImagePath(imagePath) {
  return getIconPath(imagePath);
}

