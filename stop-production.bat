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

REM Close terminal windows related to production server
echo.
echo Closing terminal windows...
powershell -Command "$processes = Get-Process cmd, powershell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match 'FluidDAM API Server|API Server' }; if ($processes) { $processes | Stop-Process -Force; Write-Host 'Closed' $processes.Count 'terminal window(s)' } else { Write-Host 'No matching terminal windows found' }"

REM Also try to close by process command line
powershell -Command "Get-WmiObject Win32_Process | Where-Object { ($_.CommandLine -like '*npm run server*') -and ($_.Name -eq 'cmd.exe' -or $_.Name -eq 'node.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo.
echo ========================================
echo All services stopped!
echo ========================================
echo.
echo This window will close in 2 seconds...
timeout /t 2 /nobreak >nul
exit








