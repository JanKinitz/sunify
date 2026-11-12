@echo off
setlocal
title Sunify - Datenbank einrichten
cd /d "%~dp0"

where node >nul 2>nul
if not errorlevel 1 goto envcheck
if not exist "%ProgramFiles%\nodejs\node.exe" goto nonode
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"

:envcheck
if exist .env.local goto install
copy .env.example .env.local >nul 2>nul
echo Die Datei .env.local wurde aus der Vorlage angelegt und oeffnet sich jetzt im Editor.
echo.
echo Bitte in der Zeile DATABASE_URL die Verbindungs-URL deiner Datenbank eintragen,
echo die Datei speichern, den Editor schliessen und diese Datei erneut starten.
echo.
start "" notepad .env.local
pause
exit /b 0

:install
echo [1/4] Abhaengigkeiten aktualisieren ...
call npm install
if errorlevel 1 goto failed
echo.
echo [2/4] Datenbank-Schema anlegen ...
call npm run --silent db:migrate
if errorlevel 1 goto failed
echo.
echo [3/4] Raster und Orte importieren ...
call npm run --silent db:seed
if errorlevel 1 goto failed
echo.
echo [4/4] Ergebnis pruefen ...
call npm run --silent db:check
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
echo Die Einrichtung wurde mit einem Fehler abgebrochen. Bitte die Meldung oben pruefen.
pause
exit /b 1
