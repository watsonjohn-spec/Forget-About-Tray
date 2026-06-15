@echo off
cd /d "%~dp0"
echo Creating or resetting the prototype print factory login...
echo.
node scripts\create-factory-account.mjs
if errorlevel 1 (
  echo.
  echo The factory login could not be created. Check the message above.
  pause
  exit /b 1
)
echo.
pause
