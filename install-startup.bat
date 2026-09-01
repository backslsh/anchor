@echo off
rem Creates a Startup-folder shortcut so Anchor runs at logon, hidden.
rem Re-run after moving the project. Delete the shortcut to undo:
rem   Win+R, then:  shell:startup

set "VBS=%~dp0anchor-startup.vbs"
if not exist "%VBS%" (
  echo Could not find anchor-startup.vbs next to this script.
  pause
  exit /b 1
)

powershell -NoProfile -Command ^
  "$sh = New-Object -ComObject WScript.Shell;" ^
  "$lnk = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'Anchor.lnk'));" ^
  "$lnk.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe';" ^
  "$lnk.Arguments = '\"%VBS%\"';" ^
  "$lnk.WorkingDirectory = '%~dp0';" ^
  "$lnk.Description = 'Starts Anchor at logon, hidden, for phone access';" ^
  "$lnk.WindowStyle = 7;" ^
  "$lnk.Save()"

if errorlevel 1 (
  echo Could not create the shortcut.
  pause
  exit /b 1
)

echo Anchor will now start when you sign in.
echo Stop it any time with stop-anchor.bat.
pause
