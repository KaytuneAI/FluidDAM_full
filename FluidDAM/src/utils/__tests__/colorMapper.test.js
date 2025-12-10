// src/utils/__tests__/colorMapper.test.js

import { mapExcelColorToTL } from '../colorMapper.js';

describe('mapExcelColorToTL', () => {
  // 测试用例：极浅色映射
  test('极浅色默认映射为grey', () => {
    expect(mapExcelColorToTL('#FFFFFF')).toBe('grey');
    expect(mapExcelColorToTL('#FEFEFE')).toBe('grey');
    expect(mapExcelColorToTL('#F5F5F5')).toBe('grey');
  });

  test('极浅色可配置为white', () => {
    expect(mapExcelColorToTL('#FFFFFF', { forceVeryLightToGrey: false })).toBe('white');
  });

  // 测试用例：极深色映射
  test('极深色映射为black', () => {
    expect(mapExcelColorToTL('#000000')).toBe('black');
    expect(mapExcelColorToTL('#101010')).toBe('black');
    expect(mapExcelColorToTL('#1A1A1A')).toBe('black');
  });

  // 测试用例：土黄/卡其/麦色特判
  test('土黄类颜色映射为orange', () => {
    expect(mapExcelColorToTL('#EEDC82')).toBe('orange'); // Light Goldenrod
    expect(mapExcelColorToTL('#D2B48C')).toBe('orange'); // Tan
    expect(mapExcelColorToTL('#F5DEB3')).toBe('orange'); // Wheat
    expect(mapExcelColorToTL('#DEB887')).toBe('orange'); // Burlywood
    expect(mapExcelColorToTL('#CD853F')).toBe('orange'); // Peru
  });

  // 测试用例：色相映射
  test('典型色相映射', () => {
    expect(mapExcelColorToTL('#FF0000')).toBe('red');
    expect(mapExcelColorToTL('#FFA500')).toBe('orange');
    expect(mapExcelColorToTL('#FFFF00')).toBe('yellow');
    expect(mapExcelColorToTL('#00AA00')).toBe('green');
    expect(mapExcelColorToTL('#0066FF')).toBe('blue');
    expect(mapExcelColorToTL('#8000FF')).toBe('violet');
  });

  // 测试用例：灰度/低饱和度
  test('灰度色映射为grey', () => {
    expect(mapExcelColorToTL('#F2F2F2')).toBe('grey');
    expect(mapExcelColorToTL('#DDDDDD')).toBe('grey');
    expect(mapExcelColorToTL('#AFAFAF')).toBe('grey');
    expect(mapExcelColorToTL('#808080')).toBe('grey');
  });

  // 测试用例：输入格式兼容性
  test('VBA JSON格式', () => {
    expect(mapExcelColorToTL('{"rgb":"#FF0000"}')).toBe('red');
    expect(mapExcelColorToTL('{"rgb":"#00FF00"}')).toBe('green');
    expect(mapExcelColorToTL('{"rgb":"#0000FF"}')).toBe('blue');
  });

  test('RGB函数格式', () => {
    expect(mapExcelColorToTL('rgb(255,0,0)')).toBe('red');
    expect(mapExcelColorToTL('rgb(0,255,0)')).toBe('green');
    expect(mapExcelColorToTL('rgb(0,0,255)')).toBe('blue');
  });

  test('OLE_COLOR十进制格式', () => {
    // 红色 BGR: 0x0000FF = 255
    expect(mapExcelColorToTL(255)).toBe('red');
    // 绿色 BGR: 0x00FF00 = 65280
    expect(mapExcelColorToTL(65280)).toBe('green');
    // 蓝色 BGR: 0xFF0000 = 16711680
    expect(mapExcelColorToTL(16711680)).toBe('blue');
  });

  test('短十六进制格式', () => {
    expect(mapExcelColorToTL('#F00')).toBe('red');
    expect(mapExcelColorToTL('#0F0')).toBe('green');
    expect(mapExcelColorToTL('#00F')).toBe('blue');
  });

  // 测试用例：边界情况
  test('无效输入返回grey', () => {
    expect(mapExcelColorToTL(null)).toBe('grey');
    expect(mapExcelColorToTL(undefined)).toBe('grey');
    expect(mapExcelColorToTL('')).toBe('grey');
    expect(mapExcelColorToTL('invalid')).toBe('grey');
  });

  test('透明色处理', () => {
    expect(mapExcelColorToTL('transparent')).toBe('grey');
  });

  // 测试用例：配置选项
  test('自定义阈值配置', () => {
    const options = {
      lightnessAsWhite: 0.95,
      lightnessAsBlack: 0.05,
      minSaturation: 0.25,
      forceVeryLightToGrey: false
    };
    
    expect(mapExcelColorToTL('#F8F8F8', options)).toBe('white'); // 更严格的白色阈值
    expect(mapExcelColorToTL('#0A0A0A', options)).toBe('black'); // 更严格的黑阈值
  });

  // 测试用例：性能测试（确保大表不会成为瓶颈）
  test('性能测试 - 大量颜色映射', () => {
    const colors = [
      '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FFA500', '#800080',
      '#EEDC82', '#D2B48C', '#F5DEB3', '#DEB887', '#CD853F',
      '#FFFFFF', '#000000', '#F2F2F2', '#DDDDDD', '#AFAFAF'
    ];
    
    const startTime = performance.now();
    
    for (let i = 0; i < 1000; i++) {
      colors.forEach(color => {
        mapExcelColorToTL(color);
      });
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // 确保1000次循环处理15000个颜色在100ms内完成
    expect(duration).toBeLessThan(100);
  });

  // 测试用例：特殊颜色组合
  test('特殊颜色组合映射', () => {
    // 浅黄色（应该映射为orange，因为符合土黄特征）
    expect(mapExcelColorToTL('#FFF8DC')).toBe('orange'); // Cornsilk
    
    // 深灰色（应该映射为black）
    expect(mapExcelColorToTL('#2F2F2F')).toBe('black');
    
    // 中等饱和度蓝色（应该映射为blue）
    expect(mapExcelColorToTL('#4169E1')).toBe('blue'); // Royal Blue
    
    // 中等饱和度红色（应该映射为red）
    expect(mapExcelColorToTL('#DC143C')).toBe('red'); // Crimson
  });
});




