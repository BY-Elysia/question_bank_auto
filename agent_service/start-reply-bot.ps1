Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$replyBotExe = Join-Path $scriptDir '.venv\Scripts\feishu-agent-reply-bot.exe'
$logsDir = Join-Path $scriptDir 'logs'
$pidFile = Join-Path $scriptDir '.reply-bot.pid'
$stdoutLog = Join-Path $logsDir 'reply-bot.stdout.log'
$stderrLog = Join-Path $logsDir 'reply-bot.stderr.log'

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

function Stop-ReplyBotProcesses {
  $processes = @(Get-ReplyBotProcesses)
  if (-not $processes.Count) {
    return
  }

  foreach ($process in $processes) {
    Write-Host "Stopping existing reply bot process $($process.ProcessId)..."
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }

  Wait-ForReplyBotShutdown
}

if (-not (Test-Path $replyBotExe)) {
  throw "Reply bot executable not found: $replyBotExe"
}

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
Stop-ReplyBotProcesses

$previousPythonUnbuffered = $env:PYTHONUNBUFFERED
$previousPythonIoEncoding = $env:PYTHONIOENCODING
$env:PYTHONUNBUFFERED = '1'
$env:PYTHONIOENCODING = 'utf-8'

$process = Start-Process `
  -FilePath $replyBotExe `
  -WorkingDirectory $scriptDir `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru

if ($null -ne $previousPythonUnbuffered) {
  $env:PYTHONUNBUFFERED = $previousPythonUnbuffered
} else {
  Remove-Item Env:PYTHONUNBUFFERED -ErrorAction SilentlyContinue
}

if ($null -ne $previousPythonIoEncoding) {
  $env:PYTHONIOENCODING = $previousPythonIoEncoding
} else {
  Remove-Item Env:PYTHONIOENCODING -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

$runningProcess = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
if (-not $runningProcess) {
  Stop-ReplyBotProcesses

  $stderrTail = ''
  if (Test-Path $stderrLog) {
    $stderrTail = (Get-Content $stderrLog -Tail 20 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
  }

  if ($stderrTail) {
    throw "Reply bot failed to start.`n$stderrTail"
  }

  throw 'Reply bot failed to start and did not produce stderr logs.'
}

$runningReplyProcess = @(Get-ReplyBotProcesses | Sort-Object ProcessId -Descending | Select-Object -First 1)
$runningPid = if ($runningReplyProcess.Count) { $runningReplyProcess[0].ProcessId } else { $process.Id }
Set-Content -Path $pidFile -Value $runningPid -NoNewline

Write-Host 'Feishu auto-reply bot started.'
Write-Host "PID: $runningPid"
Write-Host "Stdout: $stdoutLog"
Write-Host "Stderr: $stderrLog"
