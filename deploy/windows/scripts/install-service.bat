@echo off
setlocal

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo This script must be run as Administrator.
  exit /b 1
)

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
set "SERVICE_EXE=%ROOT_DIR%\service\TheStorehouseService.exe"
set "TRAY_EXE=%ROOT_DIR%\tray\TheStorehouseTray.exe"

if not exist "%SERVICE_EXE%" (
  if exist "%ROOT_DIR%\service\TheStorehouseService.exe.html" (
    echo Found TheStorehouseService.exe.html instead of TheStorehouseService.exe.
    echo Re-download the TheStorehouse-win-x64.zip release and extract again.
  )
  echo Service wrapper not found: %SERVICE_EXE%
  exit /b 1
)

"%SERVICE_EXE%" install
if %errorlevel% neq 0 (
  echo Failed to install service.
  exit /b 1
)

"%SERVICE_EXE%" start
if %errorlevel% neq 0 (
  echo Service installed but failed to start.
  exit /b 1
)

if exist "%TRAY_EXE%" (
  reg add "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v "TheStorehouseTray" /t REG_SZ /d "\"%TRAY_EXE%\"" /f >nul 2>&1
  start "" "%TRAY_EXE%"
) else (
  echo Tray app not found: %TRAY_EXE%
)

echo The Storehouse service is installed and running.
endlocal
