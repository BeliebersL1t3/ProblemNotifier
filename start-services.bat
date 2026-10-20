@echo off
title CampusFix - Service Manager
setlocal EnableDelayedExpansion

:: Ensure we are in the project root directory
cd /d "%~dp0"
set "TAILSCALE_BIN=C:\Program Files\Tailscale\tailscale.exe"

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
echo.
echo ========================================================
set /p "CHOICE=Enter your choice [1-9]: "

if "%CHOICE%"=="1" goto START_TAILSCALE
if "%CHOICE%"=="2" goto STOP_TAILSCALE
if "%CHOICE%"=="3" goto START_NGROK
if "%CHOICE%"=="4" goto START_QUEUE
if "%CHOICE%"=="5" goto START_BOT
if "%CHOICE%"=="6" goto START_VITE
if "%CHOICE%"=="7" goto START_ALL_TAILSCALE
if "%CHOICE%"=="8" goto START_ALL_NGROK
if "%CHOICE%"=="9" goto EXIT
goto INVALID

:START_TAILSCALE
echo.
echo Launching Tailscale Funnel in a new window...
if exist "%TAILSCALE_BIN%" (
    start "CampusFix - Tailscale Funnel" /D "%~dp0" cmd /k ""%TAILSCALE_BIN%" funnel 80"
) else (
    echo [ERROR] Tailscale not found at %TAILSCALE_BIN%
)
echo Done.
timeout /t 2 >nul
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

:START_VITE
echo.
echo Launching Vite Dev Server in a new window...
start "CampusFix - Vite Dev Server" /D "%~dp0" cmd /k "npm run dev"
echo Done.
timeout /t 2 >nul
goto MENU

:START_ALL_TAILSCALE
echo.
echo Launching Tailscale Funnel...
if exist "%TAILSCALE_BIN%" (
    start "CampusFix - Tailscale Funnel" /D "%~dp0" cmd /k ""%TAILSCALE_BIN%" funnel 80"
) else (
    echo [ERROR] Tailscale not found at %TAILSCALE_BIN%
)
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
echo Launching Queue Worker...
start "CampusFix - Queue Worker" /D "%~dp0" cmd /k "php artisan queue:work"
echo Launching WhatsApp Bot...
start "CampusFix - WhatsApp Bot" /D "%~dp0\whatsapp-bot" cmd /k "npm start"
echo.
echo All core services (with ngrok Tunnel) have been launched!
timeout /t 3 >nul
goto MENU

:INVALID
echo.
echo Invalid option selected. Please choose 1, 2, 3, 4, 5, 6, 7, 8, or 9.
timeout /t 2 >nul
goto MENU

:EXIT
echo.
echo Goodbye!
timeout /t 1 >nul
exit /b 0
