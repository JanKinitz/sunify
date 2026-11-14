# Sunify – Testbibliothek

Alle Testfälle der Web-App. Jeder Fall ist ein automatischer Test in `e2e/*.spec.ts` (ID im Testnamen) und läuft in
**drei Ansichten**: Desktop (Chrome, 1440 × 900), Android (Pixel 7) und iPhone (iPhone 14, Safari/WebKit).
Fälle mit „nur mobil“ werden auf dem Desktop übersprungen.

**Wann:** automatisch nach jeder Veröffentlichung (GitHub Actions → „Tests (alle Ansichten)“, Bericht unter
*Artifacts → testbericht*), auf Knopfdruck in GitHub oder lokal mit `run-tests.bat`.

**Pflege bei jedem Release:** Neue oder geänderte Funktionen bekommen hier einen Eintrag (neue ID, nie eine alte
wiederverwenden) und einen passenden Test. Entfallene Funktionen werden mit ihrem Test gestrichen und in der
Änderungsliste unten vermerkt. Erst wenn der komplette Lauf grün ist, gilt ein Release als fertig.

Die Tests verändern keine Daten. Wetterwerte ändern sich täglich, deshalb prüfen sie Verhalten und Darstellung,
nicht bestimmte Orte oder Temperaturen. Sie arbeiten mit zwei festen Suchen: einer **breiten Suche** (München,
300 km, alle Wetter-Regler auf „egal“), die praktisch immer Treffer hat, und einer **unmöglichen Suche**
(35 °C, windstill, 12 Std. Sonne, trocken, 50 km), die praktisch nie Treffer hat.

## A – Start, Startort und Umkreis (`start.spec.ts`)

| ID | Testfall | Erwartung |
|---|---|---|
| A1 | App ohne Parameter öffnen | Startort-Feld leer mit Hinweis, Legende „Startort wählen“, Liste zeigt „Wo soll’s losgehen?“, Wetter-Regler auf „Egal“, **keine** Suche an den Server |
| A2 | Startort aus den Vorschlägen wählen (München) | Suche startet, Feld zeigt „München“, Link enthält `o=muenchen`, Legende zeigt Trefferzahl, Startpunkt auf der Karte |
| A3 | Umkreis in der Top-Bar auf 100 km stellen | neue Suche mit 100 km, Link enthält `r=100` |
| A4 | GPS-Knopf (Position Konstanz) | Feld zeigt „Mein Standort“, Link enthält die gerundeten Koordinaten |
| A5 | Beliebigen Ort weltweit suchen (Christchurch) | Vorschlag aus der Ortssuche, Suche startet, Link enthält den Namen, mit allen Reglern auf „egal“ gibt es Treffer |
| A6 | Platzhalter im Startort-Feld | Handy „Startort“, Desktop „Startort eingeben …“; der Text passt ins Feld (nicht abgeschnitten) |
| A7 | Suche mit Startort und Filtern, dann Klick auf Logo/Schriftzug | Startort leer, Legende „Startort wählen“, Link ohne Startort und Filter (komplett zurück auf Start) |

## B – Filter (`filters.spec.ts`)

| ID | Testfall | Erwartung |
|---|---|---|
| B1 | Aktivitätsprofil „Wandern“ | Profil ist markiert, Suche mit Mindesttemperatur |
| B2 | Temperatur-Regler | ganz links „Egal“; auf 12 gestellt „≥ 12 °C“ und `t=12` im Link |
| B3 | Zeitraum „Nächstes Wochenende“, „Individuell“ | Link enthält `d=nextWeekend`; bei „Individuell“ erscheinen Von/Bis |
| B4 | Genauigkeit „Flexibel“ | Suche mit Toleranz 2, Link enthält `tol=2` |
| B5 | „Filter zurücksetzen“ | Filter auf Startwerte, **Startort bleibt** |
| B6 | Filter ändern, während ein Ergebnis angezeigt wird (Suche künstlich verzögert) | Legende und (mobil) Filter-Button zeigen „Suche läuft …“ statt der alten Trefferzahl, danach die neue Zahl |

## C – Ergebnisse, Detail, Merkliste, Teilen (`results.spec.ts`)

| ID | Testfall | Erwartung |
|---|---|---|
| C1 | Ergebnisliste der breiten Suche | mehrere Ergebniskarten mit Temperatur; Sortierung „Kürzeste Entfernung“ wählbar |
| C2 | „Details & Unterkünfte“ öffnen | Detailansicht mit Ortsname, Wetter-Timeline, Booking-Link mit Check-in/-out, Google-Maps-Route; schließt per Escape bzw. „Schließen“ |
| C3 | Ort merken, neu laden, Merkliste öffnen, entfernen | Hinweis „gemerkt“, Ort bleibt nach Neuladen in der Merkliste, Entfernen leert sie |
| C4 | Unmögliche Suche | Leerzustand „Hier versteckt sich die Sonne noch“ mit „Alle Filter zurücksetzen“, nie eine leere Seite |
| C5 | „Suche teilen“ | Hinweis, dass der Link kopiert wurde |
| C6 | Geteilten Link öffnen (Frankfurt, 150 km, 8 °C, etwas flexibel) | Startort und alle Filter werden übernommen und an die Suche übergeben |
| C7 | Suche „Etwas flexibel“, Mindesttemperatur so gewählt, dass morgen ein Teil der Orte knapp darunter liegt | es gibt Fast-Treffer, und sie nennen in der Liste den Grund, z. B. „≈ Sa: 19 °C statt mind. 20 °C“ |
| C8 | Zeitraum Tag 10–11 | Hinweis „Ab dem 8. Tag … unsicher“ über der Liste, in der Detailansicht „Trend“ an den Tagen |
| C9 | Suche für morgen, Detailansicht | kein Unsicherheits-Hinweis; Vortag und Folgetag stehen immer in der Timeline – als Wettertag oder als Platzhalter „keine Wetterdaten“ |

## D – Karte (`map.spec.ts`)

| ID | Testfall | Erwartung |
|---|---|---|
| D1 | Wetter-Pill eines Orts anklicken | Pills sichtbar, Klick öffnet die Detailansicht |
| D2 | Sammel-Pill anklicken | Karte zoomt hinein, danach mindestens so viele Einzelorte sichtbar (übersprungen, wenn es keine Sammel-Pill gibt) |
| D3 | Legende und Radius | Legende „n Treffer · Zeitraum“, Startpunkt und Radius-Kreis auf der Karte |
| D4 | Fast-Treffer auf der Karte (Suche wie C7) | gelbe Pills zeigen die Übereinstimmung, z. B. „75 %“ (übersprungen, wenn alle Fast-Treffer in Sammel-Pills stecken) |

## E – Sprache und Einheiten (`i18n.spec.ts`)

| ID | Testfall | Erwartung |
|---|---|---|
| E1 | Auf „EN“ umschalten | Seite auf Englisch (`lang="en"`), Ergebnisse werden neu geladen, Startort „Munich“ |
| E2 | Auf „°F“ umschalten | Umkreis in Meilen, Pills in °F |
| E3 | Link mit `?lang=en` | Seite startet auf Englisch |

## F – Handy-Bedienung und Layout (`mobile.spec.ts`)

| ID | Testfall | Erwartung |
|---|---|---|
| F1 | „Liste anzeigen“ / „Karte anzeigen“ (nur mobil) | Button zeigt die Trefferzahl; Bottom-Sheet öffnet und schließt |
| F2 | Filter-Sheet (nur mobil) | öffnet, Button zeigt „… auf der Karte anzeigen“ bzw. „Keine Treffer …“, schließt |
| F3 | Startbildschirm, alle Ansichten | Startort-Feld und Umkreis ohne Scrollen sichtbar, im oberen Bereich |
| F4 | Breite Suche, alle Ansichten | kein seitliches Scrollen |
| F5 | Tippflächen (nur mobil) | Startort, Umkreis, Filter, Merkliste mindestens 32 px groß |
| F6 | Unmögliche Suche auf dem Handy | Liste klappt von selbst auf und zeigt den Leerzustand mit Vorschlägen; zugeklappt heißt der Knopf „Keine Treffer – Vorschläge ansehen“ |

## G – Technik, Installation, Updates, Daten (`tech.spec.ts`)

| ID | Testfall | Erwartung |
|---|---|---|
| G1 | App-Manifest | erreichbar, `standalone`, alle Icons und der Service Worker laden |
| G2 | `/api/status` | > 100.000 Orte, > 10.000 Rasterpunkte und Prognosen, Prognose reicht mindestens 7 Tage |
| G3 | `/api/version` | liefert eine Build-Kennung, wird nicht zwischengespeichert |
| G4 | Breite Suche | keine Fehler in der Browser-Konsole (außer Kartenkacheln/Fotos fremder Server) |
| G5 | Server meldet neuere Version | Hinweis „Eine neue Version von Sunify ist da.“ mit „Aktualisieren“ |
| G6 | Quellenangaben | Open-Meteo, NOAA GFS, GeoNames, Wikimedia Commons, OpenStreetMap unter der Liste |
| G7 | Antwortzeit: breite Suche (München, 300 km) dreimal direkt an `/api/search` (nur Desktop-Lauf) | schnellste Antwort unter 8 s; Laufzeiten je Abfrageschritt stehen im Bericht |
| G8 | Prognosen weltweit (Christchurch, Tokio, Kapstadt, Denver, Honolulu, Buenos Aires), Wochenende, alles „egal“ (nur Desktop-Lauf) | überall Treffer – fängt verschobene Tage in fernen Zeitzonen ab |
| G9 | Graue Punkte (nur Desktop-Lauf) | bei „alles egal“ (> 100 Treffer) kein grauer Punkt; bei strenger Suche nie ein Ort zugleich Treffer und grau; strenge Suche ohne Treffer antwortet samt Lockerungsvorschlägen in < 20 s |

## H – Meine Suchen (`presets.spec.ts`)

| ID | Testfall | Erwartung |
|---|---|---|
| H1 | Suche öffnen, unter „Meine Suchen“ speichern, neu laden | Vorlage bleibt (Browser-Speicher), Knopf zeigt sie als aktiv |
| H2 | Vorlage speichern, andere Suche öffnen, Vorlage laden | Startort, Umkreis und Filter aus der Vorlage, Zeitraum bleibt unverändert |
| H3 | Vorlage als Start-Vorlage (★) markieren, App ohne Parameter öffnen, danach geteilten Link öffnen | Start-Vorlage wird geladen; ein geteilter Link hat Vorrang |
| H4 | Vorlage löschen, Rückfrage erst abbrechen, dann bestätigen | erst bleibt sie, dann ist die Liste leer mit Hinweistext |
| H5 | Vorlage speichern, App ohne Startort öffnen | Startseite zeigt „Meine Suchen“ als Schnellwahl, ein Klick startet die Suche |

## I – Einführung für Erstbesucher (`tour.spec.ts`)

| ID | Testfall | Erwartung |
|---|---|---|
| I1 | Erster Besuch, Tour komplett durchklicken (inkl. „Zurück“), neu laden | Willkommen mit Zweck der Seite; Schritt 1 zeigt das echte GPS-Symbol; Schritt 1–5 mit Markierung (Startort, Umkreis, Filter, Ergebnisse, Meine Suchen); danach nie wieder automatisch |
| I2 | Erster Besuch, „Überspringen“ | Einführung zu, Seite sofort bedienbar, beim Neuladen keine Einführung |
| I3 | „?“ (Kurzanleitung) in der Top-Bar, dann Esc | Einführung startet erneut, Esc schließt sie |

Hinweis: `openApp` markiert die Einführung für alle anderen Tests als gesehen.

## Änderungen

| Datum | Version | Änderung |
|---|---|---|
| 13.11.2026 | 2.0 | Testbibliothek angelegt (A1–G6) |
| 13.11.2026 | 2.0 | E1/E2: Sprach-/Einheitenschalter eindeutig ansprechen; G7 Antwortzeit neu; Zeitlimits für langsame Suchen erhöht |
| 13.11.2026 | 2.0 | Suche beschleunigt (G7 war rot: 14–26 s für 300 km); keine Teständerung |
| 13.11.2026 | 2.0 | Fehler: Tage in fernen Zeitzonen um einen Tag verschoben (Christchurch ohne Treffer). A5 verschärft, G8 neu; Unit-Tests der Datenaufbereitung in `pipeline/tests/` |
| 13.11.2026 | 2.0 | Fast-Treffer-Grund (C7), Unsicherheit ab Tag 8 (C8), Vor-/Folgetag immer sichtbar (C9), Prozent auf Pills (D4), graue Punkte korrekt (G9) |
| 13.11.2026 | 2.0 | C7/D4: Suche passt sich dem aktuellen Wetter an, damit es sicher Fast-Treffer gibt (vorher übersprungen) |
| 13.11.2026 | 2.0 | C7/D4: Schwelle wird am Server ausprobiert (vorher geschätzt, ohne Fast-Treffer); Protokoll der Versuche im Testlauf |
| 13.11.2026 | 2.0 | Tests laufen vor der Live-Schaltung gegen eine kostenlose Vorschau-Version; B6 mit längerer künstlicher Verzögerung (auf dem iPhone gelegentlich zu knapp) |
| 13.11.2026 | 2.0 | „Meine Suchen“: eigene Vorlagen mit Startort, Umkreis und Filtern, Start-Vorlage (H1–H5) |
| 13.11.2026 | 2.0 | Einführung für Erstbesucher mit Markierungen und Kurzanleitung „?“ (I1–I3) |
| 14.11.2026 | 2.0 | B6: Suche wird angehalten, bis der Zwischenzustand geprüft ist, statt fester Verzögerung (iPhone) |
| 14.11.2026 | 2.0 | G9 prüft zusätzlich Antwort und Dauer der Suche ohne Treffer (Lockerungsvorschläge liefen vorher in eine Zeitüberschreitung) |
| 14.11.2026 | 2.0 | Platzhalter Startort auf dem Handy kurz (A6), Logo setzt alles zurück (A7), Tour zeigt GPS-Symbol statt Pinnadel (I1) |
| 14.11.2026 | 2.0 | Handy: bei 0 Treffern klappt die Liste mit den Vorschlägen von selbst auf (F6); Toleranz-Vorschlag prüft „Etwas flexibel“ und „Flexibel“ zuerst |
