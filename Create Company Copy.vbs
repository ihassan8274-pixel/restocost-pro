Option Explicit

Dim fso, shell, appDir, parentDir, newName, newDir, lnkPath, sc, ans, distDir

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
parentDir = fso.GetParentFolderName(appDir)

' --- Ensure the desktop shortcut for this script points here (self-heal) ---
lnkPath = shell.SpecialFolders("Desktop") & "\RestoCost New Company.lnk"
Set sc = shell.CreateShortcut(lnkPath)
sc.TargetPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
sc.Arguments = """" & WScript.ScriptFullName & """"
sc.WorkingDirectory = appDir
If fso.FileExists(appDir & "\assets\restocost.ico") Then
  sc.IconLocation = appDir & "\assets\restocost.ico,0"
Else
  sc.IconLocation = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\SHELL32.dll,146"
End If
sc.Description = "RestoCost ERP Pro - ≈‰‘«¡ ‰”Œ… ‘—ﬂ… ÃœÌœ…"
sc.Save

' --- Ask for the new company name ---
ans = InputBox("√œŒ· «”„ «·‘—ﬂ… «·ÃœÌœ… («”„ „Ã·œ «·‰”Œ…):", "RestoCost ERP Pro - ≈‰‘«¡ ‰”Œ… ‘—ﬂ…", "")
If ans = "" Then WScript.Quit
newName = Trim(ans)
newDir = parentDir & "\" & newName

' Prevent copying into itself
If LCase(fso.GetAbsolutePathName(newDir)) = LCase(appDir) Then
  MsgBox "·« Ì„ﬂ‰ ≈‰‘«¡ «·‰”Œ… œ«Œ· ‰›” «·„Ã·œ. «Œ — «”„« „Œ ·›«.", vbCritical, "RestoCost ERP Pro"
  WScript.Quit
End If

If fso.FolderExists(newDir) Then
  ans = MsgBox("«·„Ã·œ '" & newName & "' „ÊÃÊœ »«·›⁄·." & vbCrLf & "Â·  —Ìœ «” »œ«·Â »»Ì«‰«  ÃœÌœ…ø", vbYesNo + vbQuestion, "RestoCost ERP Pro")
  If ans <> vbYes Then WScript.Quit
  fso.DeleteFolder newDir, True
End If

' --- Copy the whole app (code + server + node_modules + data folder) ó hidden window ---
Dim rc
rc = shell.Run("cmd /c robocopy """ & appDir & """ """ & newDir & """ /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP", 0, True)
If rc >= 8 Then
  MsgBox "›‘· ‰”Œ «·„Ã·œ (—„“ «·Œÿ√: " & rc & ").", vbCritical, "RestoCost ERP Pro"
  WScript.Quit
End If

' --- Remove this copy's identity + data so it starts as a fresh independent company ---
On Error Resume Next
fso.DeleteFile newDir & "\server\port.txt"
fso.DeleteFile newDir & "\server\instance.txt"
fso.DeleteFile newDir & "\server\data\restocost.db"
On Error Goto 0

' --- Create a desktop shortcut for the new company ---
lnkPath = shell.SpecialFolders("Desktop") & "\RestoCost ERP Pro - " & newName & ".lnk"
Set sc = shell.CreateShortcut(lnkPath)
sc.TargetPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
sc.Arguments = """" & newDir & "\RestoCost ERP Pro.vbs"""
sc.WorkingDirectory = newDir
If fso.FileExists(newDir & "\assets\restocost.ico") Then
  sc.IconLocation = newDir & "\assets\restocost.ico,0"
Else
  sc.IconLocation = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\SHELL32.dll,220"
End If
sc.Description = "RestoCost ERP Pro - " & newName
sc.Save

MsgBox " „ ≈‰‘«¡ ‰”Œ… «·‘—ﬂ… '" & newName & "' »‰Ã«Õ." & vbCrLf & vbCrLf & _
       "«·„Ã·œ: " & newDir & vbCrLf & _
       "”Ì „ ≈‰‘«¡ «Œ ’«— ⁄·Ï ”ÿÕ «·„ﬂ »: RestoCost ERP Pro - " & newName & vbCrLf & _
       "«·‰”Œ… «·ÃœÌœ…  »œ√ »»Ì«‰«   Ã—Ì»Ì… ›«—€… Ê·Â« „‰›– ÊÕ”«»«  Œ«’… »Â«." & vbCrLf & vbCrLf & _
       "«÷€ÿ OK À„ ‘€¯· «·«Œ ’«— «·ÃœÌœ „‰ ”ÿÕ «·„ﬂ ».", vbInformation, "RestoCost ERP Pro"
