@echo off
setlocal

REM =======================================
REM Configuration
REM =======================================
set PORT=3001
set NGINX_DIR=C:\nginx-1.28.0
REM =======================================

echo ============================================
echo FluidDAM Full Stop Script
echo ============================================

REM --- Stop Node.js ---
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do set PID=%%a
if defined PID (
  echo [INFO] Found Node process on port %PORT% (PID %PID%)
  taskkill /F /PID %PID% >nul 2>&1
  if %errorlevel%==0 (
    echo [OK] Node process stopped.
  ) else (
    echo [WARN] Failed to stop Node process.
  )
) else (
  echo [INFO] No Node process found on port %PORT%.
)

REM --- Stop Nginx ---
echo [INFO] Attempting to stop Nginx...
cd /d %NGINX_DIR%
if exist nginx.exe (
  .\nginx -s stop
  if %errorlevel%==0 (
    echo [OK] Nginx stopped successfully.
  ) else (
    echo [WARN] Nginx stop command returned an error.
  )
) else (
  echo [WARN] nginx.exe not found in %NGINX_DIR%
)

echo ============================================
echo All stop operations completed.
echo ============================================

pause
