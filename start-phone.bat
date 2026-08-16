@echo off
title Anchor - phone access
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
echo   Starting Anchor with HTTPS + sync for phone access.
echo   Leave this window open while you use it on your phone.
echo.
node serve.js --lan %*
pause
