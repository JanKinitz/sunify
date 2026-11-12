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
5. **Zugangsdaten** nur in `.env.local` bzw. als GitHub-/Netlify-Secrets. Nie ausgeben, nie committen.
   Vor jedem Commit läuft `scripts/git-safety-check.mjs`. Das Repository ist **öffentlich**.
6. **Affiliate:** Booking.com-Deep-Link mit Ort, Koordinaten, Check-in/Check-out in der App-Sprache
   (`utils/affiliateLinks.ts`). Einzelner Tag ⇒ Check-out = Start + 1 Tag.

## Architektur 2.0

| Teil | Wo | Was |
|---|---|---|
| App | Netlify (gratis, kommerziell erlaubt) | Next.js 15, `POST /api/search`, `GET /api/status` |
| Datenjobs | GitHub Actions (öffentliches Repo ⇒ unbegrenzte Minuten) | Python-Pipeline `pipeline/` |
| Datenbank | Supabase (eigenes Projekt für 2.0) | PostGIS, Migrationen in `supabase/migrations/` |

Workflows (`.github/workflows/`; Quelle: `scripts/github-workflows/`, `save-v2.bat` kopiert sie – Claude kann `.github` auf dem Rechner nicht direkt beschreiben):
- `db-setup.yml` (manuell, `run-db-setup.bat`): migrate → seed → weather-om → weather-gfs → status.
- `weather-gfs.yml`: 4× täglich (05:40, 11:40, 17:40, 23:40 UTC) NOAA GFS weltweit, 16 Tage.
- `weather-openmeteo.yml`: täglich 04:15 UTC Open-Meteo für Mitteleuropa (Box 43–56° N, 2–20° O, max. 8.000 Punkte).
- `deploy-netlify.yml`: bei jedem Push auf `main` (Secrets `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`).

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
- Desktop: Filter links, Karte ~60 %, Liste ~40 %. Mobil: Vollbild-Karte, Bottom-Sheet, Filter als Vollbild-Sheet.
- Karten-Pills `☀️ 18°C | Ort`; Fast-Treffer gestrichelt gelb (`.is-near`); Sammel-Pills bei Überlappung.
- Farben: Grün = erfüllt, Gelb = im Toleranzbereich, Rot = verfehlt.
- Datumswerte immer als lokale `YYYY-MM-DD`-Strings über `lib/dates.ts`. Prognose: 16 Tage.
- Die App rendert nur im Browser (`ssr: false`), weil Leaflet `window` braucht.
- Quellenangaben (Open-Meteo CC BY 4.0, NOAA GFS/dynamical.org, GeoNames, Wikidata, Wikimedia Commons, OSM)
  stehen unter der Ergebnisliste und müssen bleiben.

## Projektstruktur (Auszug)

| Pfad | Inhalt |
|---|---|
| `components/SunifyApp.tsx` | UI-State, Layout, Top-Bar mit Sprache/Einheiten/Installieren |
| `components/FilterPanel.tsx` | Profile, Standort & Radius, Zeitraum, Wunschwetter, Toleranz, Orts-Charakter |
| `components/ResultList.tsx` | Ergebniskarten mit Foto (`PhotoHeader`), Fast-Treffer-Abschnitt |
| `components/DetailDrawer.tsx` | Detail mit Foto, Tages-Nachweis (ok/knapp/verfehlt), Conversion-Box |
| `components/SettingsSwitch.tsx` | DE/EN, °C/°F, „App installieren“ |
| `services/searchService.ts` | Validierung, `search_destinations_v2`, Prognosen je Raster, Lockerungsvorschläge |
| `pipeline/` | Python: `seed.py`, `grid.py`, `scoring.py`, `wikidata.py`, `gfs.py`, `openmeteo.py`, `weather.py` |
| `scripts/` | Einrichtungshilfen (GitHub-/Netlify-Secrets, Sicherheitsprüfung) |

## Windows-Hilfen (Doppelklick)

| Datei | Zweck |
|---|---|
| `start-sunify.bat` | Lokaler Entwicklungsserver (http://localhost:3000) |
| `setup-github.bat` | Einmalig: Git/GitHub einrichten, v1.0 sichern, Repo anlegen |
| `save-v2.bat` | Aktuellen Stand prüfen, committen und zu GitHub hochladen (löst Veröffentlichung aus) |
| `run-db-setup.bat` | Datenbank 2.0 bei GitHub einrichten (1–3 h) |
| `setup-netlify.bat` | Einmalig: Netlify-Website anlegen, Secrets setzen, erste Veröffentlichung |

## Befehle

```
npm install        # Abhängigkeiten
npm run dev        # Entwicklungsserver
npm run build      # Produktions-Build inkl. Typprüfung
python -m pipeline migrate|seed|weather-gfs|weather-om|status   # Datenjobs (braucht DATABASE_URL)
```

## Später

- Wetter-Alarm (Benachrichtigung, wenn das Wunschwetter auftaucht) und echte KI-Freitextsuche
  (`lib/aiParse.ts` → LLM mit Structured Output; Rückgabe-Struktur bleibt gleich).
