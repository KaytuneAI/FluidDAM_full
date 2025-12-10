# FluidDAM Excel 工具使用说明

## 概述
FluidDAM_Lib 目录包含了用于在 Excel 中集成 FluidDAM 功能的工具。这些工具可以让您在 Excel 中直接使用 FluidDAM 的布局导出功能。

## 文件说明

### 1. LayoutExporter.xlam
- **功能**: Excel 加载宏文件，提供 FluidDAM 的布局导出功能
- **类型**: Excel 加载宏 (.xlam)
- **用途**: 在 Excel 中启用 FluidDAM 相关功能

### 2. Install_FluidDAM.bat
- **功能**: 自动安装 FluidDAM 到 Excel
- **作用**: 
  - 关闭正在运行的 Excel 进程
  - 将 LayoutExporter.xlam 复制到 Excel 的 XLSTART 目录
  - 在注册表中添加受信任位置
  - 启动 Excel

### 3. Uninstall_FluidDAM.bat
- **功能**: 完全卸载 FluidDAM
- **作用**:
  - 关闭 Excel 进程
  - 删除所有相关文件
  - 清理注册表项
  - 移除受信任位置设置

## 安装步骤

### 方法一：自动安装（推荐）
1. 确保 Excel 已关闭
2. 双击运行 `Install_FluidDAM.bat`
3. 等待安装完成，Excel 会自动启动
4. 安装完成后，FluidDAM 功能将自动加载到 Excel 中

### 方法二：手动安装
1. 关闭 Excel
2. 将 `LayoutExporter.xlam` 复制到以下目录之一：
   - `%AppData%\Microsoft\Excel\XLSTART\`
   - `%ProgramFiles%\Microsoft Office\root\Office16\XLSTART\`
3. 在 Excel 中手动添加受信任位置
4. 重新启动 Excel

## 卸载步骤

### 完全卸载
1. 双击运行 `Uninstall_FluidDAM.bat`
2. 等待卸载完成
3. 重新启动 Excel 确认卸载成功

### 带日志的卸载（用于故障排除）
```bash
Uninstall_FluidDAM.bat -log
```
这将生成详细的卸载日志文件。

## 使用说明

安装完成后，FluidDAM 功能将自动集成到 Excel 中：

1. **启动 Excel**: 打开 Excel 后，FluidDAM 功能会自动加载
2. **访问功能**: 在 Excel 中查找 FluidDAM 相关的菜单或按钮
3. **布局导出**: 使用 FluidDAM 功能进行布局分析和导出

## 故障排除

### 常见问题

1. **安装失败**
   - 确保以管理员身份运行批处理文件
   - 检查 Excel 是否完全关闭
   - 确认 LayoutExporter.xlam 文件存在

2. **功能未加载**
   - 检查 Excel 的受信任位置设置
   - 确认文件已正确复制到 XLSTART 目录
   - 重新启动 Excel

3. **卸载不彻底**
   - 使用 `Uninstall_FluidDAM.bat -log` 生成日志
   - 手动检查注册表项是否已清理
   - 手动删除相关文件

### 日志文件位置
卸载日志保存在：`%TEMP%\FluidDAM_Uninstall.log`

## 系统要求

- Windows 操作系统
- Microsoft Excel 2016 或更高版本
- 管理员权限（用于安装和卸载）

## 注意事项

- 安装前请确保 Excel 完全关闭
- 建议在安装前备份重要的 Excel 文件
- 如果遇到问题，可以使用卸载工具完全清理后重新安装
- 卸载工具会清理所有相关文件和注册表项，请谨慎使用

## 技术支持

如遇到问题，请检查：
1. Excel 版本兼容性
2. 系统权限设置
3. 防病毒软件是否阻止了文件操作
4. 注册表访问权限


