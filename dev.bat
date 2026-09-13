@echo off
setlocal
cd /d "%~dp0"
where wails >nul 2>nul
if errorlevel 1 (
  echo [INFO] Instalando Wails CLI v2.10.2...
  go install github.com/wailsapp/wails/v2/cmd/wails@v2.10.2
)
wails dev
