@echo off
setlocal
title Sunify - Wetterdaten aktualisieren
cd /d "%~dp0"

where node >nul 2>nul
if not errorlevel 1 goto run
if not exist "%ProgramFiles%\nodejs\node.exe" goto nonode
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"

:run
if not exist .env.local goto noenv
call npm run --silent weather:secret
call npm run --silent weather:sync
if errorlevel 1 goto failed
echo.
call npm run --silent db:check
echo.
echo Fertig. Dieses Fenster kann geschlossen werden.
pause
exit /b 0

:nonode
echo Node.js wurde nicht gefunden. Bitte zuerst start-sunify.bat ausfuehren.
pause
exit /b 1

:noenv
echo Die Datei .env.local fehlt. Bitte zuerst setup-database.bat ausfuehren.
pause
exit /b 1

:failed
echo.
echo Der Wetter-Sync wurde mit einem Fehler beendet. Bitte die Meldung oben pruefen.
pause
exit /b 1
