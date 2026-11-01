@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "release\Voldena-Storage-2.2.0-x64-portable.exe" (
  start "" "release\Voldena-Storage-2.2.0-x64-portable.exe"
  exit /b
)
call npm start
