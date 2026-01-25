param(
  [Parameter(Mandatory = $true)]
  [string]$NewRoot
)

$ErrorActionPreference = 'Stop'

function Write-Step($message) {
  Write-Host "[TheStorehouse] $message"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$currentRoot = Resolve-Path (Join-Path $scriptDir '..')
$newRootResolved = Resolve-Path $NewRoot

$serviceExe = Join-Path $currentRoot 'service\TheStorehouseService.exe'
$srcApp = Join-Path $newRootResolved 'app'
$dstApp = Join-Path $currentRoot 'app'

if (!(Test-Path $srcApp)) {
  throw "NewRoot does not contain an app folder: $srcApp"
}

if (!(Test-Path $dstApp)) {
  New-Item -ItemType Directory -Path $dstApp | Out-Null
}

Write-Step 'Stopping service (if installed)...'
if (Test-Path $serviceExe) {
  try {
    & $serviceExe stop | Out-Null
    Start-Sleep -Seconds 2
  } catch {
    Write-Step 'Service stop failed or not installed. Continuing.'
  }
}

Write-Step 'Stopping tray (if running)...'
Get-Process -Name TheStorehouseTray -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Step 'Updating server runtime (src)...'
$srcSrc = Join-Path $srcApp 'src'
$dstSrc = Join-Path $dstApp 'src'
if (!(Test-Path $srcSrc)) {
  throw "NewRoot app is missing src: $srcSrc"
}
if (Test-Path $dstSrc) { Remove-Item $dstSrc -Recurse -Force }
Copy-Item $srcSrc $dstSrc -Recurse -Force

Write-Step 'Updating production dependencies (node_modules)...'
$srcModules = Join-Path $srcApp 'node_modules'
$dstModules = Join-Path $dstApp 'node_modules'
if (!(Test-Path $srcModules)) {
  throw "NewRoot app is missing node_modules: $srcModules"
}
if (Test-Path $dstModules) { Remove-Item $dstModules -Recurse -Force }
Copy-Item $srcModules $dstModules -Recurse -Force

Write-Step 'Updating app metadata (.env.example, package.json, package-lock.json)...'
$metadataFiles = @('.env.example', 'package.json', 'package-lock.json')
foreach ($file in $metadataFiles) {
  $srcFile = Join-Path $srcApp $file
  if (Test-Path $srcFile) {
    Copy-Item $srcFile $dstApp -Force
  }
}

Write-Step 'Preserving app/data, app/config.json, and app/.env (no changes).'
$configSrc = Join-Path $srcApp 'config.json'
$configDst = Join-Path $dstApp 'config.json'
if ((Test-Path $configSrc) -and !(Test-Path $configDst)) {
  Copy-Item $configSrc $configDst -Force
}

Write-Step 'Updating VERSION.txt...'
$versionSrc = Join-Path $newRootResolved 'VERSION.txt'
$versionDst = Join-Path $currentRoot 'VERSION.txt'
if (Test-Path $versionSrc) {
  Copy-Item $versionSrc $versionDst -Force
}

Write-Step 'Updating tray app (if present)...'
$srcTray = Join-Path $newRootResolved 'tray'
$dstTray = Join-Path $currentRoot 'tray'
if (Test-Path $srcTray) {
  if (Test-Path $dstTray) { Remove-Item $dstTray -Recurse -Force }
  Copy-Item $srcTray $dstTray -Recurse -Force
}

Write-Step 'Starting service (if installed)...'
if (Test-Path $serviceExe) {
  try {
    & $serviceExe start | Out-Null
  } catch {
    Write-Step 'Service start failed. You may need to start it manually.'
  }
}

Write-Step 'Starting tray (if present)...'
$trayExe = Join-Path $dstTray 'TheStorehouseTray.exe'
if (Test-Path $trayExe) {
  Start-Process $trayExe | Out-Null
}

Write-Step 'Update complete.'
