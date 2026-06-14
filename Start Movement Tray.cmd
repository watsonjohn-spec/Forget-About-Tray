@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -Command "$ids = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($id in $ids) { $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $id); if ($process.CommandLine -match 'server\.mjs') { Stop-Process -Id $id -Force } }"
start "Movement Tray Server" /min cmd /c "npm.cmd start"
timeout /t 2 /nobreak >nul
start "" http://localhost:4173
