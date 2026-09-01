@echo off
rem ── Anchor launcher, for running at logon ────────────────────────────────
rem Point a Startup-folder shortcut at anchor-startup.vbs beside this file and
rem Anchor comes up with the machine, hidden, ready for the phone.
rem install-startup.bat makes that shortcut for you.
rem
rem Do not copy this file into the Startup folder. %~dp0 is the folder the
rem script sits in, so a copy there looks for serve.js in the Startup folder
rem and fails. The shortcut is what makes this work from anywhere.

cd /d "%~dp0"

set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 (
  rem nvm4w keeps a stable symlink here even as the active version changes.
  if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
  if exist "C:\nvm4w\nodejs\node.exe" set "NODE_EXE=C:\nvm4w\nodejs\node.exe"
)

if not exist ".anchor-data" mkdir ".anchor-data"
set "LOG=%~dp0.anchor-data\startup.log"

rem At logon there is no console to watch, so the output is the only record of
rem what happened. Keep it rather than discarding it.
echo.>> "%LOG%"
echo ==== [%DATE% %TIME%] starting ====>> "%LOG%"
"%NODE_EXE%" serve.js --lan >> "%LOG%" 2>&1
echo ==== [%DATE% %TIME%] exited with %ERRORLEVEL% ====>> "%LOG%"
