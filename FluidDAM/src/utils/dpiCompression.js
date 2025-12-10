/**
 * 96 DPI智能压缩工具
 * 只限制DPI为96，不限制文件大小，保持原始长宽比和像素尺寸
 */

/**
 * 检测图片的实际DPI
 * @param {Image} img - 图片对象
 * @param {number} displayWidth - 显示宽度（像素）
 * @param {number} displayHeight - 显示高度（像素）
 * @returns {number} 实际DPI
 */
export function detectImageDPI(img, displayWidth = null, displayHeight = null) {
  try {
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    
    // 如果没有提供显示尺寸，使用图片的自然尺寸
    const actualDisplayWidth = displayWidth || naturalWidth;
    const actualDisplayHeight = displayHeight || naturalHeight;
    
    // 计算DPI：假设标准屏幕DPI为96
    // DPI = (像素尺寸 / 显示尺寸) * 96
    const dpiX = (naturalWidth / actualDisplayWidth) * 96;
    const dpiY = (naturalHeight / actualDisplayHeight) * 96;
    
    // 返回平均DPI
    return Math.round((dpiX + dpiY) / 2);
  } catch (error) {
    console.warn('检测图片DPI失败:', error);
    return 96; // 默认返回96 DPI
  }
}

/**
 * 96 DPI智能压缩
 * 只限制DPI为96，不限制文件大小，保持原始长宽比和像素尺寸
 * @param {string} base64String - 原始Base64字符串
 * @param {string} mimeType - 图片MIME类型
 * @param {number} targetDPI - 目标DPI（默认96）
 * @returns {Promise<string>} 压缩后的Base64字符串
 */
export async function compressTo96DPI(base64String, mimeType = 'image/png', targetDPI = 96) {
  try {
    // 开始96 DPI智能压缩
    
    // 创建图片对象
    const img = new Image();
    const imageUrl = `data:${mimeType};base64,${base64String}`;
    
    return new Promise((resolve, reject) => {
      img.onload = async () => {
        try {
          const naturalWidth = img.naturalWidth;
          const naturalHeight = img.naturalHeight;
          
          // 检测当前DPI
          const currentDPI = detectImageDPI(img);
          
          // 如果DPI已经≤96，无需压缩
          if (currentDPI <= targetDPI) {
            resolve(base64String);
            return;
          }
          
          // 计算96 DPI的压缩比例
          const compressionRatio = targetDPI / currentDPI;
          
          // 计算压缩后的尺寸（保持长宽比）
          const newWidth = Math.round(naturalWidth * compressionRatio);
          const newHeight = Math.round(naturalHeight * compressionRatio);
          
          // 创建画布进行压缩
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          canvas.width = newWidth;
          canvas.height = newHeight;
          
          // 设置高质量渲染
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          // 绘制压缩后的图片
          ctx.drawImage(img, 0, 0, newWidth, newHeight);
          
          // Edge浏览器兼容性修复：PNG格式不支持quality参数
          // 对于PNG格式，转换为JPEG以支持压缩；对于JPEG/WebP，使用quality参数
          let outputMimeType = mimeType;
          let quality = 0.9;
          
          // 如果原始格式是PNG，转换为JPEG以支持压缩（Edge浏览器兼容性）
          if (mimeType === 'image/png' || mimeType === 'image/png;base64') {
            outputMimeType = 'image/jpeg';
            quality = 0.85; // JPEG使用0.85质量，在文件大小和质量之间平衡
          }
          
          // 转换为Base64，根据格式使用相应的参数
          let compressedBase64;
          if (outputMimeType === 'image/jpeg' || outputMimeType === 'image/webp') {
            // JPEG和WebP支持quality参数
            compressedBase64 = canvas.toDataURL(outputMimeType, quality).split(',')[1];
          } else {
            // PNG等其他格式不支持quality参数
            compressedBase64 = canvas.toDataURL(outputMimeType).split(',')[1];
          }
          
          resolve(compressedBase64);
        } catch (error) {
          console.warn('96 DPI压缩失败，使用原始图片:', error);
          resolve(base64String);
        }
      };
      
      img.onerror = () => {
        console.warn('图片加载失败，使用原始Base64');
        resolve(base64String);
      };
      
      img.src = imageUrl;
    });
  } catch (error) {
    console.warn('96 DPI压缩过程出错，使用原始图片:', error);
    return base64String;
  }
}

/**
 * 批量96 DPI压缩
 * @param {Array} images - 图片数组，每个元素包含base64String和mimeType
 * @param {number} targetDPI - 目标DPI（默认96）
 * @returns {Promise<Array>} 压缩后的图片数组
 */
export async function batchCompressTo96DPI(images, targetDPI = 96) {
  const compressedImages = [];
  
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    
    try {
      const compressedBase64 = await compressTo96DPI(
        image.base64String, 
        image.mimeType, 
        targetDPI
      );
      
      compressedImages.push({
        ...image,
        base64String: compressedBase64,
        compressed: compressedBase64 !== image.base64String
      });
    } catch (error) {
      console.warn(`图片 ${i + 1} 压缩失败:`, error);
      compressedImages.push({
        ...image,
        compressed: false
      });
    }
  }
  
  return compressedImages;
}

/**
 * 验证96 DPI压缩效果
 * @param {string} base64String - 压缩后的Base64字符串
 * @param {string} mimeType - 图片MIME类型
 * @returns {Promise<Object>} 验证结果
 */
export async function validate96DPICompression(base64String, mimeType = 'image/png') {
  try {
    const img = new Image();
    const imageUrl = `data:${mimeType};base64,${base64String}`;
    
    return new Promise((resolve) => {
      img.onload = () => {
        const currentDPI = detectImageDPI(img);
        const sizeKB = Math.round((base64String.length * 3) / 4 / 1024);
        
        resolve({
          dpi: currentDPI,
          sizeKB: sizeKB,
          width: img.naturalWidth,
          height: img.naturalHeight,
          meetsStandard: currentDPI <= 96
        });
      };
      
      img.onerror = () => {
        resolve({
          dpi: 0,
          sizeKB: 0,
          width: 0,
          height: 0,
          meetsStandard: false,
          error: '图片加载失败'
        });
      };
      
      img.src = imageUrl;
    });
  } catch (error) {
    return {
      dpi: 0,
      sizeKB: 0,
      width: 0,
      height: 0,
      meetsStandard: false,
      error: error.message
    };
  }
}

