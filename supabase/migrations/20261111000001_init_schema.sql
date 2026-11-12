-- Sunify · Phase 1 · Datenbank-Schema (Kapitel 5 der Spezifikation)
-- Weather-First-Architektur: Wetter hängt an Rasterpunkten, Orte verweisen per grid_id darauf.
-- Das Skript ist idempotent und kann gefahrlos mehrfach ausgeführt werden.

-- 1. Erweiterungen aktivieren
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Wetter-Rasterpunkte (Grid Cells)
CREATE TABLE IF NOT EXISTS weather_grid (
  grid_id      SERIAL PRIMARY KEY,
  lat          DOUBLE PRECISION NOT NULL,
  lon          DOUBLE PRECISION NOT NULL,
  geom         GEOGRAPHY(Point, 4326) NOT NULL,
  elevation    INTEGER,
  region_code  VARCHAR(10),                 -- z. B. 'DE', 'AT', 'CH'
  last_updated TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_weather_grid_geom ON weather_grid USING GIST (geom);

-- 3. Tägliche Wetterprognosen pro Rasterpunkt (14 Tage im Voraus)
CREATE TABLE IF NOT EXISTS weather_forecasts_daily (
  id                      BIGSERIAL PRIMARY KEY,
  grid_id                 INTEGER NOT NULL REFERENCES weather_grid(grid_id) ON DELETE CASCADE,
  forecast_date           DATE NOT NULL,
  temp_max                REAL NOT NULL,    -- Maximale Tagestemperatur in °C
  temp_min                REAL NOT NULL,    -- Minimale Tagestemperatur in °C
  precipitation_sum       REAL NOT NULL,    -- Niederschlagssumme in mm
  precipitation_prob      INTEGER,          -- Niederschlagswahrscheinlichkeit in %
  wind_speed_max          REAL NOT NULL,    -- Maximale Windgeschwindigkeit in km/h
  sunshine_duration_hours REAL,             -- Sonnenscheindauer in Stunden
  weather_code            INTEGER NOT NULL, -- WMO Weather Interpretation Code (für Icons)
  UNIQUE (grid_id, forecast_date)
);

CREATE INDEX IF NOT EXISTS idx_forecasts_date_criteria
  ON weather_forecasts_daily (forecast_date, temp_max, precipitation_sum, wind_speed_max);

-- 4. Orte & Ausflugsziele (Destinations)
CREATE TABLE IF NOT EXISTS destinations (
  destination_id SERIAL PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  country_code   VARCHAR(2) NOT NULL,
  admin_region   VARCHAR(100),              -- Bundesland / Kanton / Region
  lat            DOUBLE PRECISION NOT NULL,
  lon            DOUBLE PRECISION NOT NULL,
  geom           GEOGRAPHY(Point, 4326) NOT NULL,
  population     INTEGER DEFAULT 0,
  tourism_score  INTEGER DEFAULT 50,        -- 0 bis 100 (touristische Attraktivität)
  tags           TEXT[],                    -- z. B. ARRAY['mountains', 'lake', 'hiking', 'historic', 'wine']
  grid_id        INTEGER NOT NULL REFERENCES weather_grid(grid_id)
);

CREATE INDEX IF NOT EXISTS idx_destinations_geom ON destinations USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_destinations_grid_id ON destinations (grid_id);
CREATE INDEX IF NOT EXISTS idx_destinations_score ON destinations (tourism_score DESC, population DESC);

-- 5. Zugriffsschutz (Ergänzung zur Spezifikation)
-- Supabase stellt Tabellen im Schema "public" automatisch über die REST-API bereit.
-- Mit Row Level Security dürfen anonyme Clients nur lesen; geschrieben wird ausschließlich
-- serverseitig (Seed-Skript, Wetter-Sync) mit der Datenbank-Rolle des Projekts.
ALTER TABLE weather_grid ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_forecasts_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Oeffentlich lesbar" ON weather_grid;
CREATE POLICY "Oeffentlich lesbar" ON weather_grid FOR SELECT USING (true);

DROP POLICY IF EXISTS "Oeffentlich lesbar" ON weather_forecasts_daily;
CREATE POLICY "Oeffentlich lesbar" ON weather_forecasts_daily FOR SELECT USING (true);

DROP POLICY IF EXISTS "Oeffentlich lesbar" ON destinations;
CREATE POLICY "Oeffentlich lesbar" ON destinations FOR SELECT USING (true);
