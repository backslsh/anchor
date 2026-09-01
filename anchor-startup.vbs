' Runs anchor-startup.bat with no console window.
'
' A .bat in the Startup folder flashes a console on every logon and leaves one
' in the taskbar for as long as the server runs; a shortcut can only minimise
' it, not hide it. This is the only no-window option needing neither admin
' rights nor a scheduled task.
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.Run """" & here & "\anchor-startup.bat""", 0, False
