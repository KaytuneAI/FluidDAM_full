@echo off
setlocal enabledelayedexpansion
title FluidDAM Full Rebuild + Restart

echo =============================================
echo   FluidDAM Full Rebuild + Restart
echo =============================================

REM Step 1: Stop Node.js service if running
echo [INFO] Checking for Node processes...
tasklist | find /i "node.exe" >nul
if %errorlevel%==0 (
    echo [INFO] Node is running. Attempting to stop...
    taskkill /F /IM node.exe >nul 2>&1
    echo [OK] Node stopped.
) else (
    echo [INFO] No Node process detected.
)

REM Step 2: Git pull latest code
echo.
echo [INFO] Updating Git repository...
cd /d C:\FluidDAM
git pull
if %errorlevel% neq 0 (
    echo [ERROR] Git pull failed. Aborting.
    pause
    exit /b 1
)
echo [OK] Git updated.

REM Step 3: Rebuild frontend
echo.
echo [INFO] Rebuilding frontend (npm ci + build)...
call npm ci
if %errorlevel% neq 0 (
    echo [ERROR] npm ci failed. Please check npm logs.
    pause
    exit /b 1
)
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] npm run build failed. Please check build logs.
    pause
    exit /b 1
)
echo [OK] Frontend build complete.

REM Step 3.5: 同步构建产物到生产目录
echo.
echo [INFO] Syncing dist to production webroot...
robocopy C:\FluidDAM\dist C:\www\liquora.cn\dist /MIR
if %errorlevel% lss 8 (
    echo [OK] Sync completed.
) else (
    echo [ERROR] Sync failed! Please check paths or permissions.
    pause
    exit /b 1
)

REM Step 4: Restart Node backend
echo.
echo [INFO] Starting Node server...
start "" node C:\FluidDAM\server.js
timeout /t 3 >nul
echo [OK] Node server restarted.

REM Step 5: Restart Nginx
echo.
echo [INFO] Checking Nginx configuration...
cd /d C:\nginx-1.28.0
nginx -t
if %errorlevel%==0 (
    echo [OK] Nginx config OK. Reloading...
    nginx -s reload
) else (
    echo [ERROR] Nginx config invalid! Please fix before reload.
)
echo [OK] Nginx reload complete.

REM Step 6: Health check
echo.
echo [INFO] Checking Node API health...
curl -s http://localhost:3001 >nul 2>&1
if %errorlevel%==0 (
    echo [OK] API responded successfully.
) else (
    echo [WARN] API may not be ready yet.
)
echo =============================================
echo   FluidDAM rebuild completed successfully.
echo =============================================
pause