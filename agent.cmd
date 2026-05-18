@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0agent.ps1" %*
endlocal
