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

REM Close terminal windows
echo.
echo Closing terminal windows...
powershell -Command "$processes = Get-Process cmd, powershell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match 'FluidDAM|API Server' }; if ($processes) { $processes | Stop-Process -Force; Write-Host 'Closed' $processes.Count 'terminal window(s)' } else { Write-Host 'No matching terminal windows found' }"
powershell -Command "Get-WmiObject Win32_Process | Where-Object { ($_.CommandLine -like '*npm run server*') -and ($_.Name -eq 'cmd.exe' -or $_.Name -eq 'node.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo ============================================
echo FluidDAM stop operation completed.
echo ============================================
echo.
echo This window will close in 2 seconds...
timeout /t 2 /nobreak >nul
exit
