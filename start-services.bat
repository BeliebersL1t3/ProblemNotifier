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
echo   [1] Start ngrok Tunnel (granola-outlying-cultivate.ngrok-free.dev)
echo   [2] Start Laravel Queue Worker
echo   [3] Start WhatsApp Bot
echo   [4] Start Vite Dev Server (React HMR)
echo   [5] Start All Core Services (Tunnel + Queue + Bot)
echo   [6] Exit
echo.
echo ========================================================
set /p "CHOICE=Enter your choice [1-6]: "

if "%CHOICE%"=="1" goto START_NGROK
if "%CHOICE%"=="2" goto START_QUEUE
if "%CHOICE%"=="3" goto START_BOT
if "%CHOICE%"=="4" goto START_VITE
if "%CHOICE%"=="5" goto START_ALL
if "%CHOICE%"=="6" goto EXIT
goto INVALID

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

:START_ALL
echo.
echo Launching ngrok Tunnel...
start "CampusFix - ngrok Tunnel" cmd /k "cd /d "%~dp0" && ngrok http 80 --url https://granola-outlying-cultivate.ngrok-free.dev"
echo Launching Queue Worker...
start "CampusFix - Queue Worker" cmd /k "cd /d "%~dp0" && php artisan queue:work"
echo Launching WhatsApp Bot...
start "CampusFix - WhatsApp Bot" cmd /k "cd /d "%~dp0\whatsapp-bot" && npm start"
echo.
echo All core services have been launched in separate windows!
timeout /t 3 >nul
goto MENU

:INVALID
echo.
echo Invalid option selected. Please choose 1, 2, 3, 4, 5, or 6.
timeout /t 2 >nul
goto MENU

:EXIT
echo.
echo Goodbye!
timeout /t 1 >nul
exit /b 0
