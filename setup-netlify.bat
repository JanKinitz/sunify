@echo off
setlocal
title Sunify 2.0 - Veroeffentlichung bei Netlify einrichten
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%ProgramFiles%\GitHub CLI;%PATH%"

where gh >nul 2>nul
if errorlevel 1 goto nogh
gh auth status >nul 2>nul
if errorlevel 1 goto nogh

if exist .netlify\state.json goto run
echo Fuer die Einrichtung brauchst du einen Netlify-Zugangsschluessel:
echo   1. Im Browser oeffnet sich gleich Netlify. Falls noch kein Konto: "Sign up" - "GitHub" waehlen.
echo   2. Auf der Seite "Personal access tokens" auf "New access token" klicken.
echo   3. Beschreibung: Sunify GitHub   -   Ablauf: "No expiration" (oder ein spaetes Datum)
echo   4. "Generate token" klicken und den Schluessel mit dem Kopier-Symbol kopieren.
echo Danach hierher zurueckkehren.
echo.
pause
start "" "https://app.netlify.com/user/applications#personal-access-tokens"

:run
echo.
node scripts\netlify-setup.mjs
if errorlevel 1 goto failed

echo.
echo Erste Veroeffentlichung starten (laeuft bei GitHub, ca. 3-5 Minuten) ...
gh workflow run deploy-netlify.yml
if errorlevel 1 goto failed
timeout /t 10 /nobreak >nul 2>nul
for /f "delims=" %%i in ('gh run list --workflow deploy-netlify.yml --limit 1 --json databaseId --jq ".[0].databaseId"') do set "RUNID=%%i"
gh run watch %RUNID% --exit-status
if errorlevel 1 goto runfailed

echo.
set /p SITEURL=<.netlify\url.txt
echo Sunify 2.0 ist online: %SITEURL%
echo Ab jetzt wird jede neue Version automatisch veroeffentlicht, sobald sie bei GitHub ist.
start "" "%SITEURL%"
pause
exit /b 0

:runfailed
echo.
gh run view %RUNID% --log-failed > netlify-fehler.txt
echo Die Veroeffentlichung ist fehlgeschlagen. Die Meldungen stehen in netlify-fehler.txt - bitte an Claude schicken.
pause
exit /b 1

:nogh
echo GitHub ist noch nicht eingerichtet. Bitte zuerst setup-github.bat ausfuehren.
pause
exit /b 1

:failed
echo.
echo Abgebrochen. Bitte die Meldung oben an Claude schicken.
pause
exit /b 1
