@echo off
chcp 65001 >nul
echo ========================================
echo 正在停止所有 FluidDAM 应用...
echo ========================================
echo.

REM 通过端口查找并停止进程
echo 正在查找并停止运行在端口 3000 的进程（统一入口）...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo 停止进程 PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo 正在查找并停止运行在端口 5174 的进程（Banner_gen）...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174" ^| findstr "LISTENING"') do (
    echo 停止进程 PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo 正在查找并停止运行在端口 5173 的进程（FluidDAM）...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo 停止进程 PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo 所有应用已停止！
echo.
pause

