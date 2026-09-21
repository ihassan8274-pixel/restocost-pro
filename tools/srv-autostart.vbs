' RestoCost ERP Pro - silent auto-start (runs hidden, no windows)
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

' Project root = parent of the tools folder containing this script
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = root

' 1) Start the server hidden
sh.Run "cmd /c node server\index.js", 0, False

' 2) Wait until it is ready, then open the system in the default browser
WScript.Sleep 3000
sh.Run "rundll32 url.dll,FileProtocolHandler http://localhost:3001", 0, False
