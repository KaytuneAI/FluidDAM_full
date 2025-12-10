@echo off
setlocal ENABLEDELAYEDEXPANSION
title Install FluidDAM (Clean)

set "XLAM=%~dp0LayoutExporter.xlam"
if not exist "%XLAM%" (
  echo [ERROR] LayoutExporter.xlam not found next to this installer.
  echo First run CleanRebuild.ps1 against your source xlam.
  pause
  exit /b 1
)

tasklist /FI "IMAGENAME eq EXCEL.EXE" | find /I "EXCEL.EXE" >nul
if %errorlevel%==0 (
  taskkill /IM EXCEL.EXE /F >nul 2>&1
  timeout /t 2 >nul
)

set "XLSTART=%AppData%\Microsoft\Excel\XLSTART"
if not exist "%XLSTART%" mkdir "%XLSTART%" >nul 2>&1

copy /Y "%XLAM%" "%XLSTART%\LayoutExporter.xlam" >nul

set "OFFVER=16.0"
set "TLKEY=HKCU\Software\Microsoft\Office\%OFFVER%\Excel\Security\Trusted Locations\FluidDAM_XLSTART"
reg add "%TLKEY%" /f >nul
reg add "%TLKEY%" /v Path /t REG_SZ /d "%XLSTART%\" /f >nul
reg add "%TLKEY%" /v Description /t REG_SZ /d "FluidDAM XLSTART" /f >nul
reg add "%TLKEY%" /v AllowSubfolders /t REG_DWORD /d 1 /f >nul

start "" excel.exe
pause
