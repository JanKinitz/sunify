# Sunify – Projektregeln für Claude

Wetter-Rückwärtssuche: „Wo im Umkreis von X km herrscht im Zeitraum Y mein Wunschwetter?“
Vollständige Spezifikation: `SPEC.md` (Markdown-Fassung des Word-Dossiers im selben Ordner).

## Aktueller Stand

- **Phase 0 – UI-First Click-Dummy:** abgenommen. UI/UX, Layout und Komponenten bleiben exakt so.
- **Phase 1 – Datenbank & räumliches Raster:** Code fertig (Migrationen, Seed-Skript).
  Ausführung gegen die Datenbank per `setup-database.bat` bzw. `npm run db:setup`.
- **Phase 2 – Open-Meteo Batch-Sync:** Code fertig (`services/weatherSync.ts`, Cron-Route, CLI).
- **Phase 3 – End-to-End-Suche:** `POST /api/search` auf der Datenbank, Frontend angebunden, Geocoding über Photon.
- Phase 4 (echte KI-Freitextsuche) folgt nach Freigabe.

## Harte Regeln

1. **UI-First:** Das in Phase 0 abgenommene UI/Layout bleibt in allen späteren Phasen unverändert.
2. **Phasenweise vorgehen:** Nach jeder Phase stoppen und auf die Freigabe des Product Owners warten.
3. **Weather-First statt City-First:** Wetter hängt an Rasterpunkten (~25 × 25 km), nicht an Orten.
   Jeder Ort hat eine feste `grid_id`. Ein Cronjob lädt alle 6 h die 14-Tage-Prognose von Open-Meteo
   (100er-Batches, UPSERT). **Bei einer Nutzersuche gibt es keine externen Wetter-API-Calls** – die Suche
   läuft zu 100 % auf der eigenen PostgreSQL/PostGIS-Datenbank (Ziel: < 200 ms).
4. **„Alle Tage müssen passen“:** Ein Ort ist nur Treffer, wenn *jeder* Tag im Zeitraum *alle* Kriterien erfüllt
   (Tageshöchsttemperatur ≥ Min, Niederschlag ≤ Max, Wind ≤ Max, Sonnenstunden ≥ Min).
   SQL: `HAVING COUNT(forecast_date) = required_days`. Client-Nachbildung: `lib/search.ts`.
5. **Ranking:** Standard-Sortierung nach `tourism_score` (dann Temperatur, dann Einwohner) –
   charmante Ausflugsziele vor Großstädten.
6. **Nie eine leere Ergebnisseite:** Bei 0 Treffern den Smart Empty State mit 1-Klick-Lockerungen zeigen
   (Radius +100 km, Temperatur senken, …) inkl. Trefferzahl.
7. **Affiliate:** Booking.com-Deep-Link mit Ort, Koordinaten, Check-in/Check-out (`utils/affiliateLinks.ts`).
   Einzelner Tag ⇒ Check-out = Start + 1 Tag. Affiliate-ID über `NEXT_PUBLIC_BOOKING_AFFILIATE_ID`.

## Tech-Stack

- Next.js (App Router) · TypeScript · React · Tailwind CSS 3 · Lucide Icons
- Karte: React-Leaflet + OpenStreetMap-Standardkacheln (kein Key; CARTO verlangt inzwischen einen API-Key)
- Später: Supabase (PostgreSQL + PostGIS, pg_cron), Open-Meteo, GeoNames, Photon-Geocoding, LLM mit Structured Output

## Projektstruktur

| Pfad | Inhalt |
|---|---|
| `app/` | Layout, globale Styles, Einstiegsseite |
| `components/SunifyApp.tsx` | Gesamter UI-State, Layout (Filter · Karte 60 % · Liste 40 %, mobil Bottom-Sheet) |
| `components/FilterPanel.tsx` | Screen 1: Such- & Filter-Cockpit |
| `components/AiSearchBar.tsx` | KI-Smart-Prompt-Leiste (Phase 0: Simulation) |
| `components/MapView.tsx` | Screen 2: Karte, Radius-Kreis, Wetter-Pill-Marker |
| `components/ResultList.tsx` | Screen 3: Ergebniskarten + Sortierung |
| `components/DetailDrawer.tsx` | Screen 4: Detail, Wetter-Timeline, Conversion-Box |
| `components/EmptyState.tsx` | Screen 5: Smart Empty State |
| `components/FavoritesDrawer.tsx` | Screen 6: Merkliste & Teilen |
| `data/mockDestinations.ts` | Mock-Daten aus Phase 0 – seit Phase 3 von der App nicht mehr verwendet |
| `app/api/search/route.ts` | `POST /api/search` (Request-Format aus Kapitel 7 + `category`, `favoriteIds`) |
| `services/searchService.ts` | Validierung, Aufruf von `search_weather_destinations`, Nicht-Treffer, Prognosen je Raster, Fast-Treffer |
| `services/db.ts` | Geteilter `pg`-Verbindungs-Pool für API-Routen |
| `lib/api.ts` | Client für `/api/search`; wandelt die Antwort in die UI-Typen aus Phase 0 um |
| `lib/geocode.ts` | Startort-Suche über Photon (direkt aus dem Browser) |
| `lib/origins.ts`, `lib/season.ts` | Häufige Startorte, saisonale Normalwerte |
| `lib/search.ts` | Filter-, Sortier- und Fast-Treffer-Logik (spiegelt die SQL-Funktion aus Kapitel 7) |
| `lib/filters.ts` | Standardwerte, URL-Query-Parameter („Suche teilen“) |
| `lib/aiParse.ts` | Regel-Parser als Platzhalter für `POST /api/ai-parse-query` (Phase 4) |
| `lib/dates.ts`, `lib/weather.ts` | Datums- und Wetter-Darstellungshelfer |
| `utils/affiliateLinks.ts` | Booking.com-, Camping- und Routen-Links (Kapitel 8) |
| `supabase/migrations/` | SQL-Schema (Kapitel 5, inkl. RLS-Leserechte) und `search_weather_destinations` (Kapitel 7) |
| `scripts/migrate.ts` | Führt alle Migrationen aus (idempotent) |
| `scripts/seed-grid-and-cities.ts` | Raster generieren, Orte importieren, `grid_id` zuordnen (im Dossier teils `seed-locations.ts` genannt) |
| `services/weatherSync.ts` | Open-Meteo-Sync: 100er-Batches, UPSERT, Wiederholung bei HTTP 429/5xx, Sperre gegen Parallelläufe |
| `app/api/cron/sync-weather/route.ts` | Geschützte Cron-Route (`Authorization: Bearer $CRON_SECRET`), Zeitplan in `vercel.json` |
| `scripts/sync-weather.ts` | Sync von der Kommandozeile (`npm run weather:sync`) |
| `scripts/ensure-cron-secret.ts` | Legt `CRON_SECRET` in `.env.local` an, falls es fehlt |
| `scripts/check-db.ts` | Zählt Tabellen, Stichprobe um Stuttgart, Testaufruf der Suchfunktion |
| `scripts/lib/` | `db.ts` (Verbindung über `DATABASE_URL`), `grid.ts`, `geonames.ts`, `tourism.ts` |
| `scripts/data/curatedDestinations.ts` | ~125 von Hand bewertete Top-Ausflugsziele (Score 72–96, Tags) |

## Design- und UX-Regeln

- Sprache der Oberfläche: Deutsch. Einheiten: °C, mm, km/h, Stunden, km.
- Desktop (≥ 1024 px): Filter-Spalte links, Karte ~60 %, Ergebnisliste ~40 %.
  Mobil: Vollbild-Karte, schwebender Button „Liste anzeigen (n Treffer)“, ausziehbares Bottom-Sheet, Filter als Vollbild-Sheet.
- Karten-Marker sind Wetter-Pills `☀️ 18°C | Ortsname`; Orte im Radius ohne Treffer als gedimmte Punkte.
- Der Radius-Kreis folgt dem Slider in Echtzeit (50–500 km, Standard 200 km).
- Farben: `sun` (Orange, Primäraktion) und `ink` (Nachtblau, Text/Flächen) aus `tailwind.config.ts`;
  Grün = Kriterium erfüllt, Rot = verfehlt. Temperatur-Skala kühl/blau → warm/orange.
- Filterstandards sind jahreszeitabhängig (`seasonalNormals`), damit die erste Suche Treffer zeigt.
- Zustand: Filter in den URL-Query-Parametern, Favoriten in `localStorage` (`sunify:favorites`).
- Datumswerte immer als lokale `YYYY-MM-DD`-Strings über `lib/dates.ts` (keine `toISOString()`-Umwege).
- Die App rendert nur im Browser (`ssr: false` in `components/ClientRoot.tsx`), weil Leaflet `window` braucht.

## Datenbank (Phase 1)

- Verbindung ausschließlich über `DATABASE_URL` in `.env.local` (Vorlage: `.env.example`).
  Supabase (Session-Pooler-URI) oder lokal per `docker compose up -d`. Zugangsdaten nie ausgeben oder committen.
- Raster: Bounding Box 45,8–55,1° N / 5,8–17,2° O, Schritt 0,25° × 0,35° ⇒ 1.254 Punkte;
  Punkte ohne zugeordneten Ort werden gelöscht.
- Orte: GeoNames `cities1000` (DE/AT/CH, ohne Ortsteile) + kuratierte Liste. Heuristischer Score max. 68,
  kuratierte Ziele 72–96. Tags: `mountains, hiking, lake, coast, historic, wine, culture, wellness`.
- `npm run db:seed` setzt alle drei Tabellen neu auf (auch Prognosen) – danach Wetter-Sync erneut ausführen.
- Tabellen haben Row Level Security mit reinen Leserechten; geschrieben wird nur serverseitig.

## Suche (Phase 3)

- Die Treffer kommen ausschließlich aus `search_weather_destinations`; Orts-Charakter wird per `tags && …` nachgefiltert.
- Die API liefert max. 100 Treffer (`RESULT_LIMIT`), die Liste zeigt „Top 100 von n“.
  Sortiert wird clientseitig innerhalb dieser Top-Liste.
- **Sammel-Pills (Karte):** Treffer, deren Pills sich auf der aktuellen Zoomstufe überdecken würden, werden zu
  einer Pill mit Trefferzahl gebündelt (`clusterResults` in `MapView.tsx`); Klick zoomt hinein, bis Einzel-Pills erscheinen.
- **Gruppen (Liste):** Treffer am selben Rasterpunkt (`gridId`, identisches Wetter) bilden eine Karte: bester Ort als
  Hauptkarte, übrige aufklappbar darunter, Karten-Button zoomt auf die Gruppe (`lib/grouping.ts`).
- Gedimmte Karten-Punkte: bis zu 40 kuratierte Ziele (Score ≥ 72) im Radius, die die Kriterien verfehlen.
- Die Antwort enthält die 14-Tage-Prognose je beteiligtem Rasterpunkt; daraus entstehen Timeline und Tages-Nachweis.
- Böen sind nicht im Schema – die Detailansicht zeigt beim Wind nur den Tageshöchstwert.
- Liste/Detail/Merkliste nutzen die Filter der zuletzt geladenen Antwort (`activeFilters`), der Radius-Kreis folgt sofort.
- Teaser, Hashtags und Emoji der Karten werden aus den Tags abgeleitet (`lib/api.ts`).

## Wetter-Sync (Phase 2)

- Quelle: `https://api.open-meteo.com/v1/forecast` (Multi-Location, `forecast_days=14`, `timezone=Europe/Berlin`).
- `sunshine_duration` kommt in Sekunden und wird als Stunden gespeichert. Tage ohne Pflichtwerte werden übersprungen.
- Ein fehlgeschlagener Batch bricht den Lauf nicht ab (Route antwortet dann mit 207 und `failedBatches`).
- Prognosen älter als gestern werden beim Sync gelöscht.
- Die Route ist ohne gesetztes `CRON_SECRET` gesperrt (503); falscher/fehlender Header ⇒ 401.

## Hosting (Vercel)

- Veröffentlichung per `deploy.bat`: Typprüfung, `vercel login`/`link`, Umgebungsvariablen aus `.env.local`
  übertragen (`scripts/vercel-env.ts`), `vercel deploy --prod`. Kein Git-Repository nötig.
- `vercel.json`: Region `fra1` (nahe der Supabase-Datenbank in Frankfurt), Cron **einmal täglich** (03:00 UTC).
  Der Hobby-Tarif erlaubt nur tägliche Crons und nur nicht-kommerzielle Nutzung; für den 6-Stunden-Abruf
  (`0 */6 * * *`) und echte Affiliate-Links ist der Pro-Tarif nötig.
- Bei Vercel benötigte Variablen: `DATABASE_URL`, `CRON_SECRET`, optional `NEXT_PUBLIC_BOOKING_AFFILIATE_ID`.

## Befehle

```
npm install        # einmalig bzw. nach neuen Abhängigkeiten
npm run dev        # Entwicklungsserver auf http://localhost:3000
npm run build      # Produktions-Build inkl. Typprüfung
npm run db:migrate # SQL-Migrationen ausführen
npm run db:seed    # Raster + Orte importieren
npm run db:check   # Datenbankstand prüfen
npm run db:setup   # migrate + seed + check
npm run weather:sync   # Wetterprognosen von Open-Meteo laden
npm run weather:secret # CRON_SECRET anlegen, falls es fehlt
```

Unter Windows: Doppelklick auf `start-sunify.bat` (App), `setup-database.bat` (Datenbank) bzw. `sync-weather.bat` (Wetterdaten).

## Übergang zu Phase 4 (nach Freigabe)

- `lib/aiParse.ts` (Regel-Parser) → `POST /api/ai-parse-query` mit LLM und Structured Output; Rückgabe-Struktur bleibt gleich.
