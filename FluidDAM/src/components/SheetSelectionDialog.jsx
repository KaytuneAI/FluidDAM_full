import React, { useState, useEffect } from 'react';
import ExcelJS from 'exceljs';

export default function SheetSelectionDialog({ file, onSheetSelect, onCancel }) {
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSheetList();
  }, [file]);

  const loadSheetList = async () => {
    try {
      setLoading(true);
      setError(null);

      // 读取Excel文件
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file);
      
      // 找到LayoutJson工作表
      const layoutSheet = workbook.getWorksheet('LayoutJson');
      if (!layoutSheet) {
        throw new Error('未找到LayoutJson工作表');
      }

      // 获取所有已使用的行
      const maxRow = layoutSheet.rowCount;
      const availableSheets = [];

      for (let row = 1; row <= maxRow; row++) {
        const cellValue = layoutSheet.getCell(row, 1).value;
        
        if (cellValue && typeof cellValue === 'string' && cellValue.length > 0) {
          // 检查是否是JSON格式且包含工作表信息
          if (cellValue.includes('"sheet":{') && cellValue.includes('"name":')) {
            try {
              // 检查是否有横向分割的JSON
              let fullJsonString = cellValue;
              const hasMultipleColumns = layoutSheet.getCell(row, 2).value && 
                                       layoutSheet.getCell(row, 2).value.length > 0;
              
              if (hasMultipleColumns) {
                // 重新组合横向分割的JSON
                let columnIndex = 1;
                fullJsonString = '';
                let chunk = layoutSheet.getCell(row, columnIndex).value;
                
                while (chunk && chunk.length > 0) {
                  fullJsonString += chunk;
                  columnIndex++;
                  chunk = layoutSheet.getCell(row, columnIndex).value;
                }
              }
              
              // 解析完整的JSON以提取详细信息
              const jsonData = JSON.parse(fullJsonString);
              const sheetName = extractSheetNameFromJson(fullJsonString);
              
              if (sheetName && jsonData) {
                // 提取各种统计信息
                const generatedAt = jsonData.generatedAt || '未知时间';
                const pictureCount = jsonData.sheet?.images?.length || 0;
                const textboxCount = jsonData.sheet?.textboxes?.length || 0;
                const cellCount = jsonData.sheet?.cells?.length || 0;
                const borderCount = jsonData.sheet?.borders?.length || 0;
                
                // 格式化创建时间
                const formatTime = (timeStr) => {
                  try {
                    if (timeStr === '未知时间') return timeStr;
                    
                    // 智能处理时区：如果时间字符串没有时区信息，视为本地时间
                    let date;
                    if (timeStr.endsWith('Z')) {
                      // 有Z后缀，视为UTC时间
                      date = new Date(timeStr);
                    } else if (timeStr.includes('T') && !timeStr.includes('+') && !timeStr.includes('-', 10)) {
                      // 有T但没有时区信息，视为本地时间
                      date = new Date(timeStr);
                    } else {
                      // 其他情况，直接解析
                      date = new Date(timeStr);
                    }
                    
                    // 检查日期是否有效
                    if (isNaN(date.getTime())) {
                      return timeStr; // 返回原始字符串
                    }
                    
                    return date.toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'local' // 明确使用本地时区
                    });
                  } catch {
                    return timeStr;
                  }
                };
                
                availableSheets.push({
                  name: sheetName,
                  row: row,
                  hasMultipleColumns: hasMultipleColumns,
                  jsonLength: fullJsonString.length,
                  generatedAt: formatTime(generatedAt),
                  pictureCount: pictureCount,
                  textboxCount: textboxCount,
                  cellCount: cellCount,
                  borderCount: borderCount
                });
              }
            } catch (parseError) {
              console.warn(`解析第${row}行JSON失败:`, parseError);
            }
          }
        }
      }

      if (availableSheets.length === 0) {
        throw new Error('LayoutJson工作表中没有找到有效的导出数据');
      }

      setSheets(availableSheets);
    } catch (err) {
      console.error('加载工作表列表失败:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const extractSheetNameFromJson = (jsonStr) => {
    try {
      // 查找 "sheet":{"name":"工作表名称" 的模式
      const searchPattern = '"sheet":{"name":"';
      const startPos = jsonStr.indexOf(searchPattern);
      
      if (startPos > -1) {
        const nameStart = startPos + searchPattern.length;
        const nameEnd = jsonStr.indexOf('"', nameStart);
        
        if (nameEnd > nameStart) {
          return jsonStr.substring(nameStart, nameEnd);
        }
      }
      
      return null;
    } catch (error) {
      console.warn('提取工作表名称失败:', error);
      return null;
    }
  };

  const handleSheetSelect = (sheet) => {
    onSheetSelect(sheet);
  };

  if (loading) {
    return (
      <div className="sheet-selection-dialog">
        <div className="dialog-overlay">
          <div className="dialog-content">
            <h3>正在读取工作表列表...</h3>
            <div className="loading-spinner"></div>
          </div>
        </div>
        <style jsx>{`
          .sheet-selection-dialog {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 10000;
          }
          
          .dialog-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .dialog-content {
            background: white;
            padding: 30px;
            border-radius: 8px;
            text-align: center;
            min-width: 300px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          }
          
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sheet-selection-dialog">
        <div className="dialog-overlay">
          <div className="dialog-content">
            <h3>加载失败</h3>
            <p style={{ color: '#e74c3c', marginBottom: '20px' }}>{error}</p>
            <button onClick={onCancel} className="cancel-button">
              关闭
            </button>
          </div>
        </div>
        <style jsx>{`
          .sheet-selection-dialog {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 10000;
          }
          
          .dialog-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .dialog-content {
            background: white;
            padding: 30px;
            border-radius: 8px;
            text-align: center;
            min-width: 300px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          }
          
          .cancel-button {
            background: #95a5a6;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          }
          
          .cancel-button:hover {
            background: #7f8c8d;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="sheet-selection-dialog">
      <div className="dialog-overlay">
        <div className="dialog-content">
          <h3>选择要加载的工作表</h3>
          <p style={{ color: '#7f8c8d', marginBottom: '20px' }}>
            找到 {sheets.length} 个已导出的工作表
          </p>
          
          <div className="sheet-list">
            {sheets.map((sheet, index) => (
              <div key={index} className="sheet-item" onClick={() => handleSheetSelect(sheet)}>
                <div className="sheet-name">{sheet.name}</div>
                <div className="sheet-info">
                  <div className="sheet-time">📅 {sheet.generatedAt}</div>
                  <div className="sheet-stats">
                    🖼️ {sheet.pictureCount} 图片 • 
                    📝 {sheet.textboxCount} 文本框 • 
                    📊 {sheet.cellCount} 单元格 • 
                    🔲 {sheet.borderCount} 边框
                  </div>
                  <div className="sheet-meta">
                    行 {sheet.row} • {Math.round(sheet.jsonLength / 1024)}KB
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="dialog-actions">
            <button onClick={onCancel} className="cancel-button">
              取消
            </button>
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .sheet-selection-dialog {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10000;
        }
        
        .dialog-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .dialog-content {
          background: white;
          padding: 30px;
          border-radius: 8px;
          max-width: 500px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }
        
        .sheet-list {
          margin: 20px 0;
        }
        
        .sheet-item {
          padding: 15px;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          margin-bottom: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .sheet-item:hover {
          background: #f8f9fa;
          border-color: #3498db;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(52, 152, 219, 0.2);
        }
        
        .sheet-name {
          font-weight: 600;
          font-size: 16px;
          color: #2c3e50;
          margin-bottom: 8px;
        }
        
        .sheet-info {
          font-size: 12px;
          color: #7f8c8d;
        }
        
        .sheet-time {
          font-size: 13px;
          color: #27ae60;
          font-weight: 500;
          margin-bottom: 6px;
        }
        
        .sheet-stats {
          font-size: 12px;
          color: #34495e;
          margin-bottom: 4px;
          line-height: 1.4;
        }
        
        .sheet-meta {
          font-size: 11px;
          color: #95a5a6;
          font-style: italic;
        }
        
        .dialog-actions {
          margin-top: 20px;
          text-align: center;
        }
        
        .cancel-button {
          background: #95a5a6;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        
        .cancel-button:hover {
          background: #7f8c8d;
        }
      `}</style>
    </div>
  );
}
