@echo off
setlocal
title Sunify - GitHub einrichten und Version 1.0 sichern
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%ProgramFiles%\GitHub CLI;%PATH%"

where node >nul 2>nul
if errorlevel 1 goto nonode

echo [1/7] Git pruefen ...
where git >nul 2>nul
if not errorlevel 1 goto gh
echo Git ist noch nicht installiert. Es wird jetzt ueber den Windows-Paketmanager installiert.
echo Mit J stimmst du den Lizenzbedingungen von Git zu. Windows fragt ggf. nach Administratorrechten.
choice /c JN /m "Git jetzt installieren"
if errorlevel 2 goto cancel
winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
where git >nul 2>nul
if errorlevel 1 goto restart

:gh
echo.
echo [2/7] GitHub-Programm pruefen ...
where gh >nul 2>nul
if not errorlevel 1 goto env
echo Das GitHub-Kommandozeilenprogramm wird jetzt installiert.
echo Mit J stimmst du den Lizenzbedingungen von GitHub CLI zu.
choice /c JN /m "GitHub CLI jetzt installieren"
if errorlevel 2 goto cancel
winget install -e --id GitHub.cli --accept-source-agreements --accept-package-agreements
where gh >nul 2>nul
if errorlevel 1 goto restart

:env
echo.
echo [3/7] Datenbank fuer Version 2.0 pruefen ...
node scripts\prepare-env-v2.mjs
if errorlevel 2 goto editenv
if errorlevel 1 goto failed

echo.
echo [4/7] Bei GitHub anmelden ...
gh auth status >nul 2>nul
if not errorlevel 1 goto gitconfig
echo Gleich erscheint ein Code. Druecke Enter, bestaetige im Browser die Anmeldung und gib den Code ein.
gh auth login --hostname github.com --git-protocol https --web
if errorlevel 1 goto failed

:gitconfig
for /f "delims=" %%i in ('gh api user --jq .login') do set "GHLOGIN=%%i"
for /f "delims=" %%i in ('gh api user --jq .id') do set "GHID=%%i"

echo.
echo [5/7] Version 1.0 sichern ...
if exist .git goto remote
git init -b main
git config user.name "%GHLOGIN%"
git config user.email "%GHID%+%GHLOGIN%@users.noreply.github.com"
git add -A
node scripts\git-safety-check.mjs
if errorlevel 1 goto unsafe
git commit -q -F scripts\git\commit-v1.txt
if errorlevel 1 goto failed
git tag -a v1.0 -m "Version 1.0 (Vercel, DACH)"

:remote
echo.
echo [6/7] Repository bei GitHub anlegen und hochladen ...
git remote get-url origin >nul 2>nul
if not errorlevel 1 goto push
gh repo create sunify --public --source . --remote origin --description "Sunify - Wetter-Rueckwaertssuche"
if errorlevel 1 goto failed
:push
git push -u origin main --tags
if errorlevel 1 goto failed

echo.
echo [7/7] Zugangsdaten fuer die Datenjobs hinterlegen (Werte werden nicht angezeigt) ...
node scripts\github-secrets.mjs
if errorlevel 1 goto failed

echo.
echo Fertig. Dein Repository:
gh repo view --json url --jq .url
echo Version 1.0 ist dort als Stand "v1.0" gesichert und laeuft unveraendert auf Vercel weiter.
pause
exit /b 0

:editenv
echo.
echo Die Datei .env.local oeffnet sich jetzt. Trage in der Zeile DATABASE_URL die
echo Verbindungs-URL des NEUEN Supabase-Projekts ein, speichere, schliesse den Editor
echo und starte diese Datei danach erneut.
start "" notepad .env.local
pause
exit /b 0

:unsafe
echo.
echo Die Sicherheitspruefung hat Zugangsdaten gefunden. Es wurde nichts hochgeladen.
echo Bitte die Meldung oben an Claude schicken.
rmdir /s /q .git
pause
exit /b 1

:restart
echo.
echo Die Installation ist abgeschlossen, Windows kennt das Programm aber erst in einem neuen Fenster.
echo Bitte dieses Fenster schliessen und setup-github.bat erneut starten.
pause
exit /b 0

:nonode
echo Node.js wurde nicht gefunden. Bitte zuerst start-sunify.bat ausfuehren.
pause
exit /b 1

:cancel
echo Abgebrochen.
pause
exit /b 1

:failed
echo.
echo Die Einrichtung wurde mit einem Fehler abgebrochen. Bitte die Meldung oben an Claude schicken.
pause
exit /b 1
