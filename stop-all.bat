@echo off
echo ========================================
echo Stopping all FluidDAM applications...
echo ========================================
echo.

REM Find and stop processes by port
echo Finding and stopping process on port 3000 (Unified Entry)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Stopping process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo Finding and stopping process on port 3001 (Unified API Server)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo Stopping process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo Finding and stopping process on port 5174 (Banner_gen)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174" ^| findstr "LISTENING"') do (
    echo Stopping process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo Finding and stopping process on port 5173 (FluidDAM)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo Stopping process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

REM Close terminal windows by window title
echo.
echo Closing terminal windows...
REM Close windows by title using PowerShell (more reliable than taskkill)
powershell -Command "$processes = Get-Process cmd, powershell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match 'FluidDAM|Banner_gen|Unified API|API Server|Unified Entry' }; if ($processes) { $processes | Stop-Process -Force; Write-Host 'Closed' $processes.Count 'terminal window(s)' } else { Write-Host 'No matching terminal windows found' }"

REM Also try to close by process command line (for windows started with specific commands)
powershell -Command "Get-WmiObject Win32_Process | Where-Object { ($_.CommandLine -like '*npm run server*' -or $_.CommandLine -like '*npm run dev*') -and ($_.Name -eq 'cmd.exe' -or $_.Name -eq 'node.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo.
echo All applications and terminal windows stopped!
echo.
echo This window will close in 2 seconds...
timeout /t 2 /nobreak >nul
exit
