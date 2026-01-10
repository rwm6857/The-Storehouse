Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$pidFile = Join-Path $env:TEMP 'storehouse-server.pid'

function Get-EnvValue([string]$key) {
  $envPath = Join-Path $repoRoot '.env'
  if (!(Test-Path $envPath)) { return $null }
  $lines = Get-Content $envPath -ErrorAction SilentlyContinue
  foreach ($line in $lines) {
    if ($line.Trim().StartsWith('#') -or $line.Trim().Length -eq 0) { continue }
    $parts = $line.Split('=', 2)
    if ($parts.Count -eq 2 -and $parts[0].Trim() -eq $key) {
      return $parts[1].Trim()
    }
  }
  return $null
}

function Get-Port {
  $port = Get-EnvValue 'PORT'
  if ([string]::IsNullOrWhiteSpace($port)) { return 3000 }
  [int]$p = 3000
  if ([int]::TryParse($port, [ref]$p)) { return $p }
  return 3000
}

function Get-LanIp {
  try {
    $ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
      $_.IPAddress -ne '127.0.0.1' -and
      $_.IPAddress -notlike '169.254*' -and
      $_.InterfaceAlias -notmatch 'vEthernet'
    }
    $ip = $ips | Select-Object -First 1 -ExpandProperty IPAddress
    if ($ip) { return $ip }
  } catch { }

  return $null
}

function Read-Pid {
  if (Test-Path $pidFile) {
    $content = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($content) { return [int]$content }
  }
  return $null
}

function Is-Running {
  $pid = Read-Pid
  if ($pid) {
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($proc) { return $true }
  }
  return $false
}

function Start-Server {
  if (Is-Running) { return }
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    [System.Windows.Forms.MessageBox]::Show('Node.js was not found in PATH.', 'The Storehouse')
    return
  }
  $proc = Start-Process -FilePath 'node' -ArgumentList 'src/server.js' -WorkingDirectory $repoRoot -PassThru
  $proc.Id | Out-File -FilePath $pidFile -Encoding ascii
}

function Stop-Server {
  $pid = Read-Pid
  if ($pid) {
    Stop-Process -Id $pid -ErrorAction SilentlyContinue
    Remove-Item $pidFile -ErrorAction SilentlyContinue
  }
}

function Open-Web {
  $port = Get-Port
  $ip = Get-LanIp
  if (-not $ip) { $ip = 'localhost' }
  Start-Process "http://$ip:$port"
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'The Storehouse Launcher'
$form.Size = New-Object System.Drawing.Size(380, 210)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Location = New-Object System.Drawing.Point(20, 20)
$statusLabel.Size = New-Object System.Drawing.Size(320, 20)
$form.Controls.Add($statusLabel)

$startButton = New-Object System.Windows.Forms.Button
$startButton.Text = 'Start Server'
$startButton.Location = New-Object System.Drawing.Point(20, 60)
$startButton.Size = New-Object System.Drawing.Size(140, 36)
$form.Controls.Add($startButton)

$stopButton = New-Object System.Windows.Forms.Button
$stopButton.Text = 'Stop Server'
$stopButton.Location = New-Object System.Drawing.Point(200, 60)
$stopButton.Size = New-Object System.Drawing.Size(140, 36)
$form.Controls.Add($stopButton)

$openButton = New-Object System.Windows.Forms.Button
$openButton.Text = 'Open Web App'
$openButton.Location = New-Object System.Drawing.Point(20, 110)
$openButton.Size = New-Object System.Drawing.Size(320, 36)
$form.Controls.Add($openButton)

function Update-Status {
  if (Is-Running) {
    $statusLabel.Text = 'Status: Running'
  } else {
    $statusLabel.Text = 'Status: Stopped'
  }
}

$startButton.Add_Click({
  Start-Server
  Start-Sleep -Milliseconds 300
  Update-Status
})

$stopButton.Add_Click({
  Stop-Server
  Start-Sleep -Milliseconds 200
  Update-Status
})

$openButton.Add_Click({
  Open-Web
})

$form.Add_Shown({ Update-Status })
[void]$form.ShowDialog()
