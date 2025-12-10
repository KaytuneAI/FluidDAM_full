import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import DrawingML from './DrawingML';
import { calculateOffsets } from './unitConversion.js';

/**
 * 使用DrawingML解析器提取文本框和图片（只解析当前worksheet关联的drawing文件）
 * @param {Object} worksheet - Excel工作表
 * @param {JSZip} zip - Excel文件的zip对象
 * @param {Object} opts - 过滤选项
 * @returns {Object} { texts: [], images: [] }
 */
export async function extractDrawingMLElements(worksheet, zip, opts = {}) {
  const drawingTexts = [];
  const drawingImages = [];
  let sheetIndex = 1; // 默认值，防止未定义错误
  
  try {
    // console.log('开始使用DrawingML解析器提取元素...');
    
    // 计算行列偏移量
    const dims = calculateOffsets(worksheet);
    // console.log('计算的行列偏移量:', dims);
    
    // 获取当前worksheet的索引（从0开始）
    const workbook = worksheet._workbook;
    sheetIndex = workbook.worksheets.indexOf(worksheet) + 1; // 转换为1-based索引
    // console.log(`当前worksheet索引: ${sheetIndex}`);
    
    // 查找当前worksheet关联的drawing文件
    const relsPath = `xl/worksheets/_rels/sheet${sheetIndex}.xml.rels`;
    let drawingPath = null;
    
    if (zip.file(relsPath)) {
      try {
        const relsXml = await zip.file(relsPath).async('string');
        const parser = new XMLParser({ ignoreAttributes: false });
        const relsDoc = parser.parse(relsXml);
        
        if (relsDoc.Relationships && relsDoc.Relationships.Relationship) {
          const relationships = relsDoc.Relationships.Relationship;
          const relArray = Array.isArray(relationships) ? relationships : [relationships];
          
          // 查找drawing关系
          const drawingRel = relArray.find(r => 
            r['@_Type'] && r['@_Type'].includes('/drawing')
          );
          
          if (drawingRel && drawingRel['@_Target']) {
            // 构建drawing文件路径
            drawingPath = `xl/drawings/${drawingRel['@_Target'].replace('../drawings/', '')}`;
            // console.log(`找到worksheet ${sheetIndex} 关联的drawing文件: ${drawingPath}`);
          }
        }
      } catch (error) {
        console.warn(`解析worksheet关系文件失败: ${relsPath}`, error);
      }
    } else {
      // console.log(`未找到worksheet关系文件: ${relsPath}`);
    }
    
    // 如果没有找到关联的drawing文件，跳过DrawingML解析
    if (!drawingPath) {
      // console.log(`worksheet ${sheetIndex} 没有关联的drawing文件，跳过DrawingML解析`);
      return { texts: drawingTexts, images: drawingImages };
    }
    
    // 验证drawing文件是否存在
    if (!zip.file(drawingPath)) {
      console.warn(`drawing文件不存在: ${drawingPath}`);
      return { texts: drawingTexts, images: drawingImages };
    }
    
    // 只解析当前worksheet关联的drawing文件
    try {
      // console.log(`解析worksheet ${sheetIndex} 的drawing文件: ${drawingPath}`);
      
      // 设置过滤选项 - 调试模式，放宽过滤条件
      const filterOpts = {
        includeHidden: true,       // 包含隐藏元素（调试）
        includeVML: false,         // 不包含VML元素
        includePrintOnly: true,    // 包含仅打印元素（调试）
        minPixelSize: 0,           // 最小像素尺寸设为0（调试）
        clipToSheetBounds: false   // 不裁剪到工作表边界（调试）
      };
      
      const drawingResults = await DrawingML.parseDrawingML(zip, drawingPath, dims, filterOpts);
      
      // console.log(`从${drawingPath}解析到:`, drawingResults);
      
      // 处理文本框
      if (drawingResults.texts && drawingResults.texts.length > 0) {
        for (const textItem of drawingResults.texts) {
          if (textItem.text && textItem.text.trim()) {
            drawingTexts.push({
              text: textItem.text.trim(),
              x: textItem.rect.x,
              y: textItem.rect.y,
              width: textItem.rect.w,
              height: textItem.rect.h,
              type: 'textbox', // 标记为textbox类型
              source: 'drawingml'
            });
            // console.log(`添加DrawingML文本框: "${textItem.text.trim()}" 位置(${textItem.rect.x}, ${textItem.rect.y})`);
          }
        }
      }
      
      // 处理图片
      if (drawingResults.images && drawingResults.images.length > 0) {
        for (const imageItem of drawingResults.images) {
          // 从workbook获取图片数据
          try {
            const workbook = worksheet._workbook;
            let imageData = null;
            
            // 尝试通过rId获取图片
            if (imageItem.rId && workbook) {
              // 这里需要根据实际的ExcelJS API来获取图片
              // 可能需要遍历workbook的图片集合
              console.log(`尝试获取图片数据，rId: ${imageItem.rId}`);
              
              // 暂时创建一个占位符，实际实现需要根据ExcelJS的API调整
              drawingImages.push({
                url: null, // 需要从workbook获取
                x: imageItem.rect.x,
                y: imageItem.rect.y,
                width: imageItem.rect.w,
                height: imageItem.rect.h,
                type: 'image',
                source: 'drawingml',
                rId: imageItem.rId,
                target: imageItem.target
              });
            }
          } catch (error) {
            console.warn('处理DrawingML图片失败:', error);
          }
        }
      }
      
    } catch (error) {
      console.warn(`解析drawing文件${drawingPath}失败:`, error);
    }
    
  } catch (error) {
    console.warn('DrawingML解析失败:', error);
  }
  
  // console.log(`✅ 修复验证: 只解析了worksheet ${sheetIndex} 关联的drawing文件，避免了加载其他sheet的文本框`);
  return { texts: drawingTexts, images: drawingImages };
}

/**
 * 提取图片元素
 * @param {Object} worksheet - Excel工作表
 * @returns {Array} 图片信息数组
 */
export async function extractImages(worksheet) {
  const images = [];
  const processedImages = new Set(); // 避免重复处理同一张图片
  
  try {
    console.log('开始检查工作表中的图片...');
    // console.log('worksheet对象:', worksheet);
    console.log('worksheet.getImages方法:', typeof worksheet.getImages);
    
    // 尝试获取工作表中的图片
    let worksheetImages = [];
    
    if (typeof worksheet.getImages === 'function') {
      worksheetImages = worksheet.getImages();
      console.log('通过getImages()获取到图片数量:', worksheetImages.length);
    } else if (worksheet.images) {
      worksheetImages = worksheet.images;
      console.log('通过worksheet.images获取到图片数量:', worksheetImages.length);
    } else if (worksheet._images) {
      worksheetImages = worksheet._images;
      console.log('通过worksheet._images获取到图片数量:', worksheetImages.length);
    } else {
      console.log('未找到图片数据，尝试其他方法...');
      // 尝试其他可能的方法
      if (worksheet.model && worksheet.model.images) {
        worksheetImages = worksheet.model.images;
        console.log('通过worksheet.model.images获取到图片数量:', worksheetImages.length);
      }
    }
    
    
    // 处理图片数据
    for (const image of worksheetImages) {
      try {
        // 生成唯一ID避免重复
        let imageId = image.id || image.imageId || `${image.row || 0}_${image.col || 0}`;
        
        if (!imageId && image.range) {
          // 尝试从range生成ID
          if (typeof image.range === 'string') {
            imageId = `range_${image.range.replace(/[^a-zA-Z0-9]/g, '_')}`;
          } else if (image.range.tl && image.range.br) {
            imageId = `range_${image.range.tl.row}_${image.range.tl.col}_${image.range.br.row}_${image.range.br.col}`;
          }
        }
        
        if (!imageId) {
          imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        // 如果ID重复，生成新的唯一ID而不是跳过
        if (processedImages.has(imageId)) {
          const originalId = imageId;
          imageId = `${imageId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        }
        processedImages.add(imageId);
        
        // 尝试获取图片数据
        let imageData = null;
        
        if (typeof image.getImage === 'function') {
          try {
            imageData = await image.getImage();
            console.log(`通过getImage()获取图片数据:`, imageData);
          } catch (error) {
            console.warn(`getImage()失败:`, error);
          }
        }
        
        // 如果getImage()失败，使用图片对象本身
        if (!imageData) {
          imageData = image;
        }
        
        // 如果仍然没有数据，尝试其他方法
        if (!imageData) {
          console.log('图片数据为空，跳过处理');
          continue;
        }
        
        // 尝试从workbook获取图片
        if (imageData.imageId !== undefined && imageData.imageId !== null) {
          // 尝试通过imageId获取图片
          
          // 尝试从workbook获取图片
          const workbook = worksheet._workbook;
          if (workbook) {
            // 尝试从workbook获取图片
            
            // 尝试不同的方法获取图片
            if (typeof workbook.getImage === 'function') {
              try {
                imageData = await workbook.getImage(imageData.imageId);
                // 通过workbook.getImage()获取图片数据成功
              } catch (error) {
                console.warn('workbook.getImage()失败:', error);
              }
            }
            
            // 尝试从workbook.images获取
            if (!imageData && workbook.images) {
              // 尝试从workbook.images获取图片
              const workbookImage = workbook.images.find(img => img.id === imageData.imageId);
              if (workbookImage) {
                imageData = workbookImage;
                // 从workbook.images找到图片
              }
            }
            
            // 尝试从workbook._media获取
            if (!imageData && workbook._media) {
              // 尝试从workbook._media获取图片
              const mediaImage = workbook._media.find(media => media.id === imageData.imageId);
              if (mediaImage) {
                imageData = mediaImage;
                // 从workbook._media找到图片
              }
            }
          }
        }
        
        // 处理图片数据
        if (imageData) {
          let buffer = null;
          
          // 尝试获取图片buffer
          if (imageData.buffer) {
            buffer = imageData.buffer;
            // 从imageData.buffer获取图片数据
          } else if (imageData.image && imageData.image.buffer) {
            buffer = imageData.image.buffer;
            // 从imageData.image.buffer获取图片数据
          } else if (imageData.data) {
            buffer = imageData.data;
            // 从imageData.data获取图片数据
          } else {
            // 尝试从嵌套对象中查找buffer
            // console.log('尝试从嵌套对象中查找buffer...');
            const allKeys = Object.keys(imageData);
            // 检查imageData的所有键
            
            for (const key of allKeys) {
              const value = imageData[key];
              if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
                buffer = value;
                // console.log(`从${key}找到buffer数据`);
                break;
              } else if (value && typeof value === 'object') {
                // 递归查找嵌套对象
                const nestedKeys = Object.keys(value);
                for (const nestedKey of nestedKeys) {
                  const nestedValue = value[nestedKey];
                  if (nestedValue instanceof ArrayBuffer || nestedValue instanceof Uint8Array) {
                    buffer = nestedValue;
                    // console.log(`从${key}.${nestedKey}找到buffer数据`);
                    break;
                  }
                }
                if (buffer) break;
              }
            }
            
            // 如果还没找到，尝试从workbook中查找
            if (!buffer) {
              // console.log('尝试从workbook中查找buffer...');
              const workbook = worksheet._workbook;
              if (workbook) {
                const workbookKeys = Object.keys(workbook);
                // console.log('workbook的所有键:', workbookKeys);
                
                for (const wbKey of workbookKeys) {
                  const wbValue = workbook[wbKey];
                  if (wbValue && typeof wbValue === 'object') {
                    if (wbValue instanceof ArrayBuffer || wbValue instanceof Uint8Array) {
                      buffer = wbValue;
                      // console.log(`从workbook.${wbKey}找到buffer数据`);
                      break;
                    }
                  }
                }
              }
            }
          }
          
          if (!buffer) {
            console.warn('无法获取图片buffer数据');
            continue;
          }
          
          // 转换buffer为base64
          let base64String = '';
          
          if (buffer instanceof ArrayBuffer) {
            const uint8Array = new Uint8Array(buffer);
            const chunkSize = 8192; // 8KB chunks
            let binaryString = '';
            
            // 分块处理大文件
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
              const chunk = uint8Array.slice(i, i + chunkSize);
              binaryString += String.fromCharCode.apply(null, chunk);
            }
            
            base64String = btoa(binaryString);
          } else if (buffer instanceof Uint8Array) {
            const chunkSize = 8192;
            let binaryString = '';
            
            for (let i = 0; i < buffer.length; i += chunkSize) {
              const chunk = buffer.slice(i, i + chunkSize);
              binaryString += String.fromCharCode.apply(null, chunk);
            }
            
            base64String = btoa(binaryString);
          } else {
            console.warn('未知的buffer类型:', typeof buffer);
            continue;
          }
          
          if (!base64String || base64String.length === 0) {
            console.warn('base64字符串为空');
            continue;
          }
          
          // 检测MIME类型
          let mimeType = 'image/png'; // 默认类型
          
          // 检查base64字符串的完整性
          if (base64String.length % 4 !== 0) {
            console.warn('base64字符串长度不是4的倍数，尝试修复...');
            const padding = 4 - (base64String.length % 4);
            base64String += '='.repeat(padding);
          }
          
          // 尝试从buffer头部检测MIME类型
          if (buffer instanceof ArrayBuffer || buffer instanceof Uint8Array) {
            const header = new Uint8Array(buffer.slice(0, 4));
            if (header[0] === 0xFF && header[1] === 0xD8) {
              mimeType = 'image/jpeg';
            } else if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
              mimeType = 'image/png';
            } else if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) {
              mimeType = 'image/gif';
            } else if (header[0] === 0x42 && header[1] === 0x4D) {
              mimeType = 'image/bmp';
            }
          }
          
          if (!mimeType || mimeType === 'image' || mimeType === '') {
            mimeType = 'image/png'; // 默认类型
          }
          
          // 应用96 DPI智能压缩
          let compressedBase64 = base64String;
          try {
            const { compressTo96DPI } = await import('./dpiCompression.js');
            compressedBase64 = await compressTo96DPI(base64String, mimeType, 96);
            // 图片已应用96 DPI智能压缩
          } catch (compressionError) {
            console.warn('96 DPI压缩失败，使用原始图片:', compressionError);
          }
          
          // 构建data URL
          const dataUrl = `data:${mimeType};base64,${compressedBase64}`;
          
          // 检查data URL是否有效
          if (!dataUrl || dataUrl.length === 0) {
            console.warn('生成的data URL为空');
            continue;
          }
          
          // 计算图片位置和尺寸
          let x = 0, y = 0, width = 0, height = 0;
          
          if (image.range && image.range.tl && image.range.br) {
            // 使用range计算位置
            const tl = image.range.tl;
            const br = image.range.br;
            
            // 这里需要根据实际的ExcelJS API来获取单元格位置
            // 暂时使用默认值
            x = (tl.col - 1) * 64; // 假设列宽为64
            y = (tl.row - 1) * 20; // 假设行高为20
            width = (br.col - tl.col + 1) * 64;
            height = (br.row - tl.row + 1) * 20;
          } else if (image.position) {
            // 使用position信息
            x = image.position.x || 0;
            y = image.position.y || 0;
            width = image.position.width || 100;
            height = image.position.height || 100;
          } else {
            // 使用默认尺寸
            width = 100;
            height = 100;
          }
          
          if (width === 0 || height === 0) {
            console.warn('图片尺寸为0，跳过');
            continue;
          }
          
          // 添加到图片数组
          images.push({
            id: imageId,
            url: dataUrl,
            x: x,
            y: y,
            width: width,
            height: height,
            type: 'image',
            source: 'worksheet',
            mimeType: mimeType,
            originalSize: buffer.byteLength || buffer.length,
            range: image.range,
            position: image.position
          });
          
        }
      } catch (error) {
        console.warn(`处理图片失败:`, error);
      }
    }
    
  } catch (error) {
    console.warn('提取图片失败:', error);
  }
  
  console.log(`图片提取完成，共找到 ${images.length} 张图片`);
  return images;
}

/**
 * 从drawings中提取文本框
 * @param {Object} drawings - Excel drawings对象
 * @param {Array} images - 图片数组（用于添加文本框）
 */
export function extractTextFromDrawings(drawings, images) {
  try {
    // console.log('开始提取drawings中的文本框...');
    // console.log('drawings类型:', typeof drawings);
    // console.log('drawings内容:', drawings);
    
    if (Array.isArray(drawings)) {
      drawings.forEach((drawing, index) => {
        // console.log(`处理drawing ${index}:`, drawing);
        extractTextFromSingleDrawing(drawing, images);
      });
    } else if (drawings && typeof drawings === 'object') {
      // 如果是对象，尝试遍历其属性
      Object.keys(drawings).forEach(key => {
        // console.log(`处理drawing属性 ${key}:`, drawings[key]);
        extractTextFromSingleDrawing(drawings[key], images);
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
export function extractTextFromSingleDrawing(drawing, images) {
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
export function extractTextFromWorkbook(workbook, images) {
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
        extractTextFromDrawings(workbook[prop], images);
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
export function extractTextFromWorksheetProperties(worksheet, images) {
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
        extractTextFromDrawings(worksheet[prop], images);
      }
    });
    
    // 检查worksheet.model属性
    if (worksheet.model) {
      // console.log('检查worksheet.model属性...');
      possibleTextProperties.forEach(prop => {
        if (worksheet.model[prop]) {
          // console.log(`找到worksheet.model.${prop}:`, worksheet.model[prop]);
          extractTextFromDrawings(worksheet.model[prop], images);
        }
      });
    }
    
  } catch (e) {
    console.warn('从worksheet属性提取文本框失败:', e);
  }
}
