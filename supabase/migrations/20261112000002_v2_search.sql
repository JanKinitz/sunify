-- Sunify 2.0 · Suche mit Toleranzstufen und Höhenkorrektur
--
-- Toleranz:
--   0 = strikt          jeder Tag erfüllt alle Kriterien exakt
--   1 = etwas flexibel  jeder Tag erfüllt alle Kriterien mit kleinem Spielraum
--   2 = flexibel        größerer Spielraum, und bei mehrtägigen Zeiträumen darf ein Teil der Tage abweichen
-- Höhenkorrektur: Tageswerte gelten für die mittlere Höhe der Orte im Rasterpunkt; für jeden Ort wird die
-- Temperatur mit 0,65 °C pro 100 m auf seine eigene Höhe umgerechnet (begrenzt auf ±8 °C).

DROP FUNCTION IF EXISTS search_destinations_v2(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DATE, DATE, REAL, REAL, REAL, REAL, SMALLINT, TEXT[], INTEGER);

CREATE FUNCTION search_destinations_v2(
  p_lat           DOUBLE PRECISION,
  p_lon           DOUBLE PRECISION,
  p_radius_meters DOUBLE PRECISION,
  p_start_date    DATE,
  p_end_date      DATE,
  p_min_temp      REAL,
  p_max_precip    REAL,       -- NULL = Niederschlag egal
  p_max_wind      REAL,
  p_min_sunshine  REAL,
  p_tolerance     SMALLINT DEFAULT 0,
  p_tags          TEXT[] DEFAULT NULL,  -- NULL = alle Orts-Typen
  p_limit         INTEGER DEFAULT 100
)
RETURNS TABLE (
  destination_id  INTEGER,
  grid_id         INTEGER,
  distance_km     REAL,
  tourism_score   SMALLINT,
  population      INTEGER,
  temp_correction REAL,
  strict_match    BOOLEAN,
  match_pct       SMALLINT,
  avg_temp_max    REAL,
  total_precip    REAL,
  max_wind        REAL,
  avg_sunshine    REAL,
  total_count     INTEGER
)
LANGUAGE plpgsql STABLE
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_days     INTEGER := (p_end_date - p_start_date) + 1;
  v_origin   GEOGRAPHY := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::GEOGRAPHY;
  v_precip   REAL := COALESCE(p_max_precip, 1e6);
  -- Spielraum je Toleranzstufe
  v_dt       REAL := CASE p_tolerance WHEN 1 THEN 2   WHEN 2 THEN 3   ELSE 0 END;  -- °C kälter
  v_dp       REAL := CASE p_tolerance WHEN 1 THEN 1   WHEN 2 THEN 3   ELSE 0 END;  -- mm mehr Regen
  v_dw       REAL := CASE p_tolerance WHEN 1 THEN 10  WHEN 2 THEN 15  ELSE 0 END;  -- km/h mehr Wind
  v_ds       REAL := CASE p_tolerance WHEN 1 THEN 1.5 WHEN 2 THEN 2.5 ELSE 0 END;  -- Std. weniger Sonne
  v_fail     INTEGER := CASE WHEN p_tolerance = 2 AND v_days >= 2 THEN GREATEST(1, v_days / 4) ELSE 0 END;
BEGIN
  IF v_days < 1 OR v_days > 16 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH grids AS (
    -- Rasterpunkte im Radius (+80 km für die größten Zellen), deren Prognose den Zeitraum abdeckt
    SELECT g.grid_id, g.elevation AS grid_elev, f.start_date, f.temp_max, f.precip, f.wind_max, f.sunshine
    FROM weather_grid g
    JOIN weather_forecasts f ON f.grid_id = g.grid_id
    WHERE ST_DWithin(g.geom, v_origin, p_radius_meters + 80000)
      AND f.start_date <= p_start_date
      AND f.start_date + array_length(f.temp_max, 1) - 1 >= p_end_date
  ),
  dest AS (
    SELECT d.destination_id, d.grid_id, d.tourism_score, d.population,
           (ST_Distance(d.geom, v_origin) / 1000.0)::REAL AS distance_km,
           LEAST(8, GREATEST(-8, (COALESCE(gr.grid_elev, d.elevation, 0) - COALESCE(d.elevation, gr.grid_elev, 0)) * 0.0065))::REAL AS corr,
           gr.start_date, gr.temp_max, gr.precip, gr.wind_max, gr.sunshine
    FROM destinations d
    JOIN grids gr ON gr.grid_id = d.grid_id
    WHERE ST_DWithin(d.geom, v_origin, p_radius_meters)
      AND (p_tags IS NULL OR d.tags && p_tags)
  ),
  matched AS (
    -- Tageswerte je Ort in einem Durchgang (LATERAL) auswerten, ohne "dest" ein zweites Mal zu verwenden.
    -- Die frühere Fassung verband die Zwischentabelle mit sich selbst; bei großen Radien (Tausende Orte)
    -- dauerte die Suche damit 15–25 s.
    SELECT ds.destination_id, ds.grid_id, ds.distance_km, ds.tourism_score, ds.population, ds.corr,
           (sc.strict_days = v_days) AS strict_match,
           ROUND(100.0 * sc.ok_checks / (4 * v_days))::SMALLINT AS match_pct,
           sc.avg_t, sc.sum_p, sc.max_w, sc.avg_s
    FROM dest ds
    CROSS JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE dy.t >= p_min_temp AND dy.p <= v_precip AND dy.w <= p_max_wind AND dy.s >= p_min_sunshine) AS strict_days,
             COUNT(*) FILTER (WHERE dy.t >= p_min_temp - v_dt AND dy.p <= v_precip + v_dp AND dy.w <= p_max_wind + v_dw AND dy.s >= p_min_sunshine - v_ds) AS loose_days,
             SUM((dy.t >= p_min_temp)::INT + (dy.p <= v_precip)::INT + (dy.w <= p_max_wind)::INT + (dy.s >= p_min_sunshine)::INT) AS ok_checks,
             AVG(dy.t)::REAL AS avg_t, SUM(dy.p)::REAL AS sum_p, MAX(dy.w)::REAL AS max_w, AVG(dy.s)::REAL AS avg_s
      FROM (
        SELECT ds.temp_max[i] + ds.corr AS t, ds.precip[i] AS p, ds.wind_max[i] AS w, COALESCE(ds.sunshine[i], 0) AS s
        FROM generate_series(p_start_date - ds.start_date + 1, p_end_date - ds.start_date + 1) AS i
      ) dy
    ) sc
    WHERE sc.loose_days >= v_days - v_fail
  )
  SELECT m.destination_id, m.grid_id, ROUND(m.distance_km::NUMERIC, 1)::REAL, m.tourism_score, m.population,
         ROUND(m.corr::NUMERIC, 1)::REAL, m.strict_match, m.match_pct,
         ROUND(m.avg_t::NUMERIC, 1)::REAL, ROUND(m.sum_p::NUMERIC, 1)::REAL, ROUND(m.max_w::NUMERIC, 0)::REAL, ROUND(m.avg_s::NUMERIC, 1)::REAL,
         (COUNT(*) OVER ())::INTEGER
  FROM matched m
  ORDER BY m.strict_match DESC, m.match_pct DESC, m.tourism_score DESC, m.avg_t DESC, m.population DESC
  LIMIT p_limit;
END;
$$;
