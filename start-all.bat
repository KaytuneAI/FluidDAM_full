@echo off
cd /d "%~dp0"
echo ========================================
echo Starting FluidDAM Unified Entry Application...
echo ========================================
echo.

REM Check if dependencies are installed
if not exist "node_modules" (
    echo [Warning] node_modules not found in root directory, installing dependencies...
    call npm install
    echo.
)

if not exist "Banner_gen\node_modules" (
    echo [Warning] node_modules not found in Banner_gen, installing dependencies...
    cd /d "%~dp0Banner_gen"
    call npm install
    cd /d "%~dp0"
    echo.
)

if not exist "FluidDAM\node_modules" (
    echo [Warning] node_modules not found in FluidDAM, installing dependencies...
    cd /d "%~dp0FluidDAM"
    call npm install
    cd /d "%~dp0"
    echo.
)

echo Starting Unified Backend API Server (Port 3001)...
echo   - FluidDAM API
echo   - Banner_gen API (including Jimeng AI proxy)
cd /d "%~dp0FluidDAM"
start "Unified API Server" cmd /k "cd /d %~dp0FluidDAM && npm run server"

timeout /t 2 /nobreak >nul

echo Starting Banner_gen Application (Port 5173)...
cd /d "%~dp0Banner_gen"
start "Banner_gen" cmd /k "cd /d %~dp0Banner_gen && npm run dev"

timeout /t 2 /nobreak >nul

echo Starting FluidDAM (SpotStudio) Application (Port 5174)...
cd /d "%~dp0FluidDAM"
start "FluidDAM (SpotStudio)" cmd /k "cd /d %~dp0FluidDAM && npm run dev"

timeout /t 2 /nobreak >nul

timeout /t 2 /nobreak >nul

echo Starting Unified Entry Application (Port 3000)...
cd /d "%~dp0"
start "FluidDAM Unified Entry" cmd /k "cd /d %~dp0 && npm run dev"

timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo All applications started!
echo ========================================
echo.
echo Unified Entry: http://localhost:3000
echo   - Banner_gen: http://localhost:3000/Banner_gen
echo   - FluidDAM: http://localhost:3000/FluidDAM
echo   - API: http://localhost:3000/api
echo.
echo Standalone Access (for development/debugging):
echo   - Banner_gen: http://localhost:5173
echo   - FluidDAM (SpotStudio): http://localhost:5174
echo   - Unified API: http://localhost:3001 (FluidDAM + Banner_gen + Jimeng AI proxy)
echo.
echo Tip: Recommended to use unified entry - only one port to remember!
echo.
echo Press any key to close this window (applications will continue running)...
pause >nul
