@echo off
setlocal

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo This script must be run as Administrator.
  exit /b 1
)

set SCRIPT_DIR=%~dp0
set ROOT_DIR=%SCRIPT_DIR%..
set SERVICE_EXE=%ROOT_DIR%\service\StorehouseService.exe

if not exist "%SERVICE_EXE%" (
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
