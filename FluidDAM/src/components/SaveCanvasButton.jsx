import React from "react";
import { getSnapshot } from "tldraw";
import { downloadJSON, showDownloadNotification } from '../utils/downloadUtils.js';
import { getImageData } from '../utils/apiUtils.js';
import { compressTo96DPI } from '../utils/dpiCompression.js';
import { getIconPath } from '../utils/iconPath.js';

export default function SaveCanvasButton({ editor }) {
  const saveCanvas = async () => {
    console.log('🔄 保存画布按钮被点击');
    
    if (!editor) {
      console.error('❌ Editor未初始化');
      alert('画布未初始化，请刷新页面重试');
      return;
    }

    try {
      console.log('📦 开始保存流程...');
      
      // 获取当前画布的所有形状
      const currentShapes = editor.getCurrentPageShapes();
      const imageShapes = currentShapes.filter(shape => shape.type === 'image');
      console.log(`📊 当前画布: ${currentShapes.length} 个形状, ${imageShapes.length} 张图片`);
      
      // 导出画布状态（包含完整的图片数据）
      let canvasData = getSnapshot(editor.store);
      console.log('✅ 已获取画布快照');
      
      // 暂时禁用图片压缩，先确保基本保存功能正常
      // 图片压缩可以在后台异步进行，不阻塞保存流程
      // TODO: 后续可以添加可选的压缩选项
      
      // 获取图片信息
      const imageInfo = [];
      for (const shape of imageShapes) {
        try {
          // 直接从shape中获取图片信息
          const assetId = shape.props.assetId;
          
          // 尝试从后端API或localStorage获取文件名
          let fileName = `image_${shape.id}`;
          try {
            const database = await getImageData();
            const imageData = database.images.find(img => img.id === shape.id);
            if (imageData) {
              fileName = imageData.fileName;
            }
          } catch {
            // 使用默认名称
          }
          
          imageInfo.push({
            shapeId: shape.id,
            assetId: assetId,
            fileName: fileName,
            fileType: 'image/jpeg', // 默认类型
            width: shape.props.w,
            height: shape.props.h,
            x: shape.x,
            y: shape.y,
            rotation: shape.rotation || 0,
            scale: shape.props.scale || { x: 1, y: 1 }
          });
          
        } catch (error) {
          console.warn('处理图片信息时出错:', error);
        }
      }
      
      // 获取当前页面ID
      const currentPageId = editor.getCurrentPageId();
      console.log('📄 当前页面ID:', currentPageId);
      
      // 创建保存文件的内容
      const saveData = {
        version: '1.0',
        savedAt: new Date().toISOString(),
        canvasData: canvasData,
        currentPageId: currentPageId,
        imageInfo: imageInfo,
        totalImages: imageInfo.length
      };
      
      console.log('📝 保存数据已准备，大小:', JSON.stringify(saveData).length, '字节');
      
      // 使用统一的下载工具
      const fileName = `canvas_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`;
      console.log('💾 准备下载文件:', fileName);
      
      // 定义成功和失败回调
      const onDownloadSuccess = (fileName) => {
        console.log('✅ 文件下载成功:', fileName);
        showDownloadNotification(fileName, true);
      };
      
      const onDownloadError = (error) => {
        console.error('❌ 文件下载失败:', error);
        showDownloadNotification(fileName, false);
        alert('文件下载失败，请检查浏览器下载设置或查看控制台');
      };
      
      // 开始下载
      console.log('🚀 开始触发下载...');
      try {
        downloadJSON(saveData, fileName, onDownloadSuccess, onDownloadError);
        console.log('✅ 下载函数已调用');
      } catch (downloadError) {
        console.error('❌ 调用下载函数时出错:', downloadError);
        throw downloadError;
      }
      
    } catch (error) {
      console.error('❌ 保存画布时发生错误:', error);
      console.error('错误堆栈:', error.stack);
      alert('保存失败: ' + (error.message || '未知错误，请查看控制台获取详细信息'));
    }
  };

  return (
      <button
        onClick={saveCanvas}
       title="保存画布"
       style={{
         fontSize: 12,
         padding: "2px",
         border: "0.5px solid #dee2e6",
         borderRadius: 2,
         background: "#dee2e6",
         color: "white",
         cursor: "pointer",
         fontWeight: "bold",
         whiteSpace: "nowrap",
         width: 40,
         height: 40,
         display: "flex",
         alignItems: "center",
         justifyContent: "center"
       }}
      >
        <img src={getIconPath('icons/save_canvas.png')} alt="保存画布" style={{width: 32, height: 32}} />
      </button>
  );
}
