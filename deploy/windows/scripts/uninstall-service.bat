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
  echo Service wrapper not found: %SERVICE_EXE%
  exit /b 1
)

"%SERVICE_EXE%" stop >nul 2>&1
"%SERVICE_EXE%" uninstall
if %errorlevel% neq 0 (
  echo Failed to uninstall service.
  exit /b 1
)

echo The Storehouse service is uninstalled.
endlocal
