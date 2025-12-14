import React, { useState, useRef, useEffect } from 'react';
import './LinkPage.css';
import type { TempAsset } from '@shared/types/assets';
import {
  SessionBusKeys,
  writeSessionPayload,
  type LinkToBannerGenPayload,
  type LinkToSpotPayload,
} from '@shared/utils/sessionBus';
import { localAssetManager } from '@shared/utils/localAssetManager';
import { getBannerGenUrl, getFluidDAMUrl } from '../../utils/navigation';
import { getApiBaseUrl } from '../../utils/apiUtils';

interface ImageFile {
  file: File;
  url: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  dataUrl?: string;   // 可选缓存 base64
}

export const LinkPage: React.FC = () => {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'linkdam' | 'local' | 'local-storage'>('linkdam');
  const [localAssetCount, setLocalAssetCount] = useState<number>(0);
  const [localAssets, setLocalAssets] = useState<TempAsset[]>([]);
  const [selectedLocalAssetIds, setSelectedLocalAssetIds] = useState<Set<string>>(new Set());
  const [previewedLocalAssetId, setPreviewedLocalAssetId] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<ImageFile[]>([]);

  // 同步 imagesRef
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // 处理文件列表（从文件选择或 File System Access API）
  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    // 先清理旧的 URL（使用 ref 确保获取最新的 images）
    imagesRef.current.forEach(img => {
      try {
        URL.revokeObjectURL(img.url);
      } catch (error) {
        // 忽略已失效的 URL
      }
    });

    const imageFiles: ImageFile[] = [];
    const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];

    // 将 FileList 或 File[] 转换为数组
    const fileArray = Array.isArray(files) ? files : Array.from(files);

    // 遍历所有文件，筛选出图片
    for (const file of fileArray) {
      if (imageTypes.includes(file.type)) {
        const url = URL.createObjectURL(file);
        imageFiles.push({
          file,
          url,
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        });
      }
    }

    // 按文件名排序
    imageFiles.sort((a, b) => a.name.localeCompare(b.name));

    setImages(imageFiles);
    // 如果有图片，自动选中第一张
    setSelectedIndex(imageFiles.length > 0 ? 0 : -1);
    setSelectedIndices(new Set()); // 清空多选状态
    
    // 尝试从 webkitRelativePath 获取文件夹名（仅当使用传统文件选择器时）
    // 如果文件有 webkitRelativePath，说明是从传统文件选择器选择的
    const folderName = fileArray[0]?.webkitRelativePath?.split('/')[0];
    if (folderName) {
      setSelectedFolder(folderName);
    } else if (fileArray.length > 0 && !selectedFolder) {
      // 如果没有 webkitRelativePath 且还没有设置文件夹名，使用默认值
      setSelectedFolder('已选择文件夹');
    }
  };

  // 处理文件夹选择（文件选择器 - 降级方案）
  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    await processFiles(files);
  };

  // 使用 File System Access API 打开文件夹选择对话框
  const handleSelectFolder = async () => {
    // 检查是否支持 File System Access API
    if ('showDirectoryPicker' in window) {
      try {
        // @ts-ignore - File System Access API 可能没有类型定义
        const directoryHandle = await window.showDirectoryPicker({
          mode: 'read',
        });

        // 递归读取文件夹中的所有文件
        const files: File[] = [];
        const readDirectory = async (dirHandle: any, path = '') => {
          for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
              const file = await entry.getFile();
              files.push(file);
            } else if (entry.kind === 'directory') {
              await readDirectory(entry, `${path}/${entry.name}`);
            }
          }
        };

        await readDirectory(directoryHandle);
        
        // 处理文件（直接传递文件数组）
        await processFiles(files as any);
        
        // 设置文件夹名（在 processFiles 之后，避免被覆盖）
        setSelectedFolder(directoryHandle.name);
      } catch (error: any) {
        // 用户取消选择或其他错误
        if (error.name === 'AbortError' || error.name === 'NotAllowedError') {
          // 用户主动取消，不进行降级处理
          return;
        }
        // 其他错误才降级到传统方法
        console.error('Error selecting folder:', error);
        folderInputRef.current?.click();
      }
    } else {
      // 浏览器不支持 File System Access API，使用传统方法
      folderInputRef.current?.click();
    }
  };

  // 清理 URL 对象（只在组件卸载时）
  useEffect(() => {
    return () => {
      imagesRef.current.forEach(img => {
        try {
          URL.revokeObjectURL(img.url);
        } catch (error) {
          // 忽略已失效的 URL
        }
      });
    };
  }, []); // 只在组件卸载时清理

  // 处理缩略图点击
  const handleThumbnailClick = (index: number) => {
    setSelectedIndex(index);
  };

  // 处理复选框点击（切换多选状态）
  const handleCheckboxClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发缩略图点击
    setSelectedIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
    // 点击复选框选中后，右侧显示对应的图片
    setSelectedIndex(index);
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedIndices.size === images.length) {
      // 如果已全选，则取消全选
      setSelectedIndices(new Set());
    } else {
      // 否则全选
      setSelectedIndices(new Set(images.map((_, index) => index)));
    }
  };

  // 取消选择
  const handleDeselectAll = () => {
    setSelectedIndices(new Set());
  };

  // File → dataURL 的工具函数
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };


  // 导入SpotStudio
  const handleImportToSpotStudio = async () => {
    if (selectedIndices.size === 0) {
      alert('请先选择要导入的素材');
      return;
    }

    const selectedImages = Array.from(selectedIndices).map(i => images[i]);

    const assets: TempAsset[] = await Promise.all(
      selectedImages.map(async (img, index) => {
        let dataUrl = img.dataUrl;
        if (!dataUrl) {
          dataUrl = await fileToDataUrl(img.file);
          // 缓存到 images 中
          setImages(prev => {
            const updated = [...prev];
            const imgIndex = updated.findIndex(i => i.file === img.file);
            if (imgIndex >= 0) {
              updated[imgIndex] = { ...updated[imgIndex], dataUrl };
            }
            return updated;
          });
        }

        return {
          id: `${Date.now()}-${index}`,
          name: img.name,
          dataUrl,
          source: 'local-upload' as const,
          mimeType: img.type,
        };
      })
    );

    const payload: LinkToSpotPayload = {
      from: 'link',
      createdAt: Date.now(),
      assets,
    };

    // 检查是否通过统一入口访问（端口 3000）
    const currentPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    const isUnifiedEntry = currentPort === '3000' || currentPort === '';
    console.log('=== 导入 SpotStudio 开始 ===');
    console.log('当前域名:', window.location.origin);
    console.log('当前端口:', currentPort);
    console.log('是否通过统一入口访问:', isUnifiedEntry);
    console.log('素材数量:', payload.assets.length);
    
    let targetUrl: string;
    
    if (isUnifiedEntry) {
      // 通过统一入口，使用 sessionStorage（同域名可以共享）
      const key = SessionBusKeys.LINK_TO_SPOT;
      writeSessionPayload(key, payload);
      console.log('✅ 素材数据已保存到 sessionStorage:', key, payload.assets.length, '个素材');
      targetUrl = '/spotstudio';
      console.log('使用相对路径跳转:', targetUrl);
    } else {
      // 直接访问不同端口，通过 API 服务器临时存储
      console.log('跨端口访问，使用 API 服务器临时存储...');
      console.log('素材数量:', payload.assets.length);
      console.log('素材数据大小:', JSON.stringify(payload.assets).length, '字符');
      
      try {
        // 获取 API 地址
        const apiBaseUrl = getApiBaseUrl();
        
        if (!apiBaseUrl) {
          throw new Error('无法获取 API 地址');
        }
        
        console.log('API 地址:', apiBaseUrl);
        console.log('准备上传素材数据到:', `${apiBaseUrl}/api/link-to-spot-assets`);
        
        // 上传素材数据到服务器
        const response = await fetch(`${apiBaseUrl}/api/link-to-spot-assets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ assets: payload.assets }),
        });
        
        console.log('API 响应状态:', response.status, response.statusText);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('API 响应错误:', errorText);
          throw new Error(`HTTP错误: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        console.log('API 响应结果:', result);
        
        if (!result.success || !result.token) {
          throw new Error(result.message || '保存失败');
        }
        
        console.log('✅ 素材数据已保存到服务器，token:', result.token);
        
        // 将 token 作为 URL 参数传递
        targetUrl = getFluidDAMUrl();
        const url = new URL(targetUrl, window.location.href);
        url.searchParams.set('linkAssets', result.token);
        targetUrl = url.toString();
        
        console.log('使用完整 URL 跳转（带 token）:', targetUrl);
        console.log('跳转 URL 参数:', url.searchParams.toString());
      } catch (error: any) {
        console.error('❌ 通过 API 保存素材数据失败:', error);
        console.error('错误详情:', error.message, error.stack);
        alert(`保存素材数据失败：${error.message}\n\n请尝试通过统一入口（端口 3000）访问，或检查 API 服务器是否运行`);
        return;
      }
    }
    
    console.log('=== 导入 SpotStudio 结束 ===');
    console.log('最终跳转 URL:', targetUrl);
    console.log('准备跳转到 SpotStudio...');
    
    // 延迟一下，确保数据保存完成
    setTimeout(() => {
      console.log('执行跳转，目标 URL:', targetUrl);
      window.location.href = targetUrl;
    }, 100);
  };

  // 上一张
  const handlePrev = () => {
    if (selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  // 下一张
  const handleNext = () => {
    if (selectedIndex < images.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1);
      } else if (e.key === 'ArrowRight' && selectedIndex < images.length - 1) {
        setSelectedIndex(selectedIndex + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, images.length]);

  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const selectedImage = selectedIndex >= 0 && selectedIndex < images.length ? images[selectedIndex] : null;

  // 获取图片尺寸
  useEffect(() => {
    if (selectedImage) {
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = selectedImage.url;
    } else {
      setImageDimensions(null);
    }
  }, [selectedImage]);

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // 格式化日期
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN');
  };

  // 处理本地素材按钮点击
  const handleLocalMaterialClick = () => {
    setActiveTab('local');
    // 如果已经有图片，重新选择文件夹；如果没有图片，也打开选择器
    setTimeout(() => {
      handleSelectFolder();
    }, 100);
  };

  // 保存选中素材到本机
  const handleSaveToLocal = async () => {
    if (selectedIndices.size === 0) {
      alert('请先选择要保存到本机的素材');
      return;
    }

    const selectedImages = Array.from(selectedIndices).map(i => images[i]);

    try {
      const assets: TempAsset[] = await Promise.all(
        selectedImages.map(async (img, index) => {
          let dataUrl = img.dataUrl;
          if (!dataUrl) {
            dataUrl = await fileToDataUrl(img.file);
            // 缓存到 images 中
            setImages(prev => {
              const updated = [...prev];
              const imgIndex = updated.findIndex(i => i.file === img.file);
              if (imgIndex >= 0) {
                updated[imgIndex] = { ...updated[imgIndex], dataUrl };
              }
              return updated;
            });
          }

          return {
            id: `local-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
            name: img.name,
            dataUrl,
            source: 'local-upload' as const,
            mimeType: img.type,
          };
        })
      );

      const savedCount = await localAssetManager.saveAssets(assets);
      alert(`成功保存 ${savedCount} 个素材到本机！`);
      
      // 更新本机素材数量
      setLocalAssetCount(localAssetManager.getAssetCount());
      
      // 清空选择
      setSelectedIndices(new Set());
    } catch (error) {
      console.error('保存到本机失败:', error);
      alert('保存失败，请重试');
    }
  };

  // 当有图片但没有选中时，自动选中第一张
  useEffect(() => {
    if (activeTab === 'local' && images.length > 0 && selectedIndex === -1) {
      setSelectedIndex(0);
    }
  }, [activeTab, images.length, selectedIndex]);

  // 加载本机素材数量和列表
  useEffect(() => {
    const updateLocalAssets = async () => {
      try {
        const assets = await localAssetManager.loadAssets();
        setLocalAssets(assets);
        setLocalAssetCount(assets.length);
      } catch (error) {
        console.error('加载本机素材失败:', error);
      }
    };
    updateLocalAssets();
    // 定期更新（每5秒）
    const interval = setInterval(updateLocalAssets, 5000);
    return () => clearInterval(interval);
  }, []);

  // 当切换到本机素材标签页时，重新加载
  useEffect(() => {
    if (activeTab === 'local-storage') {
      const loadLocalAssets = async () => {
        try {
          const assets = await localAssetManager.loadAssets();
          setLocalAssets(assets);
          setLocalAssetCount(assets.length);
        } catch (error) {
          console.error('加载本机素材失败:', error);
        }
      };
      loadLocalAssets();
    }
  }, [activeTab]);

  // 删除选中的本机素材
  const handleDeleteLocalAssets = async () => {
    if (selectedLocalAssetIds.size === 0) {
      alert('请先选择要删除的素材');
      return;
    }

    if (!confirm(`确定要删除选中的 ${selectedLocalAssetIds.size} 个素材吗？`)) {
      return;
    }

    try {
      let deletedCount = 0;
      for (const id of selectedLocalAssetIds) {
        const success = await localAssetManager.deleteAsset(id);
        if (success) deletedCount++;
      }

      alert(`成功删除 ${deletedCount} 个素材`);
      
      // 重新加载本机素材
      const assets = await localAssetManager.loadAssets();
      setLocalAssets(assets);
      setLocalAssetCount(assets.length);
      
      // 清空选择
      setSelectedLocalAssetIds(new Set());
    } catch (error) {
      console.error('删除本机素材失败:', error);
      alert('删除失败，请重试');
    }
  };

  // 切换本机素材的选择状态
  const handleToggleLocalAssetSelection = (id: string) => {
    setSelectedLocalAssetIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // 全选/取消全选本机素材
  const handleSelectAllLocalAssets = () => {
    if (selectedLocalAssetIds.size === localAssets.length) {
      setSelectedLocalAssetIds(new Set());
    } else {
      setSelectedLocalAssetIds(new Set(localAssets.map(a => a.id)));
    }
  };

  return (
    <div className="link-page">
      <div className="link-page-header">
        <h1>素材链接</h1>
        {activeTab === 'local' && images.length > 0 && (
          <div className="folder-selector">
            <span className="image-count">📁 {selectedFolder} - 共 {images.length} 张图片</span>
            {localAssetCount > 0 && (
              <span className="local-asset-count" style={{ marginLeft: '16px', color: '#10b981', fontSize: '14px' }}>
                💾 本机已保存 {localAssetCount} 个素材
              </span>
            )}
          </div>
        )}
      </div>

      <div className="link-page-content">
        {/* 左侧：三个大按钮 */}
        <div className="link-page-left">
          <button
            type="button"
            className={`category-btn ${activeTab === 'local-storage' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('local-storage');
              setSelectedIndex(-1);
              setSelectedIndices(new Set());
            }}
          >
            本机素材 {localAssetCount > 0 && `(${localAssetCount})`}
          </button>
          <button
            type="button"
            className={`category-btn ${activeTab === 'local' ? 'active' : ''}`}
            onClick={handleLocalMaterialClick}
          >
            本地素材
          </button>
          <button
            type="button"
            className={`category-btn ${activeTab === 'linkdam' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('linkdam');
              setSelectedIndex(-1);
              setSelectedIndices(new Set()); // 清空多选状态
            }}
          >
            外部 Link
          </button>
        </div>

        {/* 右侧：素材列表和详细视图并排 */}
        <div className="link-page-right">
          <input
            ref={folderInputRef}
            type="file"
            {...({ webkitdirectory: '', directory: '' } as any)}
            multiple
            onChange={handleFolderSelect}
            style={{ display: 'none' }}
          />

          {/* 素材列表视图 */}
          <div className="material-list-view">
            {activeTab === 'local-storage' ? (
              localAssets.length === 0 ? (
                <div className="empty-state">
                  <div className="select-folder-prompt">
                    <div className="select-folder-icon">💾</div>
                    <div className="select-folder-text">本机暂无保存的素材</div>
                    <div className="hint" style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
                      在"本地素材"标签页选择素材后，点击"导入到本机"按钮保存
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="material-grid">
                    {localAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className={`material-item ${selectedLocalAssetIds.has(asset.id) ? 'multi-selected' : ''} ${previewedLocalAssetId === asset.id ? 'previewed' : ''}`}
                        onClick={() => setPreviewedLocalAssetId(asset.id)}
                      >
                        <div className="material-thumbnail">
                          <img 
                            src={asset.dataUrl || asset.url || ''} 
                            alt={asset.name}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#f0f0f0"/><text x="50" y="50" text-anchor="middle" fill="#999">加载失败</text></svg>';
                            }}
                          />
                          <div 
                            className={`material-checkbox ${selectedLocalAssetIds.has(asset.id) ? 'checked' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleLocalAssetSelection(asset.id);
                            }}
                            title={selectedLocalAssetIds.has(asset.id) ? '取消选择' : '选择'}
                          >
                            {selectedLocalAssetIds.has(asset.id) ? '✕' : ''}
                          </div>
                          {asset.source === 'ai-generated' && (
                            <div style={{
                              position: 'absolute',
                              top: '4px',
                              left: '4px',
                              background: 'rgba(0, 212, 255, 0.9)',
                              color: 'white',
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 500,
                            }}>
                              AI
                            </div>
                          )}
                        </div>
                        <div className="material-label" title={asset.name}>
                          {asset.name}
                        </div>
                        {asset.prompt && (
                          <div style={{
                            fontSize: '11px',
                            color: '#999',
                            marginTop: '4px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }} title={asset.prompt}>
                            {asset.prompt.substring(0, 20)}...
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="material-actions">
                    <button 
                      className="btn-select-all"
                      onClick={handleSelectAllLocalAssets}
                    >
                      {selectedLocalAssetIds.size === localAssets.length ? '取消全选' : '全选'}
                    </button>
                    <button 
                      className="btn-deselect-all"
                      onClick={() => setSelectedLocalAssetIds(new Set())}
                      disabled={selectedLocalAssetIds.size === 0}
                    >
                      取消选择
                    </button>
                    <button 
                      className="btn-delete"
                      onClick={handleDeleteLocalAssets}
                      disabled={selectedLocalAssetIds.size === 0}
                    >
                      从本机删除 {selectedLocalAssetIds.size > 0 && `(${selectedLocalAssetIds.size})`}
                    </button>
                  </div>
                </>
              )
            ) : activeTab === 'local' ? (
              images.length === 0 ? (
                <div className="empty-state">
                  <div className="select-folder-prompt">
                    <div className="select-folder-icon">📁</div>
                    <div className="select-folder-text">选择本地文件夹浏览图片</div>
                    <button
                      className="btn-select-folder-inline"
                      onClick={handleSelectFolder}
                    >
                      选择文件夹
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="material-grid">
                    {images.map((img, index) => (
                      <div
                        key={index}
                        className={`material-item ${selectedIndex === index ? 'selected' : ''} ${selectedIndices.has(index) ? 'multi-selected' : ''}`}
                        onClick={() => handleThumbnailClick(index)}
                      >
                        <div className="material-thumbnail">
                          <img src={img.url} alt={img.name} />
                          <div 
                            className={`material-checkbox ${selectedIndices.has(index) ? 'checked' : ''}`}
                            onClick={(e) => handleCheckboxClick(e, index)}
                            title={selectedIndices.has(index) ? '取消选择' : '选择'}
                          >
                            {selectedIndices.has(index) ? '✕' : ''}
                          </div>
                        </div>
                        <div className="material-label" title={img.name}>
                          {img.name}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="material-actions">
                    <button 
                      className="btn-select-all"
                      onClick={handleSelectAll}
                    >
                      {selectedIndices.size === images.length ? '取消全选' : '全选'}
                    </button>
                    <button 
                      className="btn-deselect-all"
                      onClick={handleDeselectAll}
                      disabled={selectedIndices.size === 0}
                    >
                      取消选择
                    </button>
                    <button 
                      className="btn-save-to-local"
                      onClick={handleSaveToLocal}
                      disabled={selectedIndices.size === 0}
                    >
                      导入到本机 {selectedIndices.size > 0 && `(${selectedIndices.size})`}
                    </button>
                  </div>
                </>
              )
            ) : (
              <div className="empty-state">
                <p>外部 Link 功能</p>
                <p className="hint">第三方 DAM 对接功能（待实现）</p>
              </div>
            )}
          </div>

          {/* 详细视图：大图 + meta信息 + 导航 */}
          <div className="detail-view">
            {activeTab === 'local-storage' && (previewedLocalAssetId || selectedLocalAssetIds.size > 0) ? (
              // 本机素材标签页：优先显示预览的素材，否则显示第一个选中的素材
              (() => {
                const assetIdToShow = previewedLocalAssetId || Array.from(selectedLocalAssetIds)[0];
                const selectedAsset = localAssets.find(a => a.id === assetIdToShow);
                return selectedAsset ? (
                  <>
                    <div className="detail-image-container">
                      <img 
                        src={selectedAsset.dataUrl || selectedAsset.url || ''} 
                        alt={selectedAsset.name}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#f0f0f0"/><text x="50" y="50" text-anchor="middle" fill="#999">加载失败</text></svg>';
                        }}
                      />
                    </div>
                    <div className="detail-meta-section">
                      <div className="detail-meta-content">
                        <h3>详细 meta 信息</h3>
                        <div className="details-list">
                          <div className="detail-item">
                            <span className="detail-label">文件名：</span>
                            <span className="detail-value">{selectedAsset.name}</span>
                          </div>
                          {selectedAsset.mimeType && (
                            <div className="detail-item">
                              <span className="detail-label">文件类型：</span>
                              <span className="detail-value">{selectedAsset.mimeType}</span>
                            </div>
                          )}
                          {selectedAsset.width && selectedAsset.height && (
                            <div className="detail-item">
                              <span className="detail-label">尺寸：</span>
                              <span className="detail-value">{selectedAsset.width} × {selectedAsset.height} 像素</span>
                            </div>
                          )}
                          {selectedAsset.source === 'ai-generated' && selectedAsset.prompt && (
                            <div className="detail-item">
                              <span className="detail-label">提示词：</span>
                              <span className="detail-value" title={selectedAsset.prompt}>{selectedAsset.prompt}</span>
                            </div>
                          )}
                          {selectedAsset.generatedAt && (
                            <div className="detail-item">
                              <span className="detail-label">生成时间：</span>
                              <span className="detail-value">{formatDate(selectedAsset.generatedAt)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-preview">
                    <p>请从左侧选择一张图片</p>
                  </div>
                );
              })()
            ) : activeTab === 'local' && selectedIndex >= 0 && selectedImage ? (
              <>
                <div className="detail-image-container">
                  <div 
                    className={`detail-checkbox ${selectedIndices.has(selectedIndex) ? 'checked' : ''}`}
                    onClick={() => {
                      setSelectedIndices(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(selectedIndex)) {
                          newSet.delete(selectedIndex);
                        } else {
                          newSet.add(selectedIndex);
                        }
                        return newSet;
                      });
                    }}
                    title={selectedIndices.has(selectedIndex) ? '取消选择' : '选择'}
                  >
                    {selectedIndices.has(selectedIndex) ? '✕' : ''}
                  </div>
                  <img src={selectedImage.url} alt={selectedImage.name} />
                </div>
                <div className="detail-meta-section">
                  <div className="detail-meta-content">
                    <h3>详细 meta 信息</h3>
                    <div className="details-list">
                      <div className="detail-item">
                        <span className="detail-label">文件名：</span>
                        <span className="detail-value">{selectedImage.name}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">文件类型：</span>
                        <span className="detail-value">{selectedImage.type}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">文件大小：</span>
                        <span className="detail-value">{formatFileSize(selectedImage.size)}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">修改时间：</span>
                        <span className="detail-value">{formatDate(selectedImage.lastModified)}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">尺寸：</span>
                        <span className="detail-value">
                          {imageDimensions 
                            ? `${imageDimensions.width} × ${imageDimensions.height} 像素`
                            : '加载中...'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="detail-navigation">
                    <button
                      className="nav-arrow prev-arrow"
                      onClick={handlePrev}
                      disabled={selectedIndex === 0}
                      title="上一张 (←)"
                    >
                      ◀
                    </button>
                    <button
                      className="nav-arrow next-arrow"
                      onClick={handleNext}
                      disabled={selectedIndex === images.length - 1}
                      title="下一张 (→)"
                    >
                      ▶
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-preview">
                <p>请从左侧选择一张图片</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
