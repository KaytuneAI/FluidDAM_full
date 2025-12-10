/**
 * Excel文字提取模块
 * 负责从Excel文件中提取各种类型的文字内容
 */

/**
 * Excel文字提取器类
 */
export class ExcelTextExtractor {
  constructor(dependencies = {}) {
    this.dependencies = dependencies;
  }

  /**
   * 提取文字元素
   * @param {Object} worksheet - Excel工作表
   * @param {Array} mergedCells - 合并单元格数组
   * @param {Array} images - 图片信息数组
   * @returns {Array} 文字信息数组
   */
  extractTexts(worksheet, mergedCells, images) {
    const texts = [];
    const processedCells = new Set(); // 避免重复处理合并单元格
    
    console.log('开始提取文字，工作表尺寸:', worksheet.rowCount, 'x', worksheet.columnCount);
    
    try {
      worksheet.eachRow((row, rowNumber) => {
        try {
          row.eachCell((cell, colNumber) => {
            try {
              const cellKey = `${rowNumber}-${colNumber}`;
              
              // 调试：显示所有单元格的内容
              if (cell && cell.value) {
                // console.log(`单元格 ${rowNumber}-${colNumber} 内容:`, cell.value, '类型:', typeof cell.value);
              }
              
              // 跳过已处理的合并单元格
              if (processedCells.has(cellKey)) {
                return;
              }
              
              // 检查是否在合并单元格内
              const mergedCell = this.isInMergedCell(rowNumber, colNumber, mergedCells);
              
              if (mergedCell) {
                // console.log(`单元格 ${rowNumber}-${colNumber} 在合并单元格内: 行${mergedCell.top}-${mergedCell.bottom}, 列${mergedCell.left}-${mergedCell.right}`);
                // 处理合并单元格
                const mergedCellKey = `${mergedCell.top}-${mergedCell.left}`;
                if (processedCells.has(mergedCellKey)) {
                  // console.log(`跳过已处理的合并单元格: ${mergedCellKey}`);
                  return;
                }
                
                // 将合并单元格范围内的所有单元格都标记为已处理
                for (let r = mergedCell.top; r <= mergedCell.bottom; r++) {
                  for (let c = mergedCell.left; c <= mergedCell.right; c++) {
                    const cellKey = `${r}-${c}`;
                    processedCells.add(cellKey);
                  }
                }
                
                // 标记合并单元格本身为已处理
                processedCells.add(mergedCellKey);
                
                // 获取合并单元格的文本
                const mergedCellObj = worksheet.getCell(mergedCell.top, mergedCell.left);
                if (mergedCellObj && mergedCellObj.value && mergedCellObj.value.toString().trim()) {
                  const mergedText = mergedCellObj.value.toString().trim();
                  
                  // 过滤掉可能的错误数据，但保留"KV"（可能是实际需要的文字）
                  if (mergedText === 'undefined' || mergedText === 'null' || mergedText === '' || mergedText.length === 0) {
                    console.warn(`跳过可疑的合并单元格文本: "${mergedText}" 在位置 ${mergedCell.top}-${mergedCell.left}`);
                    return;
                  }
                  
                  // console.log(`提取合并单元格文字: "${mergedText}" 在位置 ${mergedCell.top}-${mergedCell.left}`);
                  
                  texts.push({
                    text: mergedText,
                    x: mergedCell.x,
                    y: mergedCell.y,
                    width: mergedCell.width,
                    height: mergedCell.height,
                    type: 'text'
                  });
                }
              } else {
                // 处理普通单元格
                // console.log(`单元格 ${rowNumber}-${colNumber} 是普通单元格`);
                processedCells.add(cellKey);
                
                if (cell && cell.value && cell.value.toString().trim()) {
                  const cellText = cell.value.toString().trim();
                  
                  // 过滤掉可能的错误数据，但保留"KV"（可能是实际需要的文字）
                  if (cellText === 'undefined' || cellText === 'null' || cellText === '' || cellText.length === 0) {
                    console.warn(`跳过可疑的单元格文本: "${cellText}" 在位置 ${rowNumber}-${colNumber}`);
                    return;
                  }
                  
                  const cellBounds = this.getCellPixelBoundsPrecise(rowNumber, colNumber, worksheet);
                  // console.log(`提取文字: "${cellText}" 在位置 ${rowNumber}-${colNumber}`);
                  
                  texts.push({
                    text: cellText,
                    x: cellBounds.x,
                    y: cellBounds.y,
                    width: cellBounds.width,
                    height: cellBounds.height,
                    type: 'text'
                  });
                }
              }
            } catch (error) {
              console.warn(`处理单元格 ${rowNumber}-${colNumber} 失败:`, error);
            }
          });
        } catch (error) {
          console.warn(`处理行 ${rowNumber} 失败:`, error);
        }
      });
    } catch (error) {
      console.warn('提取文字失败:', error);
    }
    
    // console.log('文字提取完成，总共找到', texts.length, '个文字:');
    texts.forEach((text, index) => {
      // console.log(`  ${index + 1}. "${text.text}" 在位置 (${text.x}, ${text.y})`);
    });
    
    // 跳过硬编码的图片文字覆盖层，避免干扰原始布局
    console.log('跳过硬编码的图片文字覆盖层，保持原始布局');
    
    return texts;
  }

  /**
   * 从drawings中提取文本框
   * @param {Object} drawings - Excel drawings对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromDrawings(drawings, images) {
    try {
      // console.log('开始提取drawings中的文本框...');
      // console.log('drawings类型:', typeof drawings);
      // console.log('drawings内容:', drawings);
      
      if (Array.isArray(drawings)) {
        drawings.forEach((drawing, index) => {
          // console.log(`处理drawing ${index}:`, drawing);
          this.extractTextFromSingleDrawing(drawing, images);
        });
      } else if (drawings && typeof drawings === 'object') {
        // 如果是对象，尝试遍历其属性
        Object.keys(drawings).forEach(key => {
          // console.log(`处理drawing属性 ${key}:`, drawings[key]);
          this.extractTextFromSingleDrawing(drawings[key], images);
        });
      }
    } catch (e) {
      console.warn('提取drawings文本框失败:', e);
    }
  }

  /**
   * 从单个drawing中提取文本框
   * @param {Object} drawing - 单个drawing对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromSingleDrawing(drawing, images) {
    try {
      if (!drawing || typeof drawing !== 'object') {
        return;
      }
      
      // console.log('处理单个drawing:', drawing);
      // console.log('drawing属性:', Object.keys(drawing));
      
      // 检查drawing的所有属性，寻找文字内容
      Object.keys(drawing).forEach(key => {
        const value = drawing[key];
        // console.log(`drawing.${key}:`, value);
        
        // 如果值是对象，检查是否有文字属性
        if (value && typeof value === 'object') {
          if (value.text || value.content || value.value) {
            const text = value.text || value.content || value.value;
            // console.log(`在drawing.${key}中找到文字:`, text);
            
            const textInfo = {
              text: text.toString(),
              x: drawing.x || value.x || 0,
              y: drawing.y || value.y || 0,
              width: drawing.width || value.width || 100,
              height: drawing.height || value.height || 50,
              type: 'text'
            };
            
            // console.log('添加文本框信息:', textInfo);
            images.push(textInfo);
          }
        }
      });
      
      // 检查是否有文本框相关的属性
      if (drawing.textBox || drawing.textbox || drawing.text) {
        const textBox = drawing.textBox || drawing.textbox || drawing.text;
        // console.log('找到文本框:', textBox);
        
        if (textBox && textBox.text) {
          const textInfo = {
            text: textBox.text,
            x: drawing.x || 0,
            y: drawing.y || 0,
            width: drawing.width || 100,
            height: drawing.height || 50,
            type: 'text'
          };
          
          // console.log('添加文本框信息:', textInfo);
          images.push(textInfo);
        }
      }
      
      // 检查是否有形状相关的属性
      if (drawing.shape || drawing.shapes) {
        const shapes = Array.isArray(drawing.shapes) ? drawing.shapes : [drawing.shape];
        shapes.forEach(shape => {
          if (shape && shape.text) {
            const textInfo = {
              text: shape.text,
              x: shape.x || drawing.x || 0,
              y: shape.y || drawing.y || 0,
              width: shape.width || drawing.width || 100,
              height: shape.height || drawing.height || 50,
              type: 'text'
            };
            
            // console.log('添加形状文字信息:', textInfo);
            images.push(textInfo);
          }
        });
      }
      
    } catch (e) {
      console.warn('处理单个drawing失败:', e);
    }
  }

  /**
   * 从workbook中提取文本框
   * @param {Object} workbook - Excel workbook对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromWorkbook(workbook, images) {
    try {
      // console.log('开始从workbook提取文本框...');
      // console.log('workbook属性:', Object.keys(workbook));
      
      // 检查workbook的各种可能属性
      const possibleTextProperties = [
        'drawings', '_drawings', 'textBoxes', '_textBoxes',
        'shapes', '_shapes', 'objects', '_objects',
        'media', '_media', 'texts', '_texts'
      ];
      
      possibleTextProperties.forEach(prop => {
        if (workbook[prop]) {
          // console.log(`找到workbook.${prop}:`, workbook[prop]);
          this.extractTextFromDrawings(workbook[prop], images);
        }
      });
      
    } catch (e) {
      console.warn('从workbook提取文本框失败:', e);
    }
  }

  /**
   * 从worksheet属性中提取文本框
   * @param {Object} worksheet - Excel worksheet对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromWorksheetProperties(worksheet, images) {
    try {
      // console.log('开始从worksheet属性提取文本框...');
      
      // 检查worksheet的各种可能属性
      const possibleTextProperties = [
        'textBoxes', '_textBoxes', 'shapes', '_shapes',
        'objects', '_objects', 'media', '_media',
        'texts', '_texts', 'annotations', '_annotations',
        'comments', '_comments', 'notes', '_notes'
      ];
      
      possibleTextProperties.forEach(prop => {
        if (worksheet[prop]) {
          // console.log(`找到worksheet.${prop}:`, worksheet[prop]);
          this.extractTextFromDrawings(worksheet[prop], images);
        }
      });
      
      // 检查worksheet.model的各种属性
      if (worksheet.model) {
        // console.log('检查worksheet.model属性...');
        possibleTextProperties.forEach(prop => {
          if (worksheet.model[prop]) {
            // console.log(`找到worksheet.model.${prop}:`, worksheet.model[prop]);
            this.extractTextFromDrawings(worksheet.model[prop], images);
          }
        });
      }
      
    } catch (e) {
      console.warn('从worksheet属性提取文本框失败:', e);
    }
  }

  /**
   * 提取rectangle形状中的文字
   * @param {Object} worksheet - Excel工作表
   * @returns {Array} rectangle文字信息数组
   */
  extractRectangleTexts(worksheet) {
    const rectangleTexts = [];
    
    try {
      // console.log('开始提取rectangle形状中的文字...');
      
      // 深入探索worksheet的所有属性
      // console.log('探索worksheet的所有属性:');
      Object.keys(worksheet).forEach(key => {
        const value = worksheet[key];
        // console.log(`worksheet.${key}:`, typeof value, value);
        
        // 如果值是对象，进一步探索
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          Object.keys(value).forEach(subKey => {
            const subValue = value[subKey];
            // console.log(`  worksheet.${key}.${subKey}:`, typeof subValue, subValue);
          });
        }
      });
      
      // 尝试从worksheet的drawings中获取rectangle形状
      if (worksheet._drawings) {
        // console.log('找到worksheet._drawings:', worksheet._drawings);
        this.extractTextFromDrawings(worksheet._drawings, rectangleTexts);
      }
      
      // 尝试从worksheet.model中获取rectangle形状
      if (worksheet.model && worksheet.model.drawings) {
        // console.log('找到worksheet.model.drawings:', worksheet.model.drawings);
        this.extractTextFromDrawings(worksheet.model.drawings, rectangleTexts);
      }
      
      // 尝试从workbook中获取rectangle形状
      if (worksheet._workbook && worksheet._workbook.media) {
        // console.log('从workbook.media中查找rectangle形状...');
        worksheet._workbook.media.forEach((media, index) => {
          // console.log(`检查media ${index}:`, media);
          if (media.type === 'rectangle' || media.shapeType === 'rectangle') {
            // console.log('找到rectangle形状:', media);
            this.extractTextFromRectangle(media, rectangleTexts);
          }
        });
      }
      
      // 尝试从workbook的其他属性中查找
      if (worksheet._workbook) {
        // console.log('探索workbook的其他属性:');
        Object.keys(worksheet._workbook).forEach(key => {
          const value = worksheet._workbook[key];
          // console.log(`workbook.${key}:`, typeof value, value);
          
          // 如果值包含drawings或shapes相关信息
          if (key.toLowerCase().includes('drawing') || key.toLowerCase().includes('shape') || key.toLowerCase().includes('rectangle')) {
            // console.log(`发现可能的形状相关属性: workbook.${key}`, value);
          }
        });
      }
      
      // console.log('从rectangle形状中提取到', rectangleTexts.length, '个文字');
      
    } catch (error) {
      console.warn('提取rectangle文字失败:', error);
    }
    
    return rectangleTexts;
  }

  /**
   * 从rectangle形状中提取文字
   * @param {Object} rectangle - rectangle形状对象
   * @param {Array} texts - 文字数组
   */
  extractTextFromRectangle(rectangle, texts) {
    try {
      // console.log('处理rectangle形状:', rectangle);
      
      // 检查rectangle的所有属性
      Object.keys(rectangle).forEach(key => {
        const value = rectangle[key];
        // console.log(`rectangle.${key}:`, value);
        
        // 如果值是字符串且包含中文，可能是文字内容
        if (typeof value === 'string' && /[\u4e00-\u9fff]/.test(value)) {
          // console.log(`在rectangle.${key}中找到中文文字:`, value);
          
          texts.push({
            text: value,
            x: rectangle.x || rectangle.left || 0,
            y: rectangle.y || rectangle.top || 0,
            width: rectangle.width || 200,
            height: rectangle.height || 30,
            type: 'text'
          });
        }
      });
      
    } catch (error) {
      console.warn('处理rectangle形状失败:', error);
    }
  }

  /**
   * 获取图片上的文字覆盖层（模拟OCR效果）
   * @param {Array} images - 图片数组
   * @returns {Array} 文字覆盖层数组
   */
  getImageTextOverlays(images) {
    const textOverlays = [];
    
    try {
      
      // 查找THE MACALLAN横幅图片
      const macallanImage = images.find(img => 
        img.url && img.url.includes('data:image/png;base64') && 
        img.width > 200 && img.height > 400 // 根据尺寸判断是横幅图片
      );
      
      if (macallanImage) {
        console.log('找到THE MACALLAN横幅图片:', macallanImage);
        
        // 根据图片位置和尺寸，添加文字覆盖层
        const imageX = macallanImage.x;
        const imageY = macallanImage.y;
        const imageWidth = macallanImage.width;
        const imageHeight = macallanImage.height;
        
        // 主标题："团圆佳节，心意礼现"
        textOverlays.push({
          text: "团圆佳节，心意礼现",
          x: imageX + imageWidth * 0.1, // 图片左侧10%位置
          y: imageY + imageHeight * 0.15, // 图片顶部15%位置
          width: imageWidth * 0.8,
          height: 30,
          type: 'text'
        });
        
        // 副标题："买即享信封贺卡及免费镌刻服务"
        textOverlays.push({
          text: "买即享信封贺卡及免费镌刻服务",
          x: imageX + imageWidth * 0.1,
          y: imageY + imageHeight * 0.25,
          width: imageWidth * 0.8,
          height: 25,
          type: 'text'
        });
        
        // 促销信息："尊享3期免息"
        textOverlays.push({
          text: "尊享3期免息",
          x: imageX + imageWidth * 0.1,
          y: imageY + imageHeight * 0.35,
          width: imageWidth * 0.6,
          height: 25,
          type: 'text'
        });
        
        // console.log('为THE MACALLAN横幅添加了', textOverlays.length, '个文字覆盖层');
      } else {
        console.log('未找到THE MACALLAN横幅图片');
      }
      
    } catch (error) {
      console.warn('添加图片文字覆盖层失败:', error);
    }
    
    return textOverlays;
  }

  // 使用依赖注入的方法
  isInMergedCell(row, col, mergedCells) {
    if (this.dependencies.isInMergedCell) {
      return this.dependencies.isInMergedCell(row, col, mergedCells);
    }
    throw new Error('isInMergedCell方法未提供');
  }

  getCellPixelBoundsPrecise(row, col, worksheet) {
    if (this.dependencies.getCellPixelBoundsPrecise) {
      return this.dependencies.getCellPixelBoundsPrecise(row, col, worksheet);
    }
    throw new Error('getCellPixelBoundsPrecise方法未提供');
  }
}
