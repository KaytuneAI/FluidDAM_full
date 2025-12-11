@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo Stopping FluidDAM Production Server
echo ========================================
echo.

REM ========================================
REM Stop Node.js API Server
REM ========================================
echo [1/2] Stopping Node.js API Server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001"') do (
    echo [INFO] Killing process %%a on port 3001
    taskkill /F /PID %%a >nul 2>&1
)
echo [OK] API server stopped
echo.

REM ========================================
REM Stop Nginx
REM ========================================
echo [2/2] Stopping Nginx...
cd /d "C:\nginx-1.28.0"
if exist ".\nginx.exe" (
    .\nginx.exe -s quit
    timeout /t 2 /nobreak >nul
    
    REM Force kill if still running
    taskkill /F /IM nginx.exe >nul 2>&1
    del /q ".\logs\nginx.pid" >nul 2>&1
    echo [OK] Nginx stopped
) else (
    echo [WARN] Nginx executable not found
)
echo.

echo ========================================
echo All services stopped!
echo ========================================
echo.
pause




