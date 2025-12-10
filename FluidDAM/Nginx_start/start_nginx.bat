@echo off
setlocal

REM =======================================
REM Nginx Only Startup Script
REM =======================================
set NGINX_DIR=C:\nginx-1.28.0
REM =======================================

echo ============================================
echo Starting Nginx Server
echo ============================================

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
  echo [INFO] Nginx master PID not found. Starting fresh...
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

echo [OK] Nginx is running
echo ============================================
echo Nginx started successfully!
echo Check your nginx.conf for configured ports
echo ============================================

pause
