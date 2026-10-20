@echo off
title CampusFix - Service Manager
setlocal EnableDelayedExpansion

:: Ensure we are in the project root directory
cd /d "%~dp0"

:MENU
cls
echo ========================================================
echo         Telunas CampusFix - Service Launcher
echo ========================================================
echo.
echo   [1] Start Tailscale Funnel (https://msi.taile8cc1e.ts.net)
echo   [2] Start ngrok Tunnel (granola-outlying-cultivate.ngrok-free.dev)
echo   [3] Start Laravel Queue Worker
echo   [4] Start WhatsApp Bot
echo   [5] Start Vite Dev Server (React HMR)
echo   [6] Start All Core Services (Tailscale Funnel + Queue + Bot)
echo   [7] Start All Core Services (ngrok Tunnel + Queue + Bot)
echo   [8] Exit
echo.
echo ========================================================
set /p "CHOICE=Enter your choice [1-8]: "

if "%CHOICE%"=="1" goto START_TAILSCALE
if "%CHOICE%"=="2" goto START_NGROK
if "%CHOICE%"=="3" goto START_QUEUE
if "%CHOICE%"=="4" goto START_BOT
if "%CHOICE%"=="5" goto START_VITE
if "%CHOICE%"=="6" goto START_ALL_TAILSCALE
if "%CHOICE%"=="7" goto START_ALL_NGROK
if "%CHOICE%"=="8" goto EXIT
goto INVALID

:START_TAILSCALE
echo.
echo Launching Tailscale Funnel in a new window...
start "CampusFix - Tailscale Funnel" cmd /k "cd /d "%~dp0" && "C:\Program Files\Tailscale\tailscale.exe" funnel 80"
echo Done.
timeout /t 2 >nul
goto MENU

:START_NGROK
echo.
echo Launching ngrok tunnel in a new window...
start "CampusFix - ngrok Tunnel" cmd /k "cd /d "%~dp0" && ngrok http 80 --url https://granola-outlying-cultivate.ngrok-free.dev"
echo Done.
timeout /t 2 >nul
goto MENU

:START_QUEUE
echo.
echo Launching Laravel queue worker in a new window...
start "CampusFix - Queue Worker" cmd /k "cd /d "%~dp0" && php artisan queue:work"
echo Done.
timeout /t 2 >nul
goto MENU

:START_BOT
echo.
echo Launching WhatsApp Bot in a new window...
start "CampusFix - WhatsApp Bot" cmd /k "cd /d "%~dp0\whatsapp-bot" && npm start"
echo Done.
timeout /t 2 >nul
goto MENU

:START_VITE
echo.
echo Launching Vite Dev Server in a new window...
start "CampusFix - Vite Dev Server" cmd /k "cd /d "%~dp0" && npm run dev"
echo Done.
timeout /t 2 >nul
goto MENU

:START_ALL_TAILSCALE
echo.
echo Launching Tailscale Funnel...
start "CampusFix - Tailscale Funnel" cmd /k "cd /d "%~dp0" && "C:\Program Files\Tailscale\tailscale.exe" funnel 80"
echo Launching Queue Worker...
start "CampusFix - Queue Worker" cmd /k "cd /d "%~dp0" && php artisan queue:work"
echo Launching WhatsApp Bot...
start "CampusFix - WhatsApp Bot" cmd /k "cd /d "%~dp0\whatsapp-bot" && npm start"
echo.
echo All core services (with Tailscale Funnel) have been launched!
timeout /t 3 >nul
goto MENU

:START_ALL_NGROK
echo.
echo Launching ngrok Tunnel...
start "CampusFix - ngrok Tunnel" cmd /k "cd /d "%~dp0" && ngrok http 80 --url https://granola-outlying-cultivate.ngrok-free.dev"
echo Launching Queue Worker...
start "CampusFix - Queue Worker" cmd /k "cd /d "%~dp0" && php artisan queue:work"
echo Launching WhatsApp Bot...
start "CampusFix - WhatsApp Bot" cmd /k "cd /d "%~dp0\whatsapp-bot" && npm start"
echo.
echo All core services (with ngrok Tunnel) have been launched!
timeout /t 3 >nul
goto MENU

:INVALID
echo.
echo Invalid option selected. Please choose 1, 2, 3, 4, 5, 6, 7, or 8.
timeout /t 2 >nul
goto MENU

:EXIT
echo.
echo Goodbye!
timeout /t 1 >nul
exit /b 0
