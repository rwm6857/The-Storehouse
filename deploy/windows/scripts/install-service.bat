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

echo The Storehouse service is installed and running.
endlocal
