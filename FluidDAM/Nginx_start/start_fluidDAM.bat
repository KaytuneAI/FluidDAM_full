@echo off
setlocal

REM =======================================
REM FluidDAM Only Startup Script
REM =======================================
set PORT=3001
set NODE_DIR=C:\FluidDAM
REM =======================================

echo ============================================
echo Starting FluidDAM Application
echo ============================================

REM --- Check if already running ---
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do (
  echo [WARN] FluidDAM is already running on port %PORT% (PID %%a)
  echo [INFO] Use stop_fluidDAM.bat to stop it first, or restart_fluidDAM.bat to restart
  pause
  exit /b
)

REM --- Start Node.js Server ---
echo [INFO] Starting FluidDAM server...
cd /d %NODE_DIR%
if exist package.json (
  echo [INFO] Found FluidDAM project in %NODE_DIR%
  start "FluidDAM Server" cmd /k "npm run server"
  timeout /t 3 /nobreak >nul
  echo [OK] FluidDAM server started on port %PORT%
) else (
  echo [ERROR] package.json not found in %NODE_DIR%
  echo [ERROR] Please check the NODE_DIR path in this script
  pause
  exit /b
)

echo ============================================
echo FluidDAM started successfully!
echo Access: http://localhost:%PORT%
echo ============================================

pause
