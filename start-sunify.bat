@echo off
setlocal
title Sunify - Entwicklungsserver
cd /d "%~dp0"

where node >nul 2>nul
if not errorlevel 1 goto deps
if exist "%ProgramFiles%\nodejs\node.exe" goto addpath

echo Node.js ist auf diesem Rechner noch nicht installiert.
echo Sunify braucht Node.js LTS, um lokal zu laufen.
echo.
where winget >nul 2>nul
if errorlevel 1 goto nowinget

echo Soll Node.js LTS jetzt ueber den Windows-Paketmanager winget installiert werden?
echo Quelle: offizielles Paket OpenJS.NodeJS.LTS.
echo Mit J stimmst du den Lizenzbedingungen von Node.js und der winget-Quelle zu.
echo Windows fragt danach einmal nach Administratorrechten - bitte mit Ja bestaetigen.
echo.
choice /c JN /m "Node.js jetzt installieren"
if errorlevel 2 goto cancel
echo.
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
if not exist "%ProgramFiles%\nodejs\node.exe" goto installfailed
echo.
echo Node.js wurde installiert.

:addpath
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"

:deps
if exist node_modules goto run
echo.
echo Installiere Abhaengigkeiten - das dauert beim ersten Mal 1-3 Minuten ...
call npm install
if errorlevel 1 goto npmfailed

:run
echo.
echo Sunify startet. Im Browser oeffnen: http://localhost:3000
echo Zum Beenden dieses Fenster schliessen oder Strg+C druecken.
echo.
call npm run dev
pause
exit /b 0

:nowinget
echo Der Windows-Paketmanager winget ist hier nicht verfuegbar.
echo Bitte Node.js LTS von https://nodejs.org herunterladen, installieren
echo und diese Datei danach erneut starten.
pause
exit /b 1

:cancel
echo Abgebrochen. Ohne Node.js kann Sunify nicht gestartet werden.
pause
exit /b 1

:installfailed
echo.
echo Die Installation von Node.js hat nicht geklappt. Bitte die Meldungen oben pruefen
echo oder Node.js LTS von https://nodejs.org von Hand installieren.
pause
exit /b 1

:npmfailed
echo.
echo npm install ist fehlgeschlagen. Bitte die Meldungen oben pruefen.
pause
exit /b 1
