@echo off
rem Stops the Anchor server that anchor-startup.vbs launched at logon.
rem It runs hidden, so there is no window to close.
setlocal enabledelayedexpansion
set "FOUND="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":4443 .*LISTENING"') do (
  echo Stopping Anchor - PID %%p
  taskkill /f /pid %%p >nul 2>&1
  set "FOUND=1"
)
if not defined FOUND echo Anchor does not appear to be running on port 4443.
endlocal
pause
