Option Explicit

Dim fso, shell, appDir, portFile, port, i, lnkPath, sc, ts, instFile, instId, lnkName

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = appDir

' --- Read this copy's unique instance id (written by the server) ---
instId = ""
instFile = appDir & "\server\instance.txt"
If fso.FileExists(instFile) Then
  Set ts = fso.OpenTextFile(instFile, 1, False)
  instId = Trim(ts.ReadLine)
  ts.Close
End If

' --- Read the last known port from server/port.txt (written by the server) ---
port = "3001"
portFile = appDir & "\server\port.txt"
If fso.FileExists(portFile) Then
  Set ts = fso.OpenTextFile(portFile, 1, False)
  port = Trim(ts.ReadLine)
  ts.Close
End If

' --- Create a desktop shortcut on first run (one per company copy) ---
lnkName = fso.GetBaseName(appDir)
If lnkName = "" Then lnkName = "RestoCost ERP Pro"
If lnkName = "NEW APP" Then
  lnkName = "RestoCost ERP Pro"
Else
  lnkName = "RestoCost ERP Pro - " & lnkName
End If
lnkPath = shell.SpecialFolders("Desktop") & "\" & lnkName & ".lnk"
If Not fso.FileExists(lnkPath) Then
  Set sc = shell.CreateShortcut(lnkPath)
  sc.TargetPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
  sc.Arguments = """" & WScript.ScriptFullName & """"
  sc.WorkingDirectory = appDir
  If fso.FileExists(appDir & "\assets\restocost.ico") Then
    sc.IconLocation = appDir & "\assets\restocost.ico,0"
  Else
    sc.IconLocation = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\SHELL32.dll,220"
  End If
  sc.Description = lnkName & " - starts server and opens the app"
  sc.Save
End If

' --- Helper: native HTTP GET (no PowerShell window) ---
Function HttpGet(url)
  Dim req
  On Error Resume Next
  Set req = CreateObject("MSXML2.ServerXMLHTTP")
  req.setTimeouts 3000, 3000, 3000, 3000
  req.Open "GET", url, False
  req.Send
  If Err.Number = 0 And req.Status = 200 Then
    HttpGet = req.responseText
  Else
    HttpGet = ""
  End If
  On Error Goto 0
End Function

' --- Helper: is the server on port p the SAME copy as this one? ---
Function IsMine(p)
  Dim resp, marker, valStart, valEnd
  resp = HttpGet("http://localhost:" & p & "/api/instance")
  If resp = "" Then
    IsMine = False
    Exit Function
  End If
  marker = """id"":"""
  valStart = InStr(resp, marker)
  If valStart > 0 Then
    valStart = valStart + Len(marker)
    valEnd = InStr(valStart, resp, """")
    If valEnd > valStart Then resp = Mid(resp, valStart, valEnd - valStart)
  End If
  IsMine = (Trim(resp) = instId)
End Function

' --- Helper: is any server responding on the given port? ---
Function IsUp(p)
  IsUp = (HttpGet("http://localhost:" & p & "/") <> "")
End Function

' --- Start our own server if our instance is NOT already running anywhere on the read port ---
' Run via the watcher so the server auto-restarts if it ever crashes, staying stable
' for as long as the machine is on.
If Not IsMine(port) Then
  shell.Run "cmd /c node server/watcher.mjs", 0, False
End If

' --- Wait until OUR copy responds (up to ~60 seconds) ---
For i = 1 To 120
  WScript.Sleep 500
  If fso.FileExists(portFile) Then
    Set ts = fso.OpenTextFile(portFile, 1, False)
    port = Trim(ts.ReadLine)
    ts.Close
  End If
  If fso.FileExists(instFile) Then
    Set ts = fso.OpenTextFile(instFile, 1, False)
    instId = Trim(ts.ReadLine)
    ts.Close
  End If
  If IsMine(port) Then Exit For
Next

' --- Open the app in the default browser ---
shell.Run "http://localhost:" & port, 1, False
