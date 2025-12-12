@echo off
setlocal

REM =======================================
REM Nginx Only Stop Script
REM =======================================
set NGINX_DIR=C:\nginx-1.28.0
REM =======================================

echo ============================================
echo Stopping Nginx Server
echo ============================================

cd /d %NGINX_DIR%
if exist nginx.exe (
  echo [INFO] Stopping Nginx...
  .\nginx -s stop
  if %errorlevel%==0 (
    echo [OK] Nginx stopped successfully.
  ) else (
    echo [WARN] Nginx stop command returned an error.
    echo [INFO] Attempting force stop...
    taskkill /F /IM nginx.exe >nul 2>&1
    if %errorlevel%==0 (
      echo [OK] Nginx force stopped.
    ) else (
      echo [WARN] No Nginx processes found to stop.
    )
  )
) else (
  echo [WARN] nginx.exe not found in %NGINX_DIR%
)

echo ============================================
echo Nginx stop operation completed.
echo ============================================
echo.
echo This window will close in 2 seconds...
timeout /t 2 /nobreak >nul
exit
