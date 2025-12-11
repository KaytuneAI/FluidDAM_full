@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo Starting FluidDAM Production Server
echo ========================================
echo.

REM ========================================
REM Configuration
REM ========================================
set NGINX_DIR=C:\nginx-1.28.0
set NODE_DIR=%~dp0FluidDAM
set NGINX_CONF=C:\nginx-1.28.0\conf\nginx.conf

REM ========================================
REM Start Node.js API Server
REM ========================================
echo [1/2] Starting Node.js API Server (Port 3001)...
cd /d "%NODE_DIR%"
if not exist "package.json" (
    echo [ERROR] package.json not found in %NODE_DIR%
    echo [ERROR] Please check the path
    pause
    exit /b 1
)

REM Check if server is already running
netstat -ano | findstr ":3001" >nul
if %errorlevel% == 0 (
    echo [INFO] API server already running on port 3001
) else (
    start "FluidDAM API Server" cmd /k "cd /d %NODE_DIR% && npm run server"
    timeout /t 2 /nobreak >nul
    echo [OK] API server started
)
echo.

REM ========================================
REM Start Nginx
REM ========================================
echo [2/2] Starting Nginx...
cd /d "%NGINX_DIR%"

REM Test nginx configuration
echo [INFO] Testing Nginx configuration...
.\nginx.exe -t
if errorlevel 1 (
    echo [ERROR] Nginx configuration test failed
    echo [ERROR] Please check your nginx.conf file
    pause
    exit /b 1
)

REM Check if nginx is already running
set NGXPID=
if exist ".\logs\nginx.pid" (
    for /f "usebackq delims=" %%p in (".\logs\nginx.pid") do set NGXPID=%%p
)

if not defined NGXPID (
    echo [INFO] Starting Nginx...
    taskkill /F /IM nginx.exe >nul 2>&1
    del /q ".\logs\nginx.pid" >nul 2>&1
    .\nginx.exe -p "%NGINX_DIR%" -c "conf\nginx.conf"
    if errorlevel 1 (
        echo [ERROR] Failed to start Nginx
        pause
        exit /b 1
    )
    echo [OK] Nginx started
) else (
    echo [INFO] Nginx already running (PID: %NGXPID%)
    echo [INFO] Reloading Nginx configuration...
    .\nginx.exe -s reload
    if errorlevel 1 (
        echo [WARN] Reload failed. Restarting Nginx...
        taskkill /F /IM nginx.exe >nul 2>&1
        del /q ".\logs\nginx.pid" >nul 2>&1
        .\nginx.exe -p "%NGINX_DIR%" -c "conf\nginx.conf"
        if errorlevel 1 (
            echo [ERROR] Failed to restart Nginx
            pause
            exit /b 1
        )
    )
    echo [OK] Nginx reloaded
)
echo.

echo ========================================
echo All services started successfully!
echo ========================================
echo.
echo Production URLs:
echo   - Home:      https://liquora.cn/
echo   - Link:      https://liquora.cn/link
echo   - BannerGen: https://liquora.cn/bannergen
echo   - SpotStudio: https://liquora.cn/spotstudio
echo   - API:       https://liquora.cn/api
echo.
echo Press any key to close this window (services will continue running)...
pause >nul




