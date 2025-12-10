# 富媒体文本测试指南

## 功能说明
现在VBA代码已经支持导出富媒体文本格式，JavaScript代码也已经支持处理富媒体文本。

## 测试步骤

### 1. 在Excel中创建富媒体文本框
1. 打开Excel
2. 插入一个文本框（插入 > 文本框）
3. 在文本框中输入一些文字，例如："这是普通文字"
4. 选中部分文字（如"普通"），然后：
   - 改变字体（如改为Arial）
   - 改变字号（如改为16pt）
   - 改变颜色（如改为红色）
   - 加粗或斜体
5. 继续输入更多文字，对不同的部分应用不同的格式

### 2. 导出布局
1. 使用FluidDAM的"Fluid布局导出"功能
2. 检查LayoutJson工作表中的JSON数据
3. 应该能看到textbox对象包含`richTextFormatting`字段

### 3. 在Web应用中测试
1. 加载包含富媒体文本的Excel文件
2. 检查控制台输出，应该能看到：
   - "🎨 检测到富媒体文本格式，寻找最小字体:" 消息
   - "📏 使用最小字体:" 消息，显示选中的最小字体信息
   - "📋 富媒体格式详情:" 消息，显示所有格式段，最小字体会标记为"← 最小"
3. 在画布中查看，整个文本框会使用富媒体文本中的最小字体进行显示

## JSON格式说明

富媒体文本格式在JSON中的结构：
```json
{
  "text": "这是普通文字",
  "richTextFormatting": [
    {
      "start": 0,
      "end": 1,
      "fontName": "Microsoft YaHei",
      "fontSize": 12,
      "bold": false,
      "italic": false,
      "color": "#000000"
    },
    {
      "start": 2,
      "end": 3,
      "fontName": "Arial",
      "fontSize": 16,
      "bold": true,
      "italic": false,
      "color": "#FF0000"
    }
  ]
}
```

## 单元格对齐功能

### 支持的对齐方式
- **水平对齐**：left, center, right, justify, distributed, general
- **垂直对齐**：top, middle, bottom, justify, distributed

### JSON格式
单元格对齐信息在JSON中的结构：
```json
{
  "r": 1,
  "c": 1,
  "x": 0,
  "y": 0,
  "w": 100,
  "h": 20,
  "v": "文本内容",
  "hAlign": "center",
  "vAlign": "middle"
}
```

### 显示效果
- 在TLDraw画布中，文本会根据Excel中的对齐方式自动调整位置
- 水平居中：文本在单元格中水平居中显示
- 垂直居中：文本在单元格中垂直居中显示
- 右对齐：文本靠右显示
- 底部对齐：文本靠底部显示

## 注意事项
- 富媒体格式信息会按字符位置记录格式变化
- 每个格式段包含起始位置(start)和结束位置(end)
- 支持的格式属性：fontName, fontSize, bold, italic, color
- 如果富媒体格式解析失败，会回退到普通文本格式
- 单元格对齐通过调整文本的x,y坐标来实现，因为TLDraw v3不支持align属性
