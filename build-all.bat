@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo Building FluidDAM Unified Applications
echo ==========================================
echo.

REM Build root entry (Home)
echo [1/3] Building root entry (Home)...
call npm run build
if errorlevel 1 (
    echo [ERROR] Failed to build root entry
    pause
    exit /b 1
)
echo [OK] Root entry built successfully
echo.

REM Build Banner_gen
echo [2/3] Building Banner_gen...
cd /d "%~dp0Banner_gen"
call npm run build
if errorlevel 1 (
    echo [ERROR] Failed to build Banner_gen
    pause
    exit /b 1
)
echo [OK] Banner_gen built successfully
echo.

REM Build FluidDAM
echo [3/3] Building FluidDAM (SpotStudio)...
cd /d "%~dp0FluidDAM"
call npm run build
if errorlevel 1 (
    echo [ERROR] Failed to build FluidDAM
    pause
    exit /b 1
)
echo [OK] FluidDAM built successfully
echo.

cd /d "%~dp0"

echo ==========================================
echo All builds completed successfully!
echo ==========================================
echo.
echo Build outputs:
echo   - Root entry: .\dist\
echo   - Banner_gen: .\Banner_gen\dist\
echo   - FluidDAM:   .\FluidDAM\dist\
echo.
pause

