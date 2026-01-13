@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
set "XML_PATH=%ROOT_DIR%\service\StorehouseService.xml"
set PORT=3040

if exist "%XML_PATH%" (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "try { (Select-Xml -Path '%XML_PATH%' -XPath \"//env[@name='PORT']\").Node.value } catch { '' }"`) do (
    set PORT=%%A
  )
)

start "" "http://localhost:%PORT%"
endlocal
