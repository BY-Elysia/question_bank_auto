# Windows Startup

Use these scripts to avoid multiple `uvicorn` processes fighting for port `8000`, and to keep the Feishu auto-reply bot under the same command surface.

Start the agent:

```powershell
cd agent_service
.\start-agent.ps1
```

Stop the agent:

```powershell
cd agent_service
.\stop-agent.ps1
```

Start the Feishu auto-reply bot:

```powershell
cd agent_service
.\start-reply-bot.ps1
```

Stop the Feishu auto-reply bot:

```powershell
cd agent_service
.\stop-reply-bot.ps1
```

What `start-agent.ps1` does:

- Stops any existing `uvicorn feishu_agent.app:create_app` process
- Starts the agent with `agent_service\.venv\Scripts\python.exe`
- Writes the running PID to `.agent.pid`
- Redirects logs to `logs\agent.stdout.log` and `logs\agent.stderr.log`

What `start-reply-bot.ps1` does:

- Stops any existing `feishu-agent-reply-bot` process
- Starts the reply bot with `agent_service\.venv\Scripts\feishu-agent-reply-bot.exe`
- Writes the running PID to `.reply-bot.pid`
- Redirects logs to `logs\reply-bot.stdout.log` and `logs\reply-bot.stderr.log`

If the port is occupied by some other process, the script will stop and tell you which PID is using it.

## Easier Commands

From the repo root you can now use:

```powershell
.\agent.cmd start
.\agent.cmd stop
.\agent.cmd restart
.\agent.cmd status
```

These commands now manage both:

- the HTTP agent on `127.0.0.1:8000`
- the Feishu auto-reply bot subscription process

This is just a thin wrapper around the scripts in `agent_service`, so you do not need to `cd agent_service` first.
