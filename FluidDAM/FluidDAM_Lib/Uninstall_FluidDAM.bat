@echo off
setlocal ENABLEDELAYEDEXPANSION
title FluidDAM Uninstaller (Quiet)

set "LOGFILE=%TEMP%\FluidDAM_Uninstall.log"
set "DOLOG=0"
if /I "%~1"=="-log" set "DOLOG=1"
if /I "%~1"=="/log" set "DOLOG=1"

echo [%date% %time%] Starting FluidDAM uninstaller>"%LOGFILE%"

REM helper to log
set "_LOG=call :_log"
goto :main

:_log
if "%DOLOG%"=="1" echo %*
>>"%LOGFILE%" echo %*
exit /b 0

:main
%_LOG% Excel close check
tasklist /FI "IMAGENAME eq EXCEL.EXE" | find /I "EXCEL.EXE" >nul
if %errorlevel%==0 (
  echo Closing Excel...
  taskkill /IM EXCEL.EXE /F >nul 2>&1
  timeout /t 2 >nul
) else (
  echo Excel is not running.
)

REM Candidate folders
set "USR_XLSTART=%AppData%\Microsoft\Excel\XLSTART"
set "CMN_XLSTART=%ProgramFiles%\Microsoft Office\root\Office16\XLSTART"
set "CMN_XLSTART_X86=%ProgramFiles(x86)%\Microsoft Office\root\Office16\XLSTART"
set "USR_ADDINS=%AppData%\Microsoft\AddIns"

for %%D in ("%USR_XLSTART%" "%CMN_XLSTART%" "%CMN_XLSTART_X86%" "%USR_ADDINS%") do (
  if exist "%%~D" (
    for %%F in ("LayoutExporter_New.xlam" "LayoutExporter_Pro.xlam" "LayoutExporter.xlam" ) do (
      if exist "%%~D\%%~F" (
        echo Removing "%%~D\%%~F"
        del /f /q "%%~D\%%~F" >nul 2>&1
        %_LOG% Deleted file %%~D\%%~F
      )
    )
    if exist "%%~D\FluidDAM_Icons" (
      echo Removing folder "%%~D\FluidDAM_Icons"
      rmdir /s /q "%%~D\FluidDAM_Icons" >nul 2>&1
      %_LOG% Removed folder %%~D\FluidDAM_Icons
    )
  )
)

REM Trusted Locations removal with existence checks
for %%V in (16.0 15.0 14.0) do (
  reg query "HKCU\Software\Microsoft\Office\%%V\Excel\Security\Trusted Locations\FluidDAM_XLSTART" >nul 2>&1
  if %errorlevel%==0 (
    reg delete "HKCU\Software\Microsoft\Office\%%V\Excel\Security\Trusted Locations\FluidDAM_XLSTART" /f >nul 2>&1
    %_LOG% Removed Trusted Location for Office %%V
  )
)

REM OPEN entries cleanup (only if present)
for %%V in (16.0 15.0 14.0) do (
  reg query "HKCU\Software\Microsoft\Office\%%V\Excel\Options" >nul 2>&1
  if !errorlevel! equ 0 (
    for /f "tokens=1,2,*" %%A in ('reg query "HKCU\Software\Microsoft\Office\%%V\Excel\Options" ^| find /I "REG_SZ"') do (
      set "VAL=%%A"
      set "DATA=%%C"
      echo !VAL! | find /I "OPEN" >nul
      if !errorlevel! equ 0 (
        echo !DATA! | find /I ".xlam" >nul && (
          echo !DATA! | find /I "LayoutExporter" >nul && reg delete "HKCU\Software\Microsoft\Office\%%V\Excel\Options" /v "%%~nA" /f >nul 2>&1
          echo !DATA! | find /I "FluidDAM" >nul && reg delete "HKCU\Software\Microsoft\Office\%%V\Excel\Options" /v "%%~nA" /f >nul 2>&1
          echo !DATA! | find /I "XLSTART" >nul && reg delete "HKCU\Software\Microsoft\Office\%%V\Excel\Options" /v "%%~nA" /f >nul 2>&1
          %_LOG% Removed Excel Options value %%~nA for Office %%V
        )
      )
    )
  )
)

REM DisabledItems cleanup (quietly if key missing)
for %%V in (16.0 15.0 14.0) do (
  reg query "HKCU\Software\Microsoft\Office\%%V\Excel\Resiliency\DisabledItems" >nul 2>&1
  if !errorlevel! equ 0 (
    for /f "delims=" %%D in ('reg query "HKCU\Software\Microsoft\Office\%%V\Excel\Resiliency\DisabledItems"') do (
      reg delete "%%D" /f >nul 2>&1
      %_LOG% Removed DisabledItems entry %%D
    )
  )
)

echo.
echo FluidDAM cleanup finished.
if "%DOLOG%"=="1" (
  echo A log was written to: %LOGFILE%
) else (
  echo (Run with -log to capture details: Uninstall_FluidDAM.bat -log)
)
echo.
pause
