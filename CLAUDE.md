# Sunify – Projektregeln für Claude

Wetter-Rückwärtssuche: „Wo im Umkreis von X km herrscht im Zeitraum Y mein Wunschwetter?“
Vollständige Spezifikation: `SPEC.md` (nur lokal, nicht im öffentlichen Repository).

## Versionen

- **1.0** (DACH, Vercel): Git-Tag `v1.0`, läuft unverändert unter https://sunify-xi.vercel.app/ mit eigener
  Supabase-Datenbank (`DATABASE_URL_V1` in `.env.local`). **Nicht mehr `deploy.bat`/Vercel-Deploy ausführen.**
- **2.0** (weltweit, Netlify + GitHub Actions + eigenes Supabase-Projekt): Branch `main`.

## Harte Regeln

1. **UI-First:** Layout und Bedienkonzept aus Phase 0 bleiben; neue Funktionen fügen sich ein.
2. **Weather-First statt City-First:** Wetter hängt an Rasterpunkten, nicht an Orten. Jeder Ort hat eine feste
   `grid_id`. **Bei einer Nutzersuche gibt es keine externen Wetter-API-Calls** – die Suche läuft zu 100 % auf der
   eigenen PostgreSQL/PostGIS-Datenbank.
3. **Treffer-Logik mit Toleranz:** `strikt` (0) = jeder Tag erfüllt jedes Kriterium; `etwas flexibel` (1) und
   `flexibel` (2) erlauben Abweichungen (`TOLERANCE_SLACK` in `lib/categories.ts`, gespiegelt in
   `search_destinations_v2`), bei 2 zusätzlich `GREATEST(1, Tage/4)` komplett verfehlte Tage (ab 2 Tagen).
   Volle Treffer stehen immer vor Fast-Treffern (`strict_match`, dann `match_pct`, dann Tourismus-Score).
4. **Nie eine leere Ergebnisseite:** Smart Empty State mit 1-Klick-Lockerungen inkl. Trefferzahl
   (Radius, Toleranz, Temperatur, Regen, Sonne, Wind, Orts-Charakter). Texte entstehen im Client.
   Toleranz („Etwas flexibel“, „Flexibel“) wird zuerst geprüft, damit sie im Zeitbudget sicher dabei ist.
   Auf dem Handy klappt die Liste bei 0 Treffern von selbst auf (einmal je Ergebnis).
5. **Zugangsdaten** nur in `.env.local` bzw. als GitHub-/Netlify-Secrets. Nie ausgeben, nie committen.
   Vor jedem Commit läuft `scripts/git-safety-check.mjs`. Das Repository ist **öffentlich**.
6. **Nicht-kommerziell:** keine Unterkunfts-, Buchungs-, Affiliate- oder Werbelinks, keine Provisionshinweise
   (Booking-Box Nov. 2026 entfernt). Externe Links nur zu Routen (`utils/routeLinks.ts`: Google/Apple Maps).
   Die freien Datenquellen (u. a. Open-Meteo) erlauben nur nicht-kommerzielle Nutzung.

## Release-Ablauf (Pflicht)

1. Änderung umsetzen, `npm run build` muss fehlerfrei sein.
2. **Testbibliothek anpassen:** für jede neue oder geänderte Funktion Eintrag in `e2e/TESTFAELLE.md` (neue ID,
   Änderungsliste unten ergänzen) und Test in `e2e/*.spec.ts`; entfallene Funktionen samt Test streichen.
   Selektoren: Rollen/Beschriftungen bevorzugen, sonst `data-testid` (Layout-Bereiche siehe `e2e/helpers.ts`).
3. Hochladen: **Claude committet und pusht direkt aus der Cloud** (Claude-GitHub-App auf `JanKinitz/sunify`), aber
   **nur nach ausdrücklicher Bestätigung des Nutzers im Chat – jedes Mal** (vorher kurz sagen, was hochgeht).
   Vor dem Commit `node scripts/git-safety-check.mjs` ausführen. Workflows direkt in `.github/workflows/` und
   `scripts/github-workflows/` gleich halten. Danach den Lauf beobachten und das Ergebnis melden.
   `save-v2.bat` (Laptop) bleibt als Alternative und holt zuerst den neuesten Stand (`git pull --rebase`).
   GitHub baut eine **Vorschau-Version** bei Netlify (0 Credits), lässt **alle Tests in
   drei Ansichten** (Desktop, Android, iPhone) dagegen laufen und schaltet genau diese Version erst bei grünem Lauf live.
   Ein Release ist erst fertig, wenn der Lauf grün und live ist.
   **Netlify-Credits:** Gratis-Tarif 300/Monat, jede Live-Schaltung 15, Vorschauen gratis; bei 0 wird die Seite bis
   zum nächsten Abrechnungsmonat (12.) pausiert. Änderungen bündeln, nicht für Kleinigkeiten hochladen.
4. Nach einer Veröffentlichung erkennt die offene App die neue Build-Kennung (`/api/version`) und lädt neu
   (im Hintergrund still, sonst mit Hinweis „Aktualisieren“) – `components/UpdateNotice.tsx`.

## Architektur 2.0

| Teil | Wo | Was |
|---|---|---|
| App | Netlify (Gratis-Tarif) | Next.js 15, `POST /api/search`, `GET /api/status` |
| Datenjobs | GitHub Actions (öffentliches Repo ⇒ unbegrenzte Minuten) | Python-Pipeline `pipeline/` |
| Datenbank | Supabase (eigenes Projekt für 2.0) | PostGIS, Migrationen in `supabase/migrations/` |

Workflows (`.github/workflows/`; Kopie in `scripts/github-workflows/`, beide gleich halten – `save-v2.bat` kopiert sie):
- `db-setup.yml` (manuell, `run-db-setup.bat`): migrate → seed → weather-om → weather-gfs → status.
- `weather-gfs.yml`: 4× täglich (05:40, 11:40, 17:40, 23:40 UTC) NOAA GFS weltweit, 16 Tage; zusätzlich sofort nach
  Änderungen an `pipeline/daily.py`, `gfs.py`, `weather.py`. Tage vor dem ersten vollständigen lokalen Tag des
  neuen Laufs werden aus dem gespeicherten Lauf übernommen (`extend_back`), damit „heute“ nicht wegfällt.
- Alle Daten-Workflows führen vorher die Unit-Tests `pipeline/tests/` aus (Datumsberechnung je Zeitzone u. a.) und
  spielen die Migrationen ein (sonst Wettlauf mit der Veröffentlichung bei Schemaänderungen).
- `weather-openmeteo.yml`: täglich 04:15 UTC Open-Meteo für Mitteleuropa (Box 43–56° N, 2–20° O, max. 8.000 Punkte).
- `deploy-netlify.yml`: bei jedem Push auf `main`: SQL-Migrationen (`python -m pipeline migrate`, idempotent),
  Vorschau-Deploy (`--alias v-<sha>`, Secrets `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`) → `e2e.yml` gegen die Vorschau →
  Job `live` schaltet die getestete Version per `restoreSiteDeploy` live und prüft `/api/version`.
- `e2e.yml`: Testbibliothek (Playwright) gegen die veröffentlichte Adresse; auch manuell oder per `run-tests.bat`.

## Daten

- **Orte:** GeoNames `cities1000` weltweit + `alternateNamesV2` (de/en) + Wikidata (Sitelinks, Bild P18, Art:
  Kurort, Seebad, Skigebiet, Denkmal, am See/Meer). Fotos von Wikimedia Commons nur mit freier Lizenz
  (CC0, CC BY, CC BY-SA, PD) inkl. Urheber und Lizenz (`image_author`, `image_license`), ab Score 40.
- **Tourismus-Score** (0–100): Heuristik aus Wikipedia-Sitelinks, Einwohnern, Arten (`pipeline/scoring.py`);
  kuratierte DACH-Liste `pipeline/data/curated_destinations.json` überschreibt.
- **Raster (adaptiv):** nur dort, wo Orte liegen. 0,25° bei ≥ 40 Orten oder ≥ 800 m Höhenspanne, 0,5° bei ≥ 8 Orten
  oder ≥ 400 m, sonst 1°. Rasterpunkte liegen auf GFS-Knoten.
- **Höhenkorrektur:** 0,0065 °C/m zwischen Rasterhöhe (einwohnergewichtetes Mittel) und Ortshöhe, begrenzt auf ±8 °C;
  die API liefert `tempCorrection`, `lib/api.ts` rechnet sie auf die Temperaturen.
- **Zeitzonen:** `weather_grid.tz` (IANA, häufigste der Orte); der GFS-Job rechnet den UTC-Versatz je Lauf
  (Sommer-/Winterzeit), fehlende Zeitzonen trägt er einmalig aus GeoNames nach. `utc_offset` ist nur Rückfall.
- **Wetter:** `weather_forecasts` – eine Zeile je Rasterpunkt mit Arrays ab `start_date` (bis 16 Tage).
  Open-Meteo hat Vorrang bis `primary_until`, wird nach 36 h ohne Update als veraltet behandelt; danach GFS.
  GFS hat keine Sonnenstunden ⇒ Schätzung aus Bewölkung × Tageslicht (Kurzwelle > 20 W/m²).
- **Open-Meteo-Lizenz:** Die freie API ist nur nicht-kommerziell. Für kommerzielle Nutzung Abo abschließen und
  `OPEN_METEO_API_KEY` als GitHub-Secret setzen (Pipeline nutzt dann `customer-api.open-meteo.com`).
- Datenstand prüfen: `https://<netlify-adresse>/api/status` (Zählungen + letzte `pipeline_runs`).

## Oberfläche

- **Sprachen:** Deutsch/Englisch. Deutscher Text ist der Schlüssel: `tr("…")`, Plural `trn(n, "1 …", "{n} …")`;
  englische Texte in `lib/i18n-en.ts` (fehlender Eintrag ⇒ deutscher Text). Sprache/Einheiten auf Modulebene
  (`lib/i18n.ts`) und per Provider (`lib/i18n-react.tsx`, `useI18n()` in Komponenten aufrufen, damit sie bei
  einem Wechsel neu zeichnen). Ortsnamen kommen lokalisiert vom Server; ein Sprachwechsel lädt neu.
- **Einheiten:** intern immer metrisch; Anzeige über `fmtTemp`, `fmtDist`, `fmtSpeed`, `fmtPrecip`. Imperial
  automatisch für en-US/LR/MM, umschaltbar in der Top-Bar.
- **PWA:** `public/manifest.webmanifest`, Icons in `public/icons/`, Service Worker `public/sw.js`
  (Seiten network-first, statische Dateien cache-first, `/api/` nie gecacht), Registrierung in `ClientRoot.tsx`
  nur im Produktions-Build. Installieren-Button in der Top-Bar, sobald der Browser es anbietet.
- **Aktivitätsprofile** (`lib/profiles.ts`): Wandern, Strand, Städtetrip, Rad, Wein, Wellness – setzen saisonale
  Filterwerte, danach frei anpassbar.
- **Start-Leiste** (`components/StartBar.tsx`) in der Top-Bar: Startort (Eingabe/GPS), Umkreis und „Meine Suchen“ –
  die erste Funktion auf Desktop und Handy. Auf schmalen Bildschirmen (< 640 px) kompakt: Platzhalter „Startort“,
  Umkreis nur „200 km“ (sonst bleiben fürs Startort-Feld < 80 px, Test A6 misst das). Eine Freitext-Suche gibt es nicht mehr (kommt ggf. mit der KI-Suche zurück).
- **Meine Suchen** (`lib/presets.ts`, `components/SavedSearches.tsx`): bis zu 12 Vorlagen mit Startort, Umkreis und
  allen Filtern, **ohne Zeitraum** (Laden behält den Zeitraum). Nur im Browser (`localStorage` `sunify:presets`),
  kein Konto. Gleicher Name überschreibt. Eine Vorlage kann Start-Vorlage (★) sein: Reihenfolge beim Öffnen
  geteilter Link (Such-Parameter in der URL) > Start-Vorlage > leerer Start. Ohne Startort zeigt die Startseite
  die Vorlagen als Schnellwahl.
- **Einführung** (`components/OnboardingTour.tsx`): beim ersten Besuch Willkommen (Zweck der Seite), dann 5 Schritte
  mit abgedunkelter Seite, Markierung und Pfeil (Startort, Umkreis, Filter, Ergebnisse, Meine Suchen; Ziele per
  `data-tour`/`data-testid`, Handy-Ziele als Ausweichziel). Merker `localStorage` `sunify:tour`; „?“ in der Top-Bar
  startet sie erneut. Tests: `openApp` markiert sie als gesehen, nur `{ tour: true }` zeigt sie.
- **Logo/Schriftzug** in der Top-Bar (`data-testid="home"`): komplett zurück auf Start – kein Startort, alle Filter
  auf Standard, keine Start-Vorlage, offene Ansichten zu.
- **Tests mit `page.route`** (Suche anhalten/verändern): `test.use({ serviceWorkers: "block" })`, sonst holt der
  Service Worker die Anfrage am Test vorbei.
- **Startzustand:** kein Startort (außer es gibt eine Start-Vorlage), alle Wetter-Regler auf „egal“ (Temperatur ganz links, Wind ganz rechts,
  Regen egal, 0 Std. Sonne); gesucht wird erst mit Startort. „Zurücksetzen“ behält den Startort.
- Während eine Suche läuft (`pending`), zeigen Buttons und Legende „Suche läuft …“ statt der alten Trefferzahl,
  die alte Liste wird abgeblendet.
- Desktop: Filter links, Karte ~60 %, Liste ~40 %. Mobil: Vollbild-Karte, Bottom-Sheet, Filter als Vollbild-Sheet.
- Karten-Pills `☀️ 18°C | Ort`; Fast-Treffer gestrichelt gelb mit Prozentwert (`.is-near`, `.pct`); Sammel-Pills bei
  Überlappung. Graue Punkte = bekannte Orte (Score ≥ 35) im Radius, deren Wetter nicht passt, gleichmäßig verteilt
  (je Kartenzelle ~Radius/400 km der bekannteste); kommen aus derselben Abfrage (`is_match = false`).
- Fast-Treffer nennen in der Liste den Grund (`nearMissReasons`, z. B. „Sa: 19 °C statt mind. 20 °C“).
- Ab Prognosetag 8 (`isUncertainDay`): Hinweis über der Liste, Tages-Chips gestrichelt, „Trend“ in der Detailansicht.
- Detailansicht zeigt Vor- und Folgetag immer – ohne Daten als Platzhalter.
- Farben: Grün = erfüllt, Gelb = im Toleranzbereich, Rot = verfehlt.
- Datumswerte immer als lokale `YYYY-MM-DD`-Strings über `lib/dates.ts`. Prognose: 16 Tage.
- Die App rendert nur im Browser (`ssr: false`), weil Leaflet `window` braucht.
- Quellenangaben (Open-Meteo CC BY 4.0, NOAA GFS/dynamical.org, GeoNames, Wikidata, Wikimedia Commons, OSM)
  stehen unter der Ergebnisliste und müssen bleiben.

## Projektstruktur (Auszug)

| Pfad | Inhalt |
|---|---|
| `components/SunifyApp.tsx` | UI-State, Layout, Top-Bar mit Sprache/Einheiten/Installieren |
| `components/StartBar.tsx` | Startort (Vorschläge, Geocoding, GPS) und Umkreis in der Top-Bar |
| `components/SavedSearches.tsx` | „Meine Suchen“: Menü zum Speichern/Laden/Löschen, Start-Vorlage |
| `components/OnboardingTour.tsx` | Einführung für Erstbesucher (Willkommen + Schritte mit Markierung) |
| `components/FilterPanel.tsx` | Profile, Zeitraum, Wunschwetter, Toleranz, Orts-Charakter |
| `components/ResultList.tsx` | Ergebniskarten mit Foto (`PhotoHeader`), Fast-Treffer-Abschnitt |
| `components/DetailDrawer.tsx` | Detail mit Foto, Tages-Nachweis (ok/knapp/verfehlt), Route (Google/Apple Maps) |
| `components/SettingsSwitch.tsx` | DE/EN, °C/°F, „App installieren“ |
| `services/searchService.ts` | Validierung, `search_destinations_v2` (Treffer + graue Punkte), danach EINE Abfrage für Stammdaten/Prognosen, Lockerungsvorschläge (parallel, Zeitbudget 8 s per `SET LOCAL statement_timeout` – abgelaufene Zählungen bricht die DB ab, Pool max. 4); `meta.timings` |
| `pipeline/` | Python: `seed.py`, `grid.py`, `scoring.py`, `wikidata.py`, `gfs.py`, `openmeteo.py`, `weather.py` |
| `e2e/` | Testbibliothek: `TESTFAELLE.md` (Katalog), `*.spec.ts` (Playwright), `helpers.ts` |
| `components/UpdateNotice.tsx` | Update-Erkennung nach neuen Veröffentlichungen |
| `scripts/` | Einrichtungshilfen (GitHub-/Netlify-Secrets, Sicherheitsprüfung) |

## Windows-Hilfen (Doppelklick)

| Datei | Zweck |
|---|---|
| `start-sunify.bat` | Lokaler Entwicklungsserver (http://localhost:3000) |
| `setup-github.bat` | Einmalig: Git/GitHub einrichten, v1.0 sichern, Repo anlegen |
| `save-v2.bat` | Aktuellen Stand prüfen, committen und zu GitHub hochladen (löst Veröffentlichung aus) |
| `run-db-setup.bat` | Datenbank 2.0 bei GitHub einrichten (1–3 h) |
| `setup-netlify.bat` | Einmalig: Netlify-Website anlegen, Secrets setzen, erste Veröffentlichung |
| `run-tests.bat` | Testbibliothek ausführen: online, lokal oder bei GitHub; öffnet den Bericht |

## Befehle

```
npm install        # Abhängigkeiten
npm run dev        # Entwicklungsserver
npm run build      # Produktions-Build inkl. Typprüfung
npm run test:e2e   # Testbibliothek (SUNIFY_URL=… für die Online-Version), Bericht: npm run test:e2e:report
python -m pipeline migrate|seed|weather-gfs|weather-om|status   # Datenjobs (braucht DATABASE_URL)
```

## Backlog (bei der nächsten Änderung mit erledigen)

- (leer)

## Später

- Wetter-Alarm (Benachrichtigung, wenn das Wunschwetter auftaucht) und KI-Freitextsuche (LLM mit Structured
  Output, liefert Teil-Filter; der frühere Regel-Parser `lib/aiParse.ts` liegt im Git-Verlauf).
