Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $scriptDir '.agent.pid'

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
  throw "Timed out waiting for agent process(es) to exit: $pids"
}

$processes = @(Get-AgentProcesses)
if (-not $processes.Count) {
  if (Test-Path $pidFile) {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  }
  Write-Host 'Aemeath Agent is not running.'
  exit 0
}

foreach ($process in $processes) {
  Write-Host "Stopping agent process $($process.ProcessId)..."
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Wait-ForAgentShutdown

if (Test-Path $pidFile) {
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

Write-Host 'Aemeath Agent stopped.'
