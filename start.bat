@echo off
title Anchor
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on your PATH.
  echo   Install it from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)
echo.
echo   Starting Anchor on this PC only (127.0.0.1).
echo   Your vault also saves to .anchor-data\vault.json, encrypted.
echo.
node serve.js --open %*
pause
