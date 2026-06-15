@echo off
cd /d "%~dp0"
echo Publishing Forget About Tray to GitHub...
call npm.cmd run public-config
if errorlevel 1 (
  echo.
  echo Public Supabase configuration could not be generated.
  pause
  exit /b 1
)
git --git-dir=.deploy-git --work-tree=. add -A
git --git-dir=.deploy-git --work-tree=. diff --cached --quiet
if errorlevel 1 git --git-dir=.deploy-git --work-tree=. commit -m "Update Forget About Tray"
git --git-dir=.deploy-git --work-tree=. push -u origin main
if errorlevel 1 (
  echo.
  echo Publishing did not complete. Review the message above, then try again.
  pause
  exit /b 1
)
echo Publishing the website branch...
git --git-dir=.deploy-git --work-tree=. push origin main:gh-pages --force
if errorlevel 1 (
  echo.
  echo The website branch did not publish. Review the message above, then try again.
  pause
  exit /b 1
)
echo.
echo Published successfully.
echo.
echo In GitHub Pages settings, choose:
echo   Source: Deploy from a branch
echo   Branch: gh-pages
echo   Folder: / root
echo.
start "" "https://github.com/watsonjohn-spec/Forget-About-Tray/settings/pages"
pause
