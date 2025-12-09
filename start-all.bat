@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo 正在启动 FluidDAM 统一入口应用...
echo ========================================
echo.

REM 检查是否已安装依赖
if not exist "node_modules" (
    echo [警告] 根目录未检测到 node_modules，正在安装依赖...
    call npm install
    echo.
)

if not exist "Banner_gen\node_modules" (
    echo [警告] Banner_gen 未检测到 node_modules，正在安装依赖...
    cd /d "%~dp0Banner_gen"
    call npm install
    cd /d "%~dp0"
    echo.
)

if not exist "FluidDAM\node_modules" (
    echo [警告] FluidDAM 未检测到 node_modules，正在安装依赖...
    cd /d "%~dp0FluidDAM"
    call npm install
    cd /d "%~dp0"
    echo.
)

echo 启动统一入口应用 (端口 3000)...
cd /d "%~dp0"
start "FluidDAM 统一入口" cmd /k "cd /d %~dp0 && npm run dev"

timeout /t 2 /nobreak >nul

echo 启动 Banner_gen 应用 (端口 5174)...
cd /d "%~dp0Banner_gen"
start "Banner_gen" cmd /k "cd /d %~dp0Banner_gen && npm run dev"

timeout /t 2 /nobreak >nul

echo 启动 FluidDAM 应用 (端口 5173)...
cd /d "%~dp0FluidDAM"
start "FluidDAM" cmd /k "cd /d %~dp0FluidDAM && npm run dev"

timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo 所有应用已启动！
echo ========================================
echo.
echo 统一入口: http://localhost:3000
echo Banner_gen: http://localhost:5174
echo FluidDAM: http://localhost:5173
echo.
echo 按任意键关闭此窗口（应用将继续运行）...
pause >nul

