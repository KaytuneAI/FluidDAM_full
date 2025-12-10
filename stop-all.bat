@echo off
chcp 65001 >nul
echo ========================================
echo Stopping all FluidDAM applications...
echo ========================================
echo.

REM Find and stop processes by port
echo Finding and stopping process on port 3000 (Unified Entry)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Stopping process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo Finding and stopping process on port 3001 (API Server)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo Stopping process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo Finding and stopping process on port 5174 (Banner_gen)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174" ^| findstr "LISTENING"') do (
    echo Stopping process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo Finding and stopping process on port 5173 (FluidDAM)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo Stopping process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

REM Close terminal windows by window title
echo.
echo Closing terminal windows...
REM Close windows by title using PowerShell (more reliable than taskkill)
powershell -Command "Get-Process cmd -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match 'FluidDAM|Banner_gen' } | Stop-Process -Force" >nul 2>&1

echo.
echo All applications and terminal windows stopped!
echo.
pause
