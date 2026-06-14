@echo off
cd /d "%~dp0"
start "Movement Tray Server" /min cmd /c "npm.cmd start"
timeout /t 2 /nobreak >nul
start "" http://localhost:4173

