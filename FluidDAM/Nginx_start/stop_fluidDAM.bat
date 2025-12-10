@echo off
setlocal

REM =======================================
REM FluidDAM Only Stop Script
REM =======================================
set PORT=3001
REM =======================================

echo ============================================
echo Stopping FluidDAM Application
echo ============================================

REM --- Stop Node.js Server ---
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do set PID=%%a
if defined PID (
  echo [INFO] Found FluidDAM process on port %PORT% (PID %PID%)
  taskkill /F /PID %PID% >nul 2>&1
  if %errorlevel%==0 (
    echo [OK] FluidDAM process stopped.
  ) else (
    echo [WARN] Failed to stop FluidDAM process.
  )
) else (
  echo [INFO] No FluidDAM process found on port %PORT%.
)

echo ============================================
echo FluidDAM stop operation completed.
echo ============================================

pause
