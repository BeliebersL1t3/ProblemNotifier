@echo off
title CampusFix - Service Manager
setlocal EnableDelayedExpansion

:: Ensure we are in the project root directory
cd /d "%~dp0"
set "TAILSCALE_BIN=C:\Program Files\Tailscale\tailscale.exe"

:: Auto-optimize Laravel configuration cache on launcher start to prevent Windows file-lock 500 errors
echo Optimizing Laravel configuration cache...
php artisan config:cache >nul 2>&1
echo [OK] Configuration cache is active.

:MENU
cls
echo ========================================================
echo         Telunas CampusFix - Service Launcher
echo ========================================================
echo.
echo   [1] Start Tailscale Funnel (https://msi.taile8cc1e.ts.net)
echo   [2] Stop Tailscale Funnel (Turn OFF public access)
echo   [3] Start ngrok Tunnel (granola-outlying-cultivate.ngrok-free.dev)
echo   [4] Start Laravel Queue Worker
echo   [5] Start WhatsApp Bot
echo   [6] Start Vite Dev Server (React HMR)
echo   [7] Start All Core Services (Tailscale Funnel + Queue + Bot)
echo   [8] Start All Core Services (ngrok Tunnel + Queue + Bot)
echo   [9] Exit
echo   [10] Start WhatsApp Bot V2 (New - bot-v2.js)
echo   [11] Refresh Configuration Cache (Fix 500 error)
echo.
echo ========================================================
set /p "CHOICE=Enter your choice [1-11]: "

if "%CHOICE%"=="1" goto START_TAILSCALE
if "%CHOICE%"=="2" goto STOP_TAILSCALE
if "%CHOICE%"=="3" goto START_NGROK
if "%CHOICE%"=="4" goto START_QUEUE
if "%CHOICE%"=="5" goto START_BOT
if "%CHOICE%"=="6" goto START_VITE
if "%CHOICE%"=="7" goto START_ALL_TAILSCALE
if "%CHOICE%"=="8" goto START_ALL_NGROK
if "%CHOICE%"=="9" goto EXIT
if "%CHOICE%"=="10" goto START_BOT_V2
if "%CHOICE%"=="11" goto REFRESH_CONFIG
goto INVALID

:START_TAILSCALE
echo.
echo Activating Tailscale Funnel in the background...
if exist "%TAILSCALE_BIN%" (
    "%TAILSCALE_BIN%" funnel --bg 80
    echo.
    echo [OK] Tailscale Funnel is active at https://msi.taile8cc1e.ts.net
) else (
    echo [ERROR] Tailscale not found at %TAILSCALE_BIN%
)
timeout /t 3 >nul
goto MENU

:STOP_TAILSCALE
echo.
echo Stopping Tailscale Funnel...
if exist "%TAILSCALE_BIN%" (
    "%TAILSCALE_BIN%" funnel reset
    echo.
    echo [OK] Tailscale Funnel has been turned OFF. Public URL is now closed.
) else (
    echo [ERROR] Tailscale not found at %TAILSCALE_BIN%
)
timeout /t 3 >nul
goto MENU

:START_NGROK
echo.
echo Launching ngrok tunnel in a new window...
start "CampusFix - ngrok Tunnel" /D "%~dp0" cmd /k "ngrok http 80 --url https://granola-outlying-cultivate.ngrok-free.dev"
echo Done.
timeout /t 2 >nul
goto MENU

:START_QUEUE
echo.
echo Launching Laravel queue worker in a new window...
start "CampusFix - Queue Worker" /D "%~dp0" cmd /k "php artisan queue:work"
echo Done.
timeout /t 2 >nul
goto MENU

:START_BOT
echo.
echo Launching WhatsApp Bot in a new window...
start "CampusFix - WhatsApp Bot" /D "%~dp0\whatsapp-bot" cmd /k "npm start"
echo Done.
timeout /t 2 >nul
goto MENU

:START_BOT_V2
echo.
echo Launching WhatsApp Bot V2 in a new window...
start "CampusFix - WhatsApp Bot V2" /D "%~dp0\whatsapp-bot" cmd /k "npm run start:v2"
echo Done.
timeout /t 2 >nul
goto MENU

:START_VITE
echo.
echo Launching Vite Dev Server in a new window...
start "CampusFix - Vite Dev Server" /D "%~dp0" cmd /k "npm run dev"
echo Done.
timeout /t 2 >nul
goto MENU

:START_ALL_TAILSCALE
echo.
echo Activating Tailscale Funnel in the background...
if exist "%TAILSCALE_BIN%" (
    "%TAILSCALE_BIN%" funnel --bg 80
) else (
    echo [ERROR] Tailscale not found at %TAILSCALE_BIN%
)
echo Optimizing configuration cache...
php artisan config:cache
echo Launching Queue Worker...
start "CampusFix - Queue Worker" /D "%~dp0" cmd /k "php artisan queue:work"
echo Launching WhatsApp Bot...
start "CampusFix - WhatsApp Bot" /D "%~dp0\whatsapp-bot" cmd /k "npm start"
echo.
echo All core services (with Tailscale Funnel) have been launched!
timeout /t 3 >nul
goto MENU

:START_ALL_NGROK
echo.
echo Launching ngrok Tunnel...
start "CampusFix - ngrok Tunnel" /D "%~dp0" cmd /k "ngrok http 80 --url https://granola-outlying-cultivate.ngrok-free.dev"
echo Optimizing configuration cache...
php artisan config:cache
echo Launching Queue Worker...
start "CampusFix - Queue Worker" /D "%~dp0" cmd /k "php artisan queue:work"
echo Launching WhatsApp Bot...
start "CampusFix - WhatsApp Bot" /D "%~dp0\whatsapp-bot" cmd /k "npm start"
echo.
echo All core services (with ngrok Tunnel) have been launched!
timeout /t 3 >nul
goto MENU

:REFRESH_CONFIG
echo.
echo Re-caching Laravel configuration to lock .env and prevent 500 errors...
php artisan config:cache
echo.
echo [DONE] Configuration cached successfully!
timeout /t 3 >nul
goto MENU

:INVALID
echo.
echo Invalid option selected. Please choose 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, or 11.
timeout /t 2 >nul
goto MENU

:EXIT
echo.
echo Goodbye!
timeout /t 1 >nul
exit /b 0
