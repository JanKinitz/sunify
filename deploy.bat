@echo off
setlocal
title Sunify - Veroeffentlichen bei Vercel
cd /d "%~dp0"

where node >nul 2>nul
if not errorlevel 1 goto envcheck
if not exist "%ProgramFiles%\nodejs\node.exe" goto nonode
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"

:envcheck
if not exist .env.local goto noenv

echo [1/6] Code pruefen ...
call npx tsc --noEmit
if errorlevel 1 goto typefailed

echo.
echo [2/6] Zugangsschutz fuer den Wetter-Abruf sicherstellen ...
call npm run --silent weather:secret
if errorlevel 1 goto failed

echo.
echo [3/6] Anmeldung bei Vercel pruefen ...
call npx --yes vercel@latest whoami >nul 2>nul
if not errorlevel 1 goto link
echo Du bist noch nicht angemeldet. Gleich oeffnet sich der Browser oder es erscheint
echo ein Link mit Code - bitte dort die Anmeldung bei Vercel bestaetigen.
echo.
call npx --yes vercel@latest login
if errorlevel 1 goto failed

:link
echo.
echo [4/6] Projekt "sunify" bei Vercel anlegen bzw. verknuepfen ...
call npx --yes vercel@latest link --yes --project sunify
if errorlevel 1 goto failed

echo.
echo [5/6] Datenbank-Verbindung und Zugangsschutz uebertragen (Werte werden nicht angezeigt) ...
call npm run --silent deploy:env
if errorlevel 1 goto failed

echo.
echo [6/6] App veroeffentlichen - das dauert 1-3 Minuten ...
call npx --yes vercel@latest deploy --prod --yes
if errorlevel 1 goto failed

echo.
echo Fertig. Die oeffentliche Adresse deiner App steht oben in der Zeile mit "Aliased".
echo Nur diese kurze Adresse ist ohne Vercel-Anmeldung erreichbar - bitte nur sie teilen.
echo Der Wetter-Abruf laeuft bei Vercel automatisch einmal taeglich gegen 4 Uhr.
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

:typefailed
echo.
echo Die Code-Pruefung hat Fehler gefunden. Bitte die Meldungen oben an Claude schicken.
pause
exit /b 1

:failed
echo.
echo Die Veroeffentlichung wurde mit einem Fehler abgebrochen. Bitte die Meldung oben pruefen.
pause
exit /b 1
