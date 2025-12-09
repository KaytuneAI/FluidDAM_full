import React, { useState, useRef, useEffect } from 'react';
import './LinkPage.css';

interface ImageFile {
  file: File;
  url: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export const LinkPage: React.FC = () => {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'linkdam' | 'local'>('linkdam');
  const folderInputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<ImageFile[]>([]);

  // 同步 imagesRef
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // 处理文件夹选择
  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
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

    // 遍历所有文件，筛选出图片
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
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
    setSelectedFolder(files[0]?.webkitRelativePath?.split('/')[0] || '');
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

  // 导入SpotStudio
  const handleImportToSpotStudio = () => {
    if (selectedIndices.size === 0) {
      alert('请先选择要导入的素材');
      return;
    }
    const selectedImages = Array.from(selectedIndices).map(index => images[index]);
    console.log('导入到SpotStudio:', selectedImages);
    // TODO: 实现导入SpotStudio的具体逻辑
    alert(`已选择 ${selectedIndices.size} 张图片，准备导入SpotStudio（功能待实现）`);
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
    // 无论是否有图片，都允许重新选择文件夹
    setTimeout(() => {
      folderInputRef.current?.click();
    }, 100);
  };

  // 当有图片但没有选中时，自动选中第一张
  useEffect(() => {
    if (activeTab === 'local' && images.length > 0 && selectedIndex === -1) {
      setSelectedIndex(0);
    }
  }, [activeTab, images.length, selectedIndex]);

  return (
    <div className="link-page">
      <div className="link-page-header">
        <h1>素材链接</h1>
        {activeTab === 'local' && images.length > 0 && (
          <div className="folder-selector">
            <span className="image-count">📁 {selectedFolder} - 共 {images.length} 张图片</span>
          </div>
        )}
      </div>

      <div className="link-page-content">
        {/* 左侧：两个大按钮 */}
        <div className="link-page-left">
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
          <button
            type="button"
            className={`category-btn ${activeTab === 'local' ? 'active' : ''}`}
            onClick={handleLocalMaterialClick}
          >
            本地素材
          </button>
        </div>

        {/* 右侧：素材列表和详细视图并排 */}
        <div className="link-page-right">
          <input
            ref={folderInputRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            onChange={handleFolderSelect}
            style={{ display: 'none' }}
          />

          {/* 素材列表视图 */}
          <div className="material-list-view">
            {activeTab === 'local' ? (
              images.length === 0 ? (
                <div className="empty-state">
                  <p>请选择包含图片的文件夹</p>
                  <p className="hint">支持 PNG、JPG、GIF、WebP、SVG 格式</p>
                  <p className="hint-small">💡 仅本地浏览，不会上传文件</p>
                  <p className="hint-warning">
                    ⚠️ 浏览器会显示安全提示，点击"上传"只是允许我们读取文件，<br />
                    所有操作都在本地完成，文件不会发送到服务器
                  </p>
                  <button
                    className="btn-select-folder-inline"
                    onClick={() => folderInputRef.current?.click()}
                  >
                    📁 浏览本地文件夹
                  </button>
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
                      className="btn-import-spotstudio"
                      onClick={handleImportToSpotStudio}
                      disabled={selectedIndices.size === 0}
                    >
                      导入SpotStudio {selectedIndices.size > 0 && `(${selectedIndices.size})`}
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
            {selectedIndex >= 0 && selectedImage ? (
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
