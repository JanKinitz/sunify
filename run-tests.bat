@echo off
setlocal
title Sunify - Testbibliothek ausfuehren
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%ProgramFiles%\GitHub CLI;%PATH%"

echo Welche Version testen?
echo   [1] Online-Version (https://sunify-app.netlify.app)  - Standard
echo   [2] Lokale Version (start-sunify.bat muss laufen)
echo   [3] Bei GitHub ausfuehren (Rechner kann danach aus)
set /p CHOICE=Auswahl (Enter = 1): 
if "%CHOICE%"=="3" goto github
set "SUNIFY_URL=https://sunify-app.netlify.app"
if "%CHOICE%"=="2" set "SUNIFY_URL=http://localhost:3000"

echo.
echo [1/3] Abhaengigkeiten und Test-Browser pruefen (beim ersten Mal einige Minuten) ...
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
call npx playwright install chromium webkit
if errorlevel 1 goto failed

echo.
echo [2/3] Alle Testfaelle ausfuehren (Desktop, Android, iPhone) gegen %SUNIFY_URL% ...
call npx playwright test
set "RESULT=%errorlevel%"

echo.
echo [3/3] Bericht oeffnen ...
start "" npx playwright show-report e2e/report
if not "%RESULT%"=="0" (
  echo Es sind Tests fehlgeschlagen. Details im Bericht im Browser.
) else (
  echo Alle Tests bestanden.
)
pause
exit /b %RESULT%

:github
gh workflow run e2e.yml
if errorlevel 1 goto failed
echo Gestartet. Ergebnis unter: 
gh repo view --json url --jq ".url + \"/actions/workflows/e2e.yml\""
pause
exit /b 0

:failed
echo.
echo Abgebrochen. Bitte die Meldung oben an Claude schicken.
pause
exit /b 1
