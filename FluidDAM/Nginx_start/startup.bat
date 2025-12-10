@echo off
setlocal

REM =======================================
REM Production Mode - Nginx + Node.js
REM Configuration
REM =======================================
set PORT=3001
set NGINX_DIR=C:\nginx-1.28.0
set NODE_DIR=C:\FluidDAM
REM =======================================

echo ============================================
echo FluidDAM Production Server (Nginx + Node.js)
echo ============================================

REM --- Start Node.js Server ---
echo [INFO] Starting Node.js server...
cd /d %NODE_DIR%
if exist package.json (
  echo [INFO] Found Node.js project in %NODE_DIR%
  start "FluidDAM Node Server" cmd /k "npm run server"
  timeout /t 3 /nobreak >nul
  echo [OK] Node.js server started
) else (
  echo [ERROR] package.json not found in %NODE_DIR%
  echo [ERROR] Please check the NODE_DIR path in this script
  pause
  exit /b
)

REM --- Start Nginx ---
echo [INFO] Starting Nginx...
cd /d %NGINX_DIR%
echo [INFO] Checking Nginx config...
.\nginx -t
if not %errorlevel%==0 (
  echo [ERROR] Nginx configuration test failed
  pause
  exit /b
)

REM read pid if exists
set NGXPID=
if exist ".\logs\nginx.pid" (
  for /f "usebackq delims=" %%p in (".\logs\nginx.pid") do set NGXPID=%%p
)

REM if no pid or pid file empty -> treat as not running
if not defined NGXPID (
  echo [INFO] Nginx master PID not found. Cleaning up and starting fresh...
  taskkill /F /IM nginx.exe >nul 2>&1
  del /q ".\logs\nginx.pid" >nul 2>&1
  .\nginx -p "%NGINX_DIR%" -c "conf\nginx.conf"
  if errorlevel 1 (
    echo [ERROR] Failed to start Nginx
    pause
    exit /b
  )
) else (
  echo [INFO] Nginx master PID: %NGXPID%. Reloading...
  .\nginx -s reload
  if errorlevel 1 (
    echo [WARN] Reload failed. Restarting Nginx...
    taskkill /F /IM nginx.exe >nul 2>&1
    del /q ".\logs\nginx.pid" >nul 2>&1
    .\nginx -p "%NGINX_DIR%" -c "conf\nginx.conf"
    if errorlevel 1 (
      echo [ERROR] Failed to start Nginx after reload failure
      pause
      exit /b
    )
  )
)

echo [OK] Nginx is up
echo ============================================
echo All services started successfully!
echo Node.js server: http://localhost:%PORT%
echo Nginx: Check your nginx.conf for configured ports
echo ============================================

pause
