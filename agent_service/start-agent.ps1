param(
  [string]$HostAddress = '127.0.0.1',
  [int]$Port = 8000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonExe = Join-Path $scriptDir '.venv\Scripts\python.exe'
$logsDir = Join-Path $scriptDir 'logs'
$pidFile = Join-Path $scriptDir '.agent.pid'
$stdoutLog = Join-Path $logsDir 'agent.stdout.log'
$stderrLog = Join-Path $logsDir 'agent.stderr.log'
$healthUrl = "http://${HostAddress}:$Port/healthz"

function Get-AgentProcesses {
  @(Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | Where-Object {
      $commandLine = [string]($_.CommandLine)
      $commandLine -match 'uvicorn' -and $commandLine -match 'feishu_agent\.app:create_app'
    })
}

function Wait-ForAgentShutdown {
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    $remaining = @(Get-AgentProcesses)
    if (-not $remaining.Count) {
      return
    }
    Start-Sleep -Milliseconds 500
  }

  $pids = (@(Get-AgentProcesses) | Select-Object -ExpandProperty ProcessId -Unique) -join ', '
  throw "Timed out waiting for existing agent process(es) to exit: $pids"
}

function Stop-AgentProcesses {
  $processes = @(Get-AgentProcesses)
  if (-not $processes.Count) {
    return
  }

  foreach ($process in $processes) {
    Write-Host "Stopping existing agent process $($process.ProcessId)..."
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }

  Wait-ForAgentShutdown
}

if (-not (Test-Path $pythonExe)) {
  throw "Python executable not found: $pythonExe"
}

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
Stop-AgentProcesses

$portListeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($portListeners.Count) {
  $owners = ($portListeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
  throw "Port $Port is already occupied by non-agent process(es): $owners"
}

if (Test-Path $stdoutLog) { Remove-Item $stdoutLog -Force -ErrorAction Stop }
if (Test-Path $stderrLog) { Remove-Item $stderrLog -Force -ErrorAction Stop }

$arguments = @(
  '-m', 'uvicorn',
  'feishu_agent.app:create_app',
  '--factory',
  '--host', $HostAddress,
  '--port', [string]$Port
)

$process = Start-Process `
  -FilePath $pythonExe `
  -ArgumentList $arguments `
  -WorkingDirectory $scriptDir `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru

$started = $false
for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
  Start-Sleep -Milliseconds 500
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 2
  } catch {
    $health = $null
  }
  if ($health -and $health.ok -eq $true) {
    $started = $true
    break
  }
}

if (-not $started) {
  Stop-AgentProcesses

  $stderrTail = ''
  if (Test-Path $stderrLog) {
    $stderrTail = (Get-Content $stderrLog -Tail 20 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
  }

  if ($stderrTail) {
    throw "Agent failed to start.`n$stderrTail"
  }

  throw 'Agent failed to start and did not produce stderr logs.'
}

$listenerProcessId = @(
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -First 1
)
$runningPid = if ($listenerProcessId.Count -and $listenerProcessId[0]) {
  $listenerProcessId[0]
} else {
  $runningProcess = @(Get-AgentProcesses | Sort-Object ProcessId -Descending | Select-Object -First 1)
  if ($runningProcess.Count) { $runningProcess[0].ProcessId } else { $process.Id }
}
Set-Content -Path $pidFile -Value $runningPid -NoNewline

Write-Host 'Aemeath Agent started.'
Write-Host "PID: $runningPid"
Write-Host "URL: http://${HostAddress}:$Port"
Write-Host "Stdout: $stdoutLog"
Write-Host "Stderr: $stderrLog"
