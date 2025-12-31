/**
 * 从 HTML 模板中提取所有 data-field 的值
 */
import type { BannerData } from '../../types/index';

export function extractTemplateDataFields(html: string): BannerData {
  const templateData: BannerData = {};
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 提取所有带 data-field 的元素的值
    doc.querySelectorAll<HTMLElement>('[data-field]').forEach((el) => {
      const fieldName = el.getAttribute('data-field');
      if (!fieldName) return;
      
      // 如果字段已经存在，跳过（避免重复）
      if (templateData[fieldName] !== undefined) return;
      
      if (el.tagName === 'IMG') {
        const img = el as HTMLImageElement;
        templateData[fieldName] = img.src || '';
      } else {
        templateData[fieldName] = el.textContent?.trim() || el.innerText?.trim() || '';
      }
    });
    
    // 特殊处理价格字段（data-field-int 和 data-field-decimal）
    doc.querySelectorAll<HTMLElement>('[data-field-int]').forEach((el) => {
      const intName = el.getAttribute('data-field-int');
      const decimalName = el.getAttribute('data-field-decimal');
      
      if (intName && templateData[intName] === undefined) {
        const priceInt2 = el.querySelector('.price-int-2') as HTMLElement;
        const priceInt3 = el.querySelector('.price-int-3') as HTMLElement;
        let intValue = '';
        
        if (priceInt2 || priceInt3) {
          intValue = (priceInt2?.textContent || priceInt3?.textContent || '').trim();
        } else {
          const signNode = el.querySelector('.sign');
          intValue = signNode?.nextSibling?.nodeValue?.trim() || '';
        }
        
        templateData[intName] = intValue;
      }
      
      if (decimalName && templateData[decimalName] === undefined) {
        const priceDecimal2 = el.querySelector('.price-decimal-2') as HTMLElement;
        const priceDecimal3 = el.querySelector('.price-decimal-3') as HTMLElement;
        let decValue = '';
        
        if (priceDecimal2 || priceDecimal3) {
          decValue = (priceDecimal2?.textContent || priceDecimal3?.textContent || '').trim();
        } else {
          const decimalNode = el.querySelector('.decimal');
          decValue = decimalNode?.textContent?.trim() || '';
        }
        
        templateData[decimalName] = decValue;
      }
    });
    
    // 处理数组类型的字段（如 product_main_src）
    // 查找所有相同 data-field 的元素，如果多个，组成数组
    const fieldGroups = new Map<string, string[]>();
    doc.querySelectorAll<HTMLElement>('[data-field]').forEach((el) => {
      const fieldName = el.getAttribute('data-field');
      if (!fieldName) return;
      
      // 跳过已经处理过的字段
      if (templateData[fieldName] !== undefined && !Array.isArray(templateData[fieldName])) return;
      
      if (el.tagName === 'IMG') {
        const img = el as HTMLImageElement;
        const src = img.src || '';
        if (src) {
          if (!fieldGroups.has(fieldName)) {
            fieldGroups.set(fieldName, []);
          }
          fieldGroups.get(fieldName)!.push(src);
        }
      }
    });
    
    // 将数组类型的字段设置到 templateData
    fieldGroups.forEach((values, fieldName) => {
      if (values.length > 1) {
        templateData[fieldName] = values;
      } else if (values.length === 1) {
        // 如果只有一个值，保持为字符串（向后兼容）
        templateData[fieldName] = values[0];
      }
    });
    
  } catch (e) {
    console.warn('提取模板 data-field 值失败:', e);
  }
  
  return templateData;
}

/**
 * 将模板数据填充到 JSON 的第一个数据项
 * 无论 JSON 原来是什么，都将模板数据放在第一位，原 JSON 数据后移
 */
export function populateTemplateDataToJson(
  jsonData: BannerData[],
  templateData: BannerData
): BannerData[] {
  if (Object.keys(templateData).length === 0) {
    // 如果模板没有数据，直接返回原 JSON
    return jsonData;
  }
  
  // 无论 JSON 是否为空，都将模板数据放在第一位，原 JSON 数据后移
  return [templateData, ...jsonData];
}

