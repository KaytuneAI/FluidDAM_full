/**
 * 单位换算相关工具函数
 */

/**
 * 单位换算：行高 points -> px
 * @param {number} points - 行高（points）
 * @returns {number} 像素值
 */
export function pointsToPx(points) {
  return points * 96 / 72;
}

/**
 * 单位换算：列宽 Excel width -> px
 * @param {number} width - Excel列宽
 * @returns {number} 像素值
 */
export function columnWidthToPx(width) {
  // Excel列宽近似换算公式（Calibri 11下较稳）
  // 改进：保留浮点数精度以避免累积误差导致图片裁剪
  return (width + 0.12) * 7;
}
