@echo off
cd /d "%~dp0"
echo Opening the Render deployment page for Forget About...
echo.
echo When Render asks for private environment values, use the matching values from .env.
echo Do not paste SUPABASE_SECRET_KEY or STRIPE_SECRET_KEY anywhere except Render's private environment settings.
echo.
start "" "https://render.com/deploy?repo=https://github.com/watsonjohn-spec/Forget-About-Tray"
pause
