-- Sunify · Phase 1 · Such-Algorithmus (Kapitel 7 der Spezifikation)
-- Strikte "Alle-Tage-müssen-passen"-Logik: Ein Ort ist nur dann ein Treffer, wenn die
-- Kriterien an JEDEM einzelnen Tag des Zeitraums erfüllt sind.

CREATE OR REPLACE FUNCTION search_weather_destinations(
  p_lat           DOUBLE PRECISION,
  p_lon           DOUBLE PRECISION,
  p_radius_meters DOUBLE PRECISION,
  p_start_date    DATE,
  p_end_date      DATE,
  p_min_temp      REAL,
  p_max_precip    REAL,
  p_max_wind      REAL,
  p_min_sunshine  REAL,
  p_limit         INTEGER DEFAULT 100
)
RETURNS TABLE (
  destination_id  INTEGER,
  name            VARCHAR,
  admin_region    VARCHAR,
  country_code    VARCHAR,
  lat             DOUBLE PRECISION,
  lon             DOUBLE PRECISION,
  distance_km     REAL,
  tourism_score   INTEGER,
  population      INTEGER,
  tags            TEXT[],
  avg_temp_max    REAL,
  total_precip    REAL,
  max_wind        REAL,
  avg_sunshine    REAL,
  daily_forecasts JSONB
) AS $$
DECLARE
  v_required_days INTEGER;
  v_origin        GEOGRAPHY;
BEGIN
  -- Anzahl der Tage im gewählten Zeitraum berechnen (inklusive Start- und Endtag)
  v_required_days := (p_end_date - p_start_date) + 1;
  v_origin := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::GEOGRAPHY;

  RETURN QUERY
  WITH grids_in_radius AS (
    -- Schritt 1: Finde alle Rasterpunkte im Suchradius (plus 20 km Toleranzpuffer)
    SELECT g.grid_id
    FROM weather_grid g
    WHERE ST_DWithin(g.geom, v_origin, p_radius_meters + 20000)
  ),
  matching_grids AS (
    -- Schritt 2: Prüfe, welche Rasterpunkte an ALLEN Tagen die Kriterien erfüllen
    SELECT
      f.grid_id,
      AVG(f.temp_max)::REAL AS avg_temp_max,
      SUM(f.precipitation_sum)::REAL AS total_precip,
      MAX(f.wind_speed_max)::REAL AS max_wind,
      AVG(f.sunshine_duration_hours)::REAL AS avg_sunshine,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'date', f.forecast_date,
          'tempMax', ROUND(f.temp_max::numeric, 1),
          'tempMin', ROUND(f.temp_min::numeric, 1),
          'precip', ROUND(f.precipitation_sum::numeric, 1),
          'wind', ROUND(f.wind_speed_max::numeric, 1),
          'sunshine', ROUND(f.sunshine_duration_hours::numeric, 1),
          'weatherCode', f.weather_code
        ) ORDER BY f.forecast_date
      ) AS daily_forecasts
    FROM weather_forecasts_daily f
    INNER JOIN grids_in_radius gir ON f.grid_id = gir.grid_id
    WHERE f.forecast_date BETWEEN p_start_date AND p_end_date
      AND f.temp_max >= p_min_temp
      AND f.precipitation_sum <= p_max_precip
      AND f.wind_speed_max <= p_max_wind
      AND COALESCE(f.sunshine_duration_hours, 0) >= p_min_sunshine
    GROUP BY f.grid_id
    HAVING COUNT(f.forecast_date) = v_required_days
  )
  -- Schritt 3: Hole die besten Orte innerhalb des exakten Radius in den Gewinner-Rastern
  SELECT
    d.destination_id,
    d.name,
    d.admin_region,
    d.country_code,
    d.lat,
    d.lon,
    ROUND((ST_Distance(d.geom, v_origin) / 1000.0)::numeric, 1)::REAL AS distance_km,
    d.tourism_score,
    d.population,
    d.tags,
    mg.avg_temp_max,
    mg.total_precip,
    mg.max_wind,
    mg.avg_sunshine,
    mg.daily_forecasts
  FROM destinations d
  INNER JOIN matching_grids mg ON d.grid_id = mg.grid_id
  WHERE ST_DWithin(d.geom, v_origin, p_radius_meters)
  ORDER BY d.tourism_score DESC, mg.avg_temp_max DESC, d.population DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
