@echo off
setlocal
title Sunify - Datenbank-Schema aktualisieren
cd /d "%~dp0"

where node >nul 2>nul
if not errorlevel 1 goto run
if not exist "%ProgramFiles%\nodejs\node.exe" goto nonode
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"

:run
echo Fuehrt nur die SQL-Migrationen aus. Orte und Wetterdaten bleiben erhalten.
echo.
call npm run --silent db:migrate
if errorlevel 1 goto failed
echo.
echo Fertig. Dieses Fenster kann geschlossen werden.
pause
exit /b 0

:nonode
echo Node.js wurde nicht gefunden. Bitte zuerst start-sunify.bat ausfuehren.
pause
exit /b 1

:failed
echo.
echo Die Migration wurde mit einem Fehler abgebrochen. Bitte die Meldung oben pruefen.
pause
exit /b 1
