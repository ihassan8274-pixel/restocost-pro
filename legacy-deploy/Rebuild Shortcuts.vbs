Option Explicit

' Rebuild desktop shortcuts for RestoCost ERP Pro
Dim fso, shell, appDir, desk, iconPath, sc

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
desk = shell.SpecialFolders("Desktop")
iconPath = appDir & "\assets\restocost.ico"

' Main launcher shortcut
Set sc = shell.CreateShortcut(desk & "\RestoCost ERP Pro.lnk")
sc.TargetPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
sc.Arguments = """" & appDir & "\RestoCost ERP Pro.vbs"""
sc.WorkingDirectory = appDir
sc.IconLocation = iconPath & ",0"
sc.Description = "RestoCost ERP Pro - system"
sc.Save

' New company creator shortcut
Set sc = shell.CreateShortcut(desk & "\RestoCost New Company.lnk")
sc.TargetPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
sc.Arguments = """" & appDir & "\Create Company Copy.vbs"""
sc.WorkingDirectory = appDir
sc.IconLocation = iconPath & ",0"
sc.Description = "RestoCost ERP Pro - new company"
sc.Save
