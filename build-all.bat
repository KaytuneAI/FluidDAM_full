@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo Building FluidDAM Unified Applications
echo ==========================================
echo.

REM Install dependencies for root entry (Home)
echo [Step 1/6] Installing dependencies for root entry...
if not exist "node_modules" (
    echo [INFO] node_modules not found, installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install root dependencies
        pause
        exit /b 1
    )
) else (
    echo [OK] Dependencies already installed
)
echo.

REM Build root entry (Home)
echo [Step 2/6] Building root entry (Home)...
call npm run build
if errorlevel 1 (
    echo [ERROR] Failed to build root entry
    pause
    exit /b 1
)
echo [OK] Root entry built successfully
echo.

REM Install dependencies for Banner_gen
echo [Step 3/6] Installing dependencies for Banner_gen...
cd /d "%~dp0Banner_gen"
if not exist "node_modules" (
    echo [INFO] node_modules not found, installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install Banner_gen dependencies
        pause
        exit /b 1
    )
) else (
    echo [OK] Dependencies already installed
)
echo.

REM Build Banner_gen
echo [Step 4/6] Building Banner_gen...
call npm run build
if errorlevel 1 (
    echo [ERROR] Failed to build Banner_gen
    pause
    exit /b 1
)
echo [OK] Banner_gen built successfully
echo.

REM Install dependencies for FluidDAM
echo [Step 5/6] Installing dependencies for FluidDAM...
cd /d "%~dp0FluidDAM"
if not exist "node_modules" (
    echo [INFO] node_modules not found, installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install FluidDAM dependencies
        pause
        exit /b 1
    )
) else (
    echo [OK] Dependencies already installed
)
echo.

REM Build FluidDAM
echo [Step 6/6] Building FluidDAM (SpotStudio)...
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




