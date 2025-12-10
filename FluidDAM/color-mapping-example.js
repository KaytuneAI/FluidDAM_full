// JavaScript中的颜色映射系统
// 将Excel原始颜色信息映射到TLdraw支持的颜色

// TLdraw支持的颜色枚举
const TLDRAW_COLORS = {
    black: { r: 0, g: 0, b: 0 },
    white: { r: 255, g: 255, b: 255 },
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 255, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    yellow: { r: 255, g: 255, b: 0 },
    orange: { r: 255, g: 165, b: 0 },
    purple: { r: 128, g: 0, b: 128 },
    pink: { r: 255, g: 192, b: 203 },
    cyan: { r: 0, g: 255, b: 255 },
    magenta: { r: 255, g: 0, b: 255 },
    lime: { r: 0, g: 255, b: 0 },
    navy: { r: 0, g: 0, b: 128 },
    maroon: { r: 128, g: 0, b: 0 },
    olive: { r: 128, g: 128, b: 0 },
    teal: { r: 0, g: 128, b: 128 },
    silver: { r: 192, g: 192, b: 192 },
    gray: { r: 128, g: 128, b: 128 },
    lightgray: { r: 211, g: 211, b: 211 },
    darkgray: { r: 64, g: 64, b: 64 },
    lightblue: { r: 173, g: 216, b: 230 },
    darkblue: { r: 0, g: 0, b: 139 },
    lightgreen: { r: 144, g: 238, b: 144 },
    darkgreen: { r: 0, g: 100, b: 0 },
    lightyellow: { r: 255, g: 255, b: 224 },
    darkyellow: { r: 184, g: 134, b: 11 },
    lightred: { r: 255, g: 182, b: 193 },
    darkred: { r: 139, g: 0, b: 0 },
    brown: { r: 165, g: 42, b: 42 },
    tan: { r: 210, g: 180, b: 140 }
};

// 计算两个颜色之间的欧几里得距离
function colorDistance(r1, g1, b1, r2, g2, b2) {
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// 将Excel颜色信息映射到TLdraw颜色
function mapExcelColorToTldraw(colorInfo) {
    // 如果是透明，直接返回
    if (colorInfo === "transparent") {
        return "transparent";
    }
    
    // 解析颜色信息JSON
    let colorData;
    try {
        colorData = JSON.parse(colorInfo);
    } catch (e) {
        console.error("Invalid color info:", colorInfo);
        return "black"; // 默认颜色
    }
    
    // 使用displayColor作为主要颜色
    const displayColor = colorData.displayColor;
    
    // 处理特殊情况
    if (displayColor === -4142) { // xlNone
        return "transparent";
    }
    
    // 转换为RGB
    const r = displayColor & 0xFF;
    const g = (displayColor >> 8) & 0xFF;
    const b = (displayColor >> 16) & 0xFF;
    
    // 纯白色检查 - 纯白色(#FFFFFF)始终映射为白色
    if (r === 255 && g === 255 && b === 255) {
        return "white";
    }
    
    // 找到最接近的TLdraw颜色
    let minDistance = Infinity;
    let closestColor = "black";
    
    for (const [colorName, colorRGB] of Object.entries(TLDRAW_COLORS)) {
        const distance = colorDistance(r, g, b, colorRGB.r, colorRGB.g, colorRGB.b);
        if (distance < minDistance) {
            minDistance = distance;
            closestColor = colorName;
        }
    }
    
    return closestColor;
}

// 处理单元格颜色映射
function processCellColors(cellData) {
    if (cellData.fillColor && cellData.fillColor !== "transparent") {
        // 映射背景色
        cellData.fillColor = mapExcelColorToTldraw(cellData.fillColor);
    }
    
    if (cellData.fontColor && cellData.fontColor !== "transparent") {
        // 映射字体颜色
        cellData.fontColor = mapExcelColorToTldraw(cellData.fontColor);
    }
    
    return cellData;
}

// 处理形状颜色映射
function processShapeColors(shapeData) {
    if (shapeData.fill && shapeData.fill.color) {
        shapeData.fill.color = mapExcelColorToTldraw(shapeData.fill.color);
    }
    
    if (shapeData.border && shapeData.border.color) {
        shapeData.border.color = mapExcelColorToTldraw(shapeData.border.color);
    }
    
    if (shapeData.style && shapeData.style.color) {
        shapeData.style.color = mapExcelColorToTldraw(shapeData.style.color);
    }
    
    return shapeData;
}

// 处理边框颜色映射
function processBorderColors(borderData) {
    if (borderData.styles) {
        for (const side in borderData.styles) {
            if (borderData.styles[side].colorRGB) {
                borderData.styles[side].colorRGB = mapExcelColorToTldraw(borderData.styles[side].colorRGB);
            }
        }
    }
    
    return borderData;
}

// 主处理函数：处理整个布局数据
function processLayoutColors(layoutData) {
    // 处理单元格颜色
    if (layoutData.cells) {
        layoutData.cells = layoutData.cells.map(processCellColors);
    }
    
    // 处理文本框颜色
    if (layoutData.textboxes) {
        layoutData.textboxes = layoutData.textboxes.map(processShapeColors);
    }
    
    // 处理图片颜色（如果有边框等）
    if (layoutData.images) {
        layoutData.images = layoutData.images.map(processShapeColors);
    }
    
    // 处理边框颜色
    if (layoutData.borders) {
        layoutData.borders = layoutData.borders.map(processBorderColors);
    }
    
    return layoutData;
}

// 使用示例
function example() {
    // 从VBA获取的原始数据
    const rawLayoutData = {
        cells: [
            {
                r: 1, c: 1, v: "Test",
                fillColor: '{"displayColor":16776960,"interiorColor":16776960,"colorIndex":6,"rgb":"#FFFF00"}',
                fontColor: '{"displayColor":0,"interiorColor":0,"colorIndex":1,"rgb":"#000000"}'
            }
        ],
        textboxes: [
            {
                name: "TextBox1",
                fill: { color: '{"displayColor":255,"interiorColor":255,"colorIndex":3,"rgb":"#FF0000"}' }
            }
        ]
    };
    
    // 处理颜色映射
    const processedData = processLayoutColors(rawLayoutData);
    
    console.log("Processed data:", processedData);
    // 输出：
    // {
    //   cells: [
    //     {
    //       r: 1, c: 1, v: "Test",
    //       fillColor: "yellow",  // 映射后的颜色
    //       fontColor: "black"    // 映射后的颜色
    //     }
    //   ],
    //   textboxes: [
    //     {
    //       name: "TextBox1",
    //       fill: { color: "red" }  // 映射后的颜色
    //     }
    //   ]
    // }
}

export {
    mapExcelColorToTldraw,
    processCellColors,
    processShapeColors,
    processBorderColors,
    processLayoutColors
};

