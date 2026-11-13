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
| A5 | Beliebigen Ort weltweit suchen (Christchurch) | Vorschlag aus der Ortssuche, Suche startet, Link enthält den Namen |

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

## D – Karte (`map.spec.ts`)

| ID | Testfall | Erwartung |
|---|---|---|
| D1 | Wetter-Pill eines Orts anklicken | Pills sichtbar, Klick öffnet die Detailansicht |
| D2 | Sammel-Pill anklicken | Karte zoomt hinein, danach mindestens so viele Einzelorte sichtbar (übersprungen, wenn es keine Sammel-Pill gibt) |
| D3 | Legende und Radius | Legende „n Treffer · Zeitraum“, Startpunkt und Radius-Kreis auf der Karte |

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

## Änderungen

| Datum | Version | Änderung |
|---|---|---|
| 13.11.2026 | 2.0 | Testbibliothek angelegt (A1–G6) |
| 13.11.2026 | 2.0 | E1/E2: Sprach-/Einheitenschalter eindeutig ansprechen; G7 Antwortzeit neu; Zeitlimits für langsame Suchen erhöht |
| 13.11.2026 | 2.0 | Suche beschleunigt (G7 war rot: 14–26 s für 300 km); keine Teständerung |
