@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "release\Dayloom-1.1.1-Windows.exe" (
  start "" "release\Dayloom-1.1.1-Windows.exe"
  exit /b
)
if exist "release\win-unpacked\拾序.exe" (
  start "" "release\win-unpacked\拾序.exe"
  exit /b
)
call npm start
