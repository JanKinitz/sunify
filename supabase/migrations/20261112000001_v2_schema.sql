-- Sunify 2.0 · Datenbank-Schema (weltweit, adaptives Raster, kompakte Prognosen)
-- Idempotent: kann gefahrlos mehrfach ausgeführt werden.

CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Wetter-Rasterpunkte. Nur Zellen, in denen Orte liegen; Kantenlänge 0,25°, 0,5° oder 1°
--    je nach Ortsdichte und Höhenunterschied. Der Punkt liegt auf einem Knoten des GFS-Rasters.
CREATE TABLE IF NOT EXISTS weather_grid (
  grid_id      SERIAL PRIMARY KEY,
  lat          DOUBLE PRECISION NOT NULL,
  lon          DOUBLE PRECISION NOT NULL,
  geom         GEOGRAPHY(Point, 4326) NOT NULL,
  cell_size    REAL NOT NULL,                 -- Kantenlänge der Zelle in Grad
  elevation    INTEGER,                       -- mittlere Höhe der Orte in der Zelle (Bezug für die Höhenkorrektur)
  country_code VARCHAR(2),
  source       VARCHAR(20) NOT NULL DEFAULT 'gfs', -- primäre Wetterquelle: 'open-meteo' oder 'gfs'
  utc_offset   SMALLINT NOT NULL DEFAULT 0    -- grobe Zeitzone (Stunden) für die Tagesgrenzen der GFS-Daten
);
CREATE INDEX IF NOT EXISTS idx_weather_grid_geom ON weather_grid USING GIST (geom);

-- 2. Prognosen: eine Zeile pro Rasterpunkt, Tageswerte als Arrays ab start_date (bis 16 Tage).
CREATE TABLE IF NOT EXISTS weather_forecasts (
  grid_id        INTEGER PRIMARY KEY REFERENCES weather_grid(grid_id) ON DELETE CASCADE,
  start_date     DATE NOT NULL,          -- Datum des ersten Array-Eintrags
  temp_max       REAL[] NOT NULL,        -- °C
  temp_min       REAL[] NOT NULL,        -- °C
  precip         REAL[] NOT NULL,        -- mm
  precip_prob    SMALLINT[],             -- % (nur Open-Meteo; GFS liefert keine Wahrscheinlichkeit)
  wind_max       REAL[] NOT NULL,        -- km/h
  sunshine       REAL[] NOT NULL,        -- Stunden (GFS: aus Bewölkung geschätzt)
  weather_code   SMALLINT[] NOT NULL,    -- WMO-Code
  primary_until  DATE,                   -- bis hierhin stammen die Werte aus Open-Meteo, danach aus GFS
  om_updated_at  TIMESTAMPTZ,            -- letzter Open-Meteo-Abruf
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Orte weltweit (GeoNames cities1000 + Wikidata)
CREATE TABLE IF NOT EXISTS destinations (
  destination_id  SERIAL PRIMARY KEY,
  geoname_id      INTEGER UNIQUE,
  name            VARCHAR(200) NOT NULL,
  name_de         VARCHAR(200),
  name_en         VARCHAR(200),
  country_code    VARCHAR(2) NOT NULL,
  admin_region    VARCHAR(150),
  admin_region_de VARCHAR(150),
  admin_region_en VARCHAR(150),
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  geom            GEOGRAPHY(Point, 4326) NOT NULL,
  elevation       INTEGER,
  population      INTEGER NOT NULL DEFAULT 0,
  tourism_score   SMALLINT NOT NULL DEFAULT 30,  -- 0–100
  tags            TEXT[] NOT NULL DEFAULT '{}',
  wikidata_id     VARCHAR(20),
  image_file      VARCHAR(300),                  -- Dateiname auf Wikimedia Commons
  image_author    VARCHAR(200),
  image_license   VARCHAR(80),
  grid_id         INTEGER NOT NULL REFERENCES weather_grid(grid_id)
);
CREATE INDEX IF NOT EXISTS idx_destinations_geom ON destinations USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_destinations_grid ON destinations (grid_id);
CREATE INDEX IF NOT EXISTS idx_destinations_score ON destinations (tourism_score DESC, population DESC);

-- 4. Protokoll der Datenjobs (für die Statusanzeige)
CREATE TABLE IF NOT EXISTS pipeline_runs (
  run_id      BIGSERIAL PRIMARY KEY,
  job         VARCHAR(40) NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  ok          BOOLEAN,
  summary     JSONB
);

-- 5. Nur lesender Zugriff über die öffentliche Supabase-Schnittstelle
ALTER TABLE weather_grid ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Oeffentlich lesbar" ON weather_grid;
CREATE POLICY "Oeffentlich lesbar" ON weather_grid FOR SELECT USING (true);
DROP POLICY IF EXISTS "Oeffentlich lesbar" ON weather_forecasts;
CREATE POLICY "Oeffentlich lesbar" ON weather_forecasts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Oeffentlich lesbar" ON destinations;
CREATE POLICY "Oeffentlich lesbar" ON destinations FOR SELECT USING (true);
-- pipeline_runs bleibt für die öffentliche Schnittstelle unsichtbar (keine Policy)
