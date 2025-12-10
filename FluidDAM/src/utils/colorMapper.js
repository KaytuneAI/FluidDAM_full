// src/utils/colorMapper.js

const TL_BASE_COLORS = ['black','grey','white','red','orange','yellow','green','blue','violet'];

/**
 * 将任意 Excel 颜色 → TLDraw 基础枚举色。
 * 设计原则：
 * 1) 非纯白必可见（极浅默认给 grey，可配置）
 * 2) 低饱和度优先落灰，但对"土黄/卡其/麦色"特判为 orange
 * 3) 有色相按最近色相桶映射
 */
export function mapExcelColorToTL(colorInput, options = {}) {
  const {
    minSaturation = 0.18,
    lightnessAsWhite = 0.92,
    lightnessAsBlack = 0.12,
    forceVeryLightToGrey = true,
  } = options;

  const rgb = parseAnyColor(colorInput);
  if (!rgb) return 'grey';
  const { r, g, b } = rgb;

  const { h, s, l } = rgbToHsl(r, g, b);

  // 纯白色检查 - 纯白色(#FFFFFF)始终映射为白色
  if (r === 255 && g === 255 && b === 255) {
    return 'white';
  }

  // 近白
  if (l >= lightnessAsWhite) {
    return forceVeryLightToGrey ? 'grey' : 'white';
  }
  // 近黑
  if (l <= lightnessAsBlack) {
    return 'black';
  }

  // 低饱和度或土黄类颜色
  if (s < minSaturation || isTanLike(h, s, l)) {
    if (isTanLike(h, s, l)) return 'orange';
    return 'grey';
  }

  // 色相分桶
  const hue = (h + 360) % 360;
  const buckets = [
    { name: 'red',    deg:   0 },
    { name: 'orange', deg:  30 },
    { name: 'yellow', deg:  55 },
    { name: 'green',  deg: 120 },
    { name: 'blue',   deg: 210 },
    { name: 'violet', deg: 275 },
    { name: 'red',    deg: 360 },
  ];

  let best = 'grey';
  let bestDist = Infinity;
  for (const bkt of buckets) {
    const d = Math.min(Math.abs(hue - bkt.deg), 360 - Math.abs(hue - bkt.deg));
    if (d < bestDist) { bestDist = d; best = bkt.name; }
  }
  return best;
}

/** 识别"土黄/卡其/棕黄/麦色"等弱饱和暖色 → 归 orange */
function isTanLike(h, s, l) {
  const hue = (h + 360) % 360;
  // 排除纯黄色 (H=60°)
  if (Math.abs(hue - 60) < 5) return false;
  
  // 黄色到橙色的色相范围，但排除纯黄色
  const inWarmTanHue = (hue >= 15 && hue <= 55) || (hue >= 65 && hue <= 75);
  // 中等亮度范围
  const inMidLight = l >= 0.20 && l <= 0.90;
  // 对于高饱和度的黄色调，也认为是土黄类（但排除纯黄）
  const isHighSatYellow = s > 0.5 && hue >= 40 && hue <= 70 && Math.abs(hue - 60) > 5;
  
  return (inWarmTanHue && inMidLight) || isHighSatYellow;
}

/** 解析 Excel/VBA 常见颜色格式 */
function parseAnyColor(input) {
  if (input == null) return null;

  // 1) VBA JSON: {"rgb":"#RRGGBB"}
  if (typeof input === 'string' && input.trim().startsWith('{')) {
    try {
      const obj = JSON.parse(input);
      if (obj && typeof obj.rgb === 'string') return hexToRgb(obj.rgb);
    } catch (_) {}
  }

  // 2) #RRGGBB / #RGB
  if (typeof input === 'string' && input.trim().startsWith('#')) {
    return hexToRgb(input.trim());
  }

  // 3) rgb(r,g,b)
  if (typeof input === 'string' && /^rgb\s*\(/i.test(input)) {
    const m = input.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (m) {
      return {
        r: clamp255(parseInt(m[1], 10)),
        g: clamp255(parseInt(m[2], 10)),
        b: clamp255(parseInt(m[3], 10)),
      };
    }
  }

  // 4) 十进制整数（常见 OLE_COLOR: BGR → RGB）
  if (typeof input === 'number' || /^\d+$/.test(String(input))) {
    const n = typeof input === 'number' ? input : parseInt(String(input), 10);
    // OLE_COLOR 是 BGR 格式，需要转换为 RGB
    const b = n & 0xFF;        // 蓝色在最低位
    const g = (n >> 8) & 0xFF;  // 绿色在中间位
    const r = (n >> 16) & 0xFF; // 红色在最高位
    return { r, g, b };
  }

  return null;
}

function hexToRgb(hex) {
  const s = hex.replace('#','').trim();
  if (s.length === 3) {
    const r = parseInt(s[0] + s[0], 16);
    const g = parseInt(s[1] + s[1], 16);
    const b = parseInt(s[2] + s[2], 16);
    return { r, g, b };
  }
  if (s.length === 6) {
    const r = parseInt(s.substring(0,2), 16);
    const g = parseInt(s.substring(2,4), 16);
    const b = parseInt(s.substring(4,6), 16);
    return { r, g, b };
  }
  return null;
}

function clamp255(x){ return Math.max(0, Math.min(255, x|0)); }

function rgbToHsl(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  const d = max - min;
  if (d === 0) { h = 0; s = 0; }
  else {
    s = d / (1 - Math.abs(2*l - 1));
    switch (max) {
      case R: h = 60 * (((G - B) / d) % 6); break;
      case G: h = 60 * (((B - R) / d) + 2); break;
      case B: h = 60 * (((R - G) / d) + 4); break;
    }
  }
  if (h < 0) h += 360;
  return { h, s, l };
}
