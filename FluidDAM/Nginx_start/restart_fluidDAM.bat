@echo off
setlocal

REM =======================================
REM Simple FluidDAM Restart Script
REM =======================================
set PORT=3001
set NODE_DIR=C:\FluidDAM
REM =======================================

echo ============================================
echo Simple FluidDAM Restart
echo ============================================

REM --- Stop all Node processes on port 3001 ---
echo [INFO] Stopping processes on port %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do (
  echo [INFO] Stopping process %%a
  taskkill /F /PID %%a >nul 2>&1
)

REM --- Wait a moment ---
echo [INFO] Waiting for processes to stop...
timeout /t 3 /nobreak >nul

REM --- Start new process ---
echo [INFO] Starting FluidDAM server...
cd /d %NODE_DIR%
if exist package.json (
  echo [INFO] Starting server...
  start "FluidDAM Server" cmd /k "npm run server"
  timeout /t 2 /nobreak >nul
  echo [OK] FluidDAM server restarted
) else (
  echo [ERROR] package.json not found in %NODE_DIR%
  pause
  exit /b
)

echo ============================================
echo Restart completed!
echo ============================================

pause
