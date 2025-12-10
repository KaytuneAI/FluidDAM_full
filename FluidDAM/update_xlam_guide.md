# 更新XLAM文件指南

## 步骤1：打开XLAM文件
1. 打开Excel
2. 文件 → 打开 → 选择 `FluidDAM_Lib/LayoutExporter.xlam`

## 步骤2：编辑VBA代码
1. 按 `Alt + F11` 打开VBA编辑器
2. 在项目资源管理器中找到 `LayoutExporter.xlam`
3. 展开 `VBAProject (LayoutExporter.xlam)`
4. 找到 `Module1` 模块
5. 双击打开Module1

## 步骤3：替换代码
1. 选择Module1中的所有代码（Ctrl+A）
2. 删除现有代码
3. 复制 `Module1.bas` 文件中的所有内容
4. 粘贴到Module1中

## 步骤4：保存
1. 按 `Ctrl + S` 保存VBA代码
2. 关闭VBA编辑器
3. 在Excel中按 `Ctrl + S` 保存XLAM文件

## 步骤5：测试
1. 重新加载XLAM文件
2. 运行 `TestActualColorOutput` 函数测试颜色输出
3. 运行 `ExportLayoutWin` 函数测试导出功能

## 重要提示
- 确保XLAM文件中的VBA代码与 `Module1.bas` 完全一致
- 特别是新增的颜色处理函数：`BuildColorInfo`, `GetCellFillColor`, `TestActualColorOutput`
- 检查JSON格式的颜色输出是否正确

