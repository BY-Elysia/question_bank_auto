Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $scriptDir '.reply-bot.pid'

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

function Wait-ForReplyBotShutdown {
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    $remaining = @(Get-ReplyBotProcesses)
    if (-not $remaining.Count) {
      return
    }
    Start-Sleep -Milliseconds 500
  }

  $pids = (@(Get-ReplyBotProcesses) | Select-Object -ExpandProperty ProcessId -Unique) -join ', '
  throw "Timed out waiting for reply bot process(es) to exit: $pids"
}

$processes = @(Get-ReplyBotProcesses)
if (-not $processes.Count) {
  if (Test-Path $pidFile) {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  }
  Write-Host 'Feishu auto-reply bot is not running.'
  exit 0
}

foreach ($process in $processes) {
  Write-Host "Stopping reply bot process $($process.ProcessId)..."
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Wait-ForReplyBotShutdown

if (Test-Path $pidFile) {
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

Write-Host 'Feishu auto-reply bot stopped.'
