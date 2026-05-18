param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'restart', 'status')]
  [string]$Action = 'status'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$agentDir = Join-Path $repoRoot 'agent_service'
$startScript = Join-Path $agentDir 'start-agent.ps1'
$stopScript = Join-Path $agentDir 'stop-agent.ps1'
$startReplyScript = Join-Path $agentDir 'start-reply-bot.ps1'
$stopReplyScript = Join-Path $agentDir 'stop-reply-bot.ps1'
$pidFile = Join-Path $agentDir '.agent.pid'
$replyPidFile = Join-Path $agentDir '.reply-bot.pid'
$healthUrl = 'http://127.0.0.1:8000/healthz'

function Get-ReplyBotProcesses {
  @(Get-CimInstance Win32_Process | Where-Object {
      $name = [string]($_.Name)
      $commandLine = [string]($_.CommandLine)
      $name -in @('python.exe', 'feishu-agent-reply-bot.exe', 'cmd.exe', 'node.exe', 'lark-cli.exe') -and (
        $name -eq 'feishu-agent-reply-bot.exe' -or
        $commandLine -match '\\feishu-agent-reply-bot(?:\.exe)?' -or
        $commandLine -match 'feishu_agent\.auto_reply' -or
        $commandLine -match 'lark-cli(?:\.cmd|\.exe)?.*event \+subscribe' -or
        $commandLine -match 'im\.message\.receive_v1'
      )
    })
}

function Get-AgentStatus {
  $listener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  $pidFromFile = if (Test-Path $pidFile) { (Get-Content $pidFile -Raw).Trim() } else { '' }
  $replyPidFromFile = if (Test-Path $replyPidFile) { (Get-Content $replyPidFile -Raw).Trim() } else { '' }
  $replyProcesses = @(Get-ReplyBotProcesses)
  $replyProcess = @($replyProcesses | Select-Object -First 1)

  $health = $null
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 2
  } catch {
    $health = $null
  }

  if (-not $listener) {
    Write-Host 'Aemeath Agent (HTTP): stopped'
    if ($pidFromFile) {
      Write-Host "PID file: $pidFromFile (stale)"
    }
  } else {
    Write-Host 'Aemeath Agent (HTTP): running'
    Write-Host "PID: $($listener.OwningProcess)"
    if ($pidFromFile) {
      Write-Host "PID file: $pidFromFile"
    }
    Write-Host 'URL: http://127.0.0.1:8000'
    Write-Host "Health: $(if ($health -and $health.ok -eq $true) { 'ok' } else { 'unreachable' })"
  }

  if (-not $replyProcess.Count) {
    Write-Host 'Feishu Auto Reply: stopped'
    if ($replyPidFromFile) {
      Write-Host "Reply PID file: $replyPidFromFile (stale)"
    }
  } else {
    Write-Host 'Feishu Auto Reply: running'
    Write-Host "PID: $($replyProcess[0].ProcessId)"
    if ($replyPidFromFile) {
      Write-Host "Reply PID file: $replyPidFromFile"
    }
  }
}

switch ($Action) {
  'start' {
    & $startScript
    & $startReplyScript
    break
  }
  'stop' {
    & $stopReplyScript
    & $stopScript
    break
  }
  'restart' {
    & $stopReplyScript
    & $stopScript
    & $startScript
    & $startReplyScript
    break
  }
  'status' {
    Get-AgentStatus
    break
  }
  default {
    throw "Unsupported action: $Action"
  }
}
