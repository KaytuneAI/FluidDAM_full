/**
 * 图片处理工具函数
 * 从excel/utils/images.js迁移过来的通用函数
 */

/**
 * 压缩图片
 * @param {string} base64String - Base64编码的图片字符串
 * @param {number} maxSizeKB - 最大文件大小（KB）
 * @param {string} mimeType - MIME类型
 * @returns {Promise<string>} 压缩后的Base64字符串
 */
export async function compressImage(base64String, maxSizeKB = 100, mimeType = 'image/png') {
  try {
    // 创建图片对象
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // 等待图片加载
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = `data:${mimeType};base64,${base64String}`;
    });
    
    // 设置画布尺寸
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    // 绘制图片
    ctx.drawImage(img, 0, 0);
    
    // 计算当前大小
    const currentSizeKB = Math.round((base64String.length * 3) / 4 / 1024);
    
    // 如果已经小于目标大小，直接返回
    if (currentSizeKB <= maxSizeKB) {
      return base64String;
    }
    
    // 计算压缩比例
    let quality = 0.9;
    let compressedBase64 = '';
    
    // 迭代压缩直到达到目标大小
    while (quality > 0.1) {
      compressedBase64 = canvas.toDataURL(mimeType, quality).split(',')[1];
      const compressedSizeKB = Math.round((compressedBase64.length * 3) / 4 / 1024);
      
      if (compressedSizeKB <= maxSizeKB) {
        break;
      }
      
      quality -= 0.1;
    }
    
    return compressedBase64;
  } catch (error) {
    console.warn('压缩图片时出错:', error);
    return base64String; // 返回原始字符串
  }
}

/**
 * 获取图片文本覆盖层
 * @param {Array} images - 图片数组
 * @returns {Array} 文本覆盖层数组
 */
export function getImageTextOverlays(images) {
  const textOverlays = [];
  
  try {
    // 查找THE MACALLAN图片
    const macallanImage = images.find(img => 
      img.id && img.id.toLowerCase().includes('macallan')
    );
    
    if (macallanImage) {
      // 创建THE MACALLAN横幅覆盖层
      const imageX = macallanImage.x;
      const imageY = macallanImage.y;
      const imageWidth = macallanImage.width;
      const imageHeight = macallanImage.height;
      
      // 计算横幅位置（图片上方）
      const bannerY = imageY - 30;
      const bannerHeight = 25;
      
      textOverlays.push({
        text: 'THE MACALLAN',
        x: imageX,
        y: bannerY,
        width: imageWidth,
        height: bannerHeight,
        fontSize: 12,
        fontFamily: 'Arial, Helvetica, "Microsoft YaHei", "微软雅黑", "PingFang SC", "Hiragino Sans GB", "WenQuanYi Micro Hei", sans-serif',
        color: '#000000',
        backgroundColor: '#FFFFFF',
        type: 'banner'
      });
    }
  } catch (error) {
    console.warn('获取图片文本覆盖层时出错:', error);
  }
  
  return textOverlays;
}
