// 跨浏览器文件下载工具函数

/**
 * 检测浏览器类型
 */
export function detectBrowser() {
  const userAgent = navigator.userAgent;
  
  if (userAgent.includes('Edg/')) {
    return 'edge';
  } else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
    return 'chrome';
  } else if (userAgent.includes('Firefox/')) {
    return 'firefox';
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
    return 'safari';
  } else if (userAgent.includes('MSIE') || userAgent.includes('Trident/')) {
    return 'ie';
  } else {
    return 'unknown';
  }
}

/**
 * 跨浏览器文件下载
 * @param {Blob} blob - 要下载的文件blob
 * @param {string} fileName - 文件名
 * @param {Function} onSuccess - 下载成功回调
 * @param {Function} onError - 下载失败回调
 */
export function downloadFile(blob, fileName, onSuccess = null, onError = null) {
  try {
    console.log('📥 downloadFile: 开始下载，文件名:', fileName, '大小:', blob.size, '字节');
    const browser = detectBrowser();
    console.log('🌐 检测到浏览器:', browser);
    
    // 旧版IE浏览器
    if (browser === 'ie' && window.navigator.msSaveBlob) {
      window.navigator.msSaveBlob(blob, fileName);
      if (onSuccess) onSuccess(fileName);
      return true;
    }
    
    // 现代浏览器
    const url = URL.createObjectURL(blob);
    console.log('🔗 创建对象URL:', url);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    
    // 添加到DOM
    document.body.appendChild(a);
    console.log('✅ 下载链接已添加到DOM');
    
    // 设置成功回调
    const handleSuccess = () => {
      console.log('✅ 下载成功回调触发');
      if (onSuccess) onSuccess(fileName);
    };
    
    // 设置错误回调
    const handleError = (error) => {
      console.error('❌ 下载错误回调触发:', error);
      if (onError) onError(error);
    };
    
    if (browser === 'edge' || browser === 'firefox') {
      // Edge和Firefox - 直接触发下载，立即成功
      console.log('🖱️ Edge/Firefox: 触发点击事件');
      const event = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
      });
      a.dispatchEvent(event);
      
      // Edge和Firefox通常直接下载，延迟一点时间后调用成功回调
      setTimeout(handleSuccess, 200);
    } else if (browser === 'chrome' || browser === 'safari') {
      // Chrome和Safari - 会弹出保存对话框，需要等待用户操作
      console.log('🖱️ Chrome/Safari: 触发点击事件');
      a.click();
      
      // 对于Chrome和Safari，不自动显示成功通知
      // 因为用户需要通过浏览器的保存对话框完成操作
      // 如果用户取消了对话框，我们不应该显示成功消息
      // 所以这里不调用 handleSuccess，让浏览器自己处理
      // 如果需要，可以监听下载完成事件，但这不是必需的
    } else {
      // 其他浏览器
      console.log('🖱️ 其他浏览器: 触发点击事件');
      a.click();
      setTimeout(handleSuccess, 200);
    }
    
    // 清理
    setTimeout(() => {
      try {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
        console.log('🧹 已清理下载链接');
      } catch (cleanupError) {
        console.warn('清理下载链接时出错:', cleanupError);
      }
    }, 1000);
    
    console.log('✅ downloadFile: 函数执行完成');
    return true;
  } catch (error) {
    console.error('❌ downloadFile: 文件下载失败:', error);
    console.error('错误堆栈:', error.stack);
    if (onError) onError(error);
    return false;
  }
}

/**
 * 下载JSON数据
 * @param {Object} data - JSON数据对象
 * @param {string} fileName - 文件名（不包含扩展名）
 * @param {Function} onSuccess - 下载成功回调
 * @param {Function} onError - 下载失败回调
 */
export function downloadJSON(data, fileName, onSuccess = null, onError = null) {
  try {
    console.log('📦 downloadJSON: 开始序列化数据...');
    const jsonString = JSON.stringify(data, null, 2);
    console.log('✅ downloadJSON: 数据序列化完成，大小:', jsonString.length, '字节');
    
    const blob = new Blob([jsonString], { type: 'application/json' });
    const fullFileName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
    
    console.log('📥 downloadJSON: 准备下载文件:', fullFileName);
    const result = downloadFile(blob, fullFileName, onSuccess, onError);
    console.log('✅ downloadJSON: downloadFile调用完成，返回值:', result);
    return result;
  } catch (error) {
    console.error('❌ downloadJSON: 发生错误:', error);
    if (onError) {
      onError(error);
    }
    throw error;
  }
}

/**
 * 下载文本文件
 * @param {string} text - 文本内容
 * @param {string} fileName - 文件名
 * @param {string} mimeType - MIME类型
 */
export function downloadText(text, fileName, mimeType = 'text/plain') {
  const blob = new Blob([text], { type: mimeType });
  return downloadFile(blob, fileName);
}

/**
 * 显示下载提示
 * @param {string} fileName - 文件名
 * @param {boolean} success - 是否成功
 */
export function showDownloadNotification(fileName, success = true) {
  if (success) {
    
    // 可以在这里添加更友好的用户提示
    // 比如显示一个toast通知
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 10000;
      font-family: Arial, sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    notification.textContent = `文件已保存: ${fileName}`;
    document.body.appendChild(notification);
    
    // 3秒后自动移除
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  } else {
    console.error(`文件保存失败: ${fileName}`);
  }
}
