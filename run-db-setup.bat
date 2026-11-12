@echo off
setlocal
title Sunify 2.0 - Datenbank einrichten (laeuft bei GitHub)
cd /d "%~dp0"
set "PATH=%ProgramFiles%\Git\cmd;%ProgramFiles%\GitHub CLI;%PATH%"

where gh >nul 2>nul
if errorlevel 1 goto nogh
gh auth status >nul 2>nul
if errorlevel 1 goto nogh

echo Die Einrichtung laeuft auf den Servern von GitHub, nicht auf deinem Rechner.
echo Sie laedt alle Orte der Welt, baut das Raster und holt die ersten Wetterdaten.
echo Das dauert voraussichtlich 1 bis 3 Stunden. Dieses Fenster zeigt den Fortschritt;
echo du kannst es auch schliessen - der Lauf geht bei GitHub weiter.
echo.
echo ACHTUNG: Orte, Raster und Wetterdaten der Version 2.0 werden dabei neu aufgebaut.
choice /c JN /m "Einrichtung jetzt starten"
if errorlevel 2 exit /b 0

gh workflow run db-setup.yml
if errorlevel 1 goto failed
echo Gestartet. Warte auf den Lauf ...
timeout /t 10 /nobreak >nul 2>nul
for /f "delims=" %%i in ('gh run list --workflow db-setup.yml --limit 1 --json databaseId --jq ".[0].databaseId"') do set "RUNID=%%i"
gh run watch %RUNID% --exit-status
if errorlevel 1 goto runfailed
echo.
echo Fertig. Die Datenbank von Version 2.0 ist eingerichtet und hat erste Wetterdaten.
pause
exit /b 0

:runfailed
echo.
echo Der Lauf ist mit einem Fehler beendet. Die letzten Meldungen:
gh run view %RUNID% --log-failed > db-setup-fehler.txt
echo Die Fehlermeldungen stehen in der Datei db-setup-fehler.txt - bitte an Claude schicken.
pause
exit /b 1

:nogh
echo GitHub ist noch nicht eingerichtet. Bitte zuerst setup-github.bat ausfuehren.
pause
exit /b 1

:failed
echo Der Lauf konnte nicht gestartet werden. Bitte die Meldung oben an Claude schicken.
pause
exit /b 1
