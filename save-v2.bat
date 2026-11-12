@echo off
setlocal
title Sunify 2.0 - Stand speichern und zu GitHub hochladen
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%ProgramFiles%\GitHub CLI;%PATH%"

where git >nul 2>nul
if errorlevel 1 goto nogit
if not exist .git goto nogit

echo [1/4] Abhaengigkeiten aktualisieren ...
call npm install --no-audit --no-fund
if errorlevel 1 goto failed

echo.
if not exist .github\workflows mkdir .github\workflows
copy /y scripts\github-workflows\*.yml .github\workflows\ >nul
echo [2/4] Dateien von Version 1.0 entfernen, die 2.0 nicht mehr braucht (bleiben im Stand v1.0 erhalten) ...
for /f "usebackq delims=" %%f in ("scripts\git\obsolete-v1.txt") do git rm -r -q --ignore-unmatch "%%f" >nul
if exist tsconfig.tsbuildinfo del /q tsconfig.tsbuildinfo
echo.
echo Sicherheitspruefung (keine Passwoerter im Upload) ...
git add -A
node scripts\git-safety-check.mjs
if errorlevel 1 goto unsafe

echo.
echo [3/4] Stand speichern ...
git diff --cached --quiet
if not errorlevel 1 goto push
git commit -q -F scripts\git\commit-v2.txt
if errorlevel 1 goto failed

:push
echo.
echo [4/4] Zu GitHub hochladen ...
rem Fuer die automatischen Ablaeufe (.github\workflows) braucht GitHub die Berechtigung "workflow"
gh auth status 2>&1 | findstr /c:"workflow" >nul
if not errorlevel 1 goto dopush
echo GitHub braucht einmalig eine zusaetzliche Berechtigung fuer die automatischen Ablaeufe.
echo Gleich erscheint wieder ein Code: Enter druecken, im Browser bestaetigen und den Code eingeben.
gh auth refresh -h github.com -s workflow
if errorlevel 1 goto failed
gh auth setup-git >nul 2>nul
:dopush
git push origin main
if errorlevel 1 goto failed

echo.
echo Fertig. Der Stand ist bei GitHub:
gh repo view --json url --jq .url
pause
exit /b 0

:unsafe
echo.
echo Die Sicherheitspruefung hat Zugangsdaten gefunden. Es wurde nichts gespeichert oder hochgeladen.
git reset -q
echo Bitte die Meldung oben an Claude schicken.
pause
exit /b 1

:nogit
echo Git bzw. das Repository fehlt. Bitte zuerst setup-github.bat ausfuehren.
pause
exit /b 1

:failed
echo.
echo Abgebrochen. Bitte die Meldung oben an Claude schicken.
pause
exit /b 1
