$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

Write-Host 'Installing dependencies...'
npm install

Write-Host 'Building TheStorehouse.exe...'
npm run build:exe

Write-Host 'Done. Check dist\\TheStorehouse.exe'
