# 如何添加"一键导出所有工作表"按钮到FluidDAM菜单

## 背景
已经在 `Module1.bas` 中添加了 `ExportAllSheets` 函数和对应的 Ribbon 回调函数 `ExportAllSheets_OnAction`。

现在需要在 Excel Ribbon 菜单中添加按钮。

## 步骤

### 方法1：使用Office RibbonX Editor（推荐）

1. **下载并安装 Office RibbonX Editor**
   - 下载地址：https://github.com/fernandreu/office-ribbonx-editor/releases
   
2. **打开 LayoutExporter.xlam**
   - 用 Office RibbonX Editor 打开 `FluidDAM_Lib/LayoutExporter.xlam`
   
3. **编辑 customUI14.xml**
   - 在左侧找到 `customUI` 或 `customUI14` 节点
   - 在现有的按钮列表中添加新按钮：

```xml
<button id="exportAllSheets"
        label="一键导出所有工作表"
        imageMso="ExportExcel"
        size="large"
        onAction="ExportAllSheets_OnAction" />
```

完整的菜单结构示例：
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<customUI xmlns="http://schemas.microsoft.com/office/2009/07/customui" onLoad="OnRibbonLoad">
  <ribbon>
    <tabs>
      <tab id="fluidDAMTab" label="FluidDAM">
        <group id="fluidDAMGroup" label="布局导出">
          <button id="exportLayoutWin"
                  label="导出当前工作表"
                  imageMso="ExportExcel"
                  size="large"
                  onAction="ExportLayoutWin_OnAction" />
          <button id="exportAllSheets"
                  label="一键导出所有工作表"
                  imageMso="ExportTableToSharePointList"
                  size="large"
                  onAction="ExportAllSheets_OnAction" />
          <button id="listAllPictures"
                  label="列出所有图片"
                  imageMso="PictureInsertFromFile"
                  size="normal"
                  onAction="ListAllPictures_OnAction" />
          <button id="listAllBorders"
                  label="列出所有边框"
                  imageMso="BordersAll"
                  size="normal"
                  onAction="ListAllBorders_OnAction" />
          <button id="refreshCache"
                  label="刷新缓存"
                  imageMso="Refresh"
                  size="normal"
                  onAction="RefreshCache_OnAction" />
        </group>
        <group id="fluidDAMHelpGroup" label="帮助">
          <button id="openDocs"
                  label="打开文档"
                  imageMso="Help"
                  size="normal"
                  onAction="OpenDocs_OnAction" />
          <button id="about"
                  label="关于"
                  imageMso="Info"
                  size="normal"
                  onAction="About_OnAction" />
        </group>
      </tab>
    </tabs>
  </ribbon>
</customUI>
```

4. **保存并验证**
   - 点击"Validate"按钮验证XML语法
   - 点击"Save"保存修改
   - 关闭 RibbonX Editor

5. **重新加载Excel**
   - 关闭所有Excel窗口
   - 重新打开Excel
   - FluidDAM菜单中应该会出现"一键导出所有工作表"按钮

### 方法2：手动修改XLAM文件（高级用户）

1. 将 `LayoutExporter.xlam` 重命名为 `LayoutExporter.zip`
2. 解压缩
3. 编辑 `customUI/customUI14.xml`
4. 添加按钮配置（同上）
5. 重新压缩为ZIP
6. 重命名回 `.xlam`

## 功能说明

**ExportAllSheets** 函数会：
- ✅ 自动遍历工作簿中的所有工作表
- ✅ 跳过 `LayoutJson` 工作表本身
- ✅ 跳过完全空白的工作表
- ✅ 为每个工作表生成JSON并存储到 `LayoutJson` 工作表
- ✅ 显示统计信息：导出数量、单元格数、文本框数、图片数、边框数
- ✅ 列出跳过的工作表

## 使用方法

1. 打开包含多个工作表的Excel文件
2. 点击 **FluidDAM > 一键导出所有工作表**
3. 等待处理完成（屏幕更新已禁用以提高速度）
4. 查看完成消息框中的统计信息
5. 检查 `LayoutJson` 工作表，所有工作表的JSON都已导出

## 注意事项

- 如果工作表已经导出过，会更新现有的JSON（不会重复创建）
- 空白工作表会自动跳过
- 如果某个工作表导出失败，会继续处理其他工作表，并在最后列出失败的工作表

